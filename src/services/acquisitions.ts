import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {pool,tx} from '../db.ts';
import {bad,conflict,notFound} from '../lib/errors.ts';
import {hashCode} from '../lib/crypto.ts';
import {canDownload,canBuyerConfirm,equalDigest,signTransfer,verifyTransfer,type TransferClaim} from '../lib/acquisition.ts';
import {attestationKeys,publicVerificationKey} from './attestationKeys.ts';
import {privateBytes} from './storage.ts';
import {signingIssuer} from './passports.ts';
import {looksShielded} from './gate.ts';
import {config} from '../config.ts';
import {log,errorCode} from '../lib/log.ts';

async function lockedOrder(c:PoolClient,id:string){
  const ref=(await c.query('SELECT listing_id FROM orders WHERE id=$1',[id])).rows[0];if(!ref)throw notFound();
  await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
  const order=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!order)throw notFound();
  return order;
}
async function confirmedPayment(c:PoolClient,order:any){
  const payment=(await c.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[order.payment_id])).rows[0];
  if(!payment||payment.status!=='confirmed'||BigInt(payment.received_zat)<BigInt(payment.expected_zat))throw conflict('Payment requires reconciliation');
  return payment;
}
async function complete(c:PoolClient,order:any,outcome:TransferClaim['outcome']){
  const payment=await confirmedPayment(c,order);
  if(!order.file_sha256)throw conflict('Missing immutable asset fingerprint');
  if(order.seller_payout_zat===null)throw conflict('Missing checkout payout terms');
  const amount=BigInt(order.seller_payout_zat);
  if(amount<0n||amount>BigInt(payment.expected_zat))throw conflict('Invalid checkout payout terms');
  const finalizedAt=(await c.query('SELECT clock_timestamp() AS time')).rows[0].time.toISOString();
  await signingIssuer(c);
  const proof=signTransfer({version:1,orderId:order.id,listingId:order.listing_id,assetSha256:order.file_sha256,
    finalizedAt,outcome,paymentMode:'mock'},attestationKeys().privatePem);
  await c.query(`UPDATE orders SET status='paid',paid_at=$2::timestamptz,resolved_at=$2::timestamptz,delivery_confirmed_at=CASE WHEN $3='buyer_accepted' THEN $2::timestamptz ELSE NULL END,proof=$4 WHERE id=$1`,[order.id,finalizedAt,outcome,JSON.stringify(proof)]);
  if(amount>0n)await c.query(`INSERT INTO payouts(kind,to_address,zat,ref_id) VALUES('seller_sale',$1,$2,$3)`,[order.payout_address,amount.toString(),order.id]);
  await c.query('INSERT INTO acquisition_events(order_id,kind) VALUES($1,$2)',[order.id,outcome]);
  return {status:'paid',proof};
}
export async function confirmDelivery(buyerId:string,id:string,receipt:string,digest:string){
  return tx(async c=>{
    const order=await lockedOrder(c,id);
    if(order.buyer_id!==buyerId||!order.receipt_hash.equals(hashCode(receipt)))throw notFound();
    if(order.acquisition_version!==1||!canBuyerConfirm(order.status,!!order.file_first_accessed_at))throw conflict('Funded order and an authenticated download are required');
    if(!equalDigest(order.file_sha256,digest))throw bad('Asset SHA-256 does not match');
    return complete(c,order,'buyer_accepted');
  });
}
export async function disputeDelivery(buyerId:string,id:string,reason:string){
  if(reason.trim().length<10||reason.length>2000)throw bad('Dispute reason must be 10–2000 characters');
  return tx(async c=>{
    const order=await lockedOrder(c,id);if(order.buyer_id!==buyerId)throw notFound();
    if(order.acquisition_version!==1||order.status!=='funded')throw conflict('Only funded, unreleased acquisitions can be disputed');
    if(order.release_after&&(await c.query('SELECT $1::timestamptz<=clock_timestamp() AS passed',[order.release_after])).rows[0].passed)throw conflict('The review window has closed; this order is being released to the seller');
    await confirmedPayment(c,order);
    await c.query("UPDATE orders SET status='disputed',disputed_at=now(),dispute_due_at=now()+make_interval(days=>$3),dispute_reason=$2 WHERE id=$1",[id,reason.trim(),config.escrowDisputeDays]);
    await c.query("INSERT INTO acquisition_events(order_id,kind) VALUES($1,'buyer_disputed')",[id]);
    return {status:'disputed',sellerPayout:'on_hold',decisionDueInDays:config.escrowDisputeDays};
  });
}
export async function resolveDispute(id:string,decision:'release'|'refund',refundAddress?:string){
  if(decision==='refund'&&(!refundAddress||!looksShielded(refundAddress)))throw bad('A testnet refund address is required (mock validation only)');
  return tx(async c=>{
    const order=await lockedOrder(c,id);if(order.status!=='disputed')throw conflict('Not a disputed acquisition');
    const hashes=(await c.query('SELECT ciphertext_hash FROM dispute_evidence WHERE order_id=$1 ORDER BY id',[id])).rows.map(r=>r.ciphertext_hash);
    await c.query('INSERT INTO dispute_decisions(order_id,decision,evidence_hashes) VALUES($1,$2,$3)',[id,decision,JSON.stringify(hashes)]);
    if(decision==='release')return complete(c,order,'operator_release');
    const payment=await confirmedPayment(c,order);
    if(order.refund_status==='queued'||order.refund_status==='sent')throw conflict('Refund already submitted');
    await c.query("INSERT INTO payouts(kind,to_address,zat,ref_id) VALUES('buyer_refund',$1,$2,$3)",[refundAddress,payment.received_zat,id]);
    await c.query("UPDATE orders SET status='refund_queued',refund_status='queued',refund_zat=$2,resolved_at=now() WHERE id=$1",[id,payment.received_zat]);
    await c.query("INSERT INTO acquisition_events(order_id,kind) VALUES($1,'operator_refund')",[id]);
    return {status:'refund_queued'};
  });
}
/** Releases funded acquisitions whose review window closed with no acceptance or dispute. */
export async function releaseDue(limit=50){
  const ids=(await pool.query("SELECT id FROM orders WHERE status='funded' AND acquisition_version=1 AND release_after<=now() ORDER BY release_after,id LIMIT $1",[limit])).rows;
  let released=0;
  for(const {id} of ids){
    // Re-checked under the row lock: an acceptance or dispute may have landed in between.
    const done=await tx(async c=>{
      const order=await lockedOrder(c,id);
      if(order.status!=='funded'||!order.release_after||!(await c.query('SELECT $1::timestamptz<=clock_timestamp() AS due',[order.release_after])).rows[0].due)return false;
      await complete(c,order,'auto_release');return true;
    }).catch(error=>{log('escrow_release_failed',{code:errorCode(error),level:'error'});return false;});
    if(done)released++;
  }
  return released;
}
export async function downloadAsset(accountId:string|undefined,listingId:string,receipt:string){
  return tx(async c=>{
    const ref=(await c.query('SELECT id FROM orders WHERE listing_id=$1 AND receipt_hash=$2',[listingId,hashCode(receipt)])).rows[0];if(!ref)throw notFound();
    const order=await lockedOrder(c,ref.id);
    if(!order.receipt_hash.equals(hashCode(receipt))||!canDownload(order.status)||!order.file_key||
      (order.acquisition_version===1&&order.buyer_id&&order.buyer_id!==accountId))throw notFound();
    const bytes=privateBytes(order.file_key);if(!bytes)throw notFound('File unavailable');
    const digest=createHash('sha256').update(bytes).digest('hex');
    if(order.file_sha256&&!equalDigest(order.file_sha256,digest))throw conflict('Asset integrity check failed');
    // Record successful preparation of authenticated bytes, not proof of client receipt.
    if(order.acquisition_version===1&&order.buyer_id)await c.query('UPDATE orders SET file_first_accessed_at=COALESCE(file_first_accessed_at,now()) WHERE id=$1',[order.id]);
    return {bytes,digest,name:order.file_name};
  });
}
export async function getAcquisitionProof(receipt:string,id:string){
  const row=(await pool.query("SELECT proof FROM orders WHERE id=$1 AND receipt_hash=$2 AND status='paid'",[id,hashCode(receipt)])).rows[0];
  if(!row?.proof)throw notFound();return row.proof;
}
export function verifySignedTransfer(proof:unknown){return verifyTransfer(proof,publicVerificationKey());}
export async function adminDisputes(){
  return (await pool.query("SELECT id,listing_id,disputed_at,dispute_due_at,(dispute_due_at<now()) AS overdue,dispute_reason,status,file_first_accessed_at FROM orders WHERE status='disputed' ORDER BY dispute_due_at NULLS FIRST,id LIMIT 100")).rows;
}
