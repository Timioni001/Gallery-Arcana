import type {PoolClient} from 'pg';
import {pool,setting,tx} from '../db.ts';
import {config} from '../config.ts';
import {bad,conflict,forbidden,notFound} from '../lib/errors.ts';
import {hashCode,newCode,sha256} from '../lib/crypto.ts';
import {looksShielded} from './gate.ts';
import {currentIdentity} from './cryptoIdentity.ts';
import {createPayment} from './payments.ts';
import type {PaymentRow} from './settlement.ts';

/** All domain locks use listing -> order -> payment -> payout order. */
async function expireListingOrder(c:PoolClient,listingId:string){
  const expired=(await c.query(`UPDATE orders SET status='expired' WHERE listing_id=$1 AND status='awaiting_payment' AND expires_at<=now() RETURNING id`,[listingId])).rows;
  for(const order of expired)await c.query("UPDATE payments SET status='expired' WHERE ref_id=$1 AND status='pending'",[order.id]);
  if(expired.length)await c.query("UPDATE listings SET status='live',updated_at=now() WHERE id=$1 AND status='reserved'",[listingId]);
  return expired.length;
}
export async function checkout(buyerId:string,listingId:string,offerId?:string,invitation?:{id:string;capability:string}){
  const receiptCode=newCode('RCT',16);
  const order=await tx(async c=>{
    const item=(await c.query(`SELECT l.*,a.payout_address FROM listings l JOIN accounts a ON a.id=l.seller_id WHERE l.id=$1 FOR UPDATE OF l`,[listingId])).rows[0];
    if(!item)throw notFound();
    if(item.seller_id===buyerId)throw forbidden('Cannot buy your own listing');
    if(await expireListingOrder(c,listingId))item.status='live';
    if(item.status!=='live')throw conflict('This listing is unavailable');
    if(item.delivery!=='download')throw conflict('Automatic checkout supports downloadable goods only');
    if(!item.payout_address)throw conflict('Seller must configure a payout address');
    if(!item.file_sha256)throw conflict('Asset fingerprint required; backfill or re-upload the original');
    let invite:any=null;
    if(invitation){invite=(await c.query(`SELECT * FROM sale_invitations WHERE id=$1 AND listing_id=$2 AND capability_hash=$3 AND (buyer_id IS NULL OR buyer_id=$4)
      AND revoked_at IS NULL AND redeemed_order_id IS NULL AND expires_at>clock_timestamp() FOR UPDATE`,[invitation.id,listingId,sha256(invitation.capability),buyerId])).rows[0];
      if(!invite||invite.listing_revision!==item.revision)throw notFound();offerId=invite.offer_id??undefined;
    }else if(item.invitation_only)throw notFound('Invitation capability required');
    let envelopeId:string|null=null;
    if(item.crypto_mode==='capsule-v1'){
      const buyerKey=await currentIdentity(buyerId,c),sellerKey=await currentIdentity(item.seller_id,c);
      const prepared=(await c.query(`SELECT id FROM capsule_envelopes WHERE listing_id=$1 AND buyer_id=$2 AND listing_revision=$3
        AND recipient_key_id=$4 AND sender_key_id=$5 AND expires_at>clock_timestamp()+interval '1 hour'`,[listingId,buyerId,item.revision,buyerKey.id,sellerKey.id])).rows[0];
      if(!prepared)throw conflict('Seller must prepare a current buyer-specific capsule envelope before checkout');envelopeId=prepared.id;
    }
    let price=(invite?.price_usd_cents??item.price_usd_cents) as number;
    if(offerId){
      const offer=(await c.query('SELECT * FROM offers WHERE id=$1 AND listing_id=$2 AND buyer_id=$3 FOR UPDATE',[offerId,listingId,buyerId])).rows[0];
      if(!offer||offer.status!=='accepted'||offer.listing_revision!==item.revision)throw forbidden('Only your current accepted offer can be used');
      price=offer.amount_usd_cents;
    }
    const holdMin=await setting<number>('reservation_minutes',c);
    if(!Number.isSafeInteger(holdMin)||holdMin<1||holdMin>60)throw new Error('Invalid reservation setting');
    const expiresAt=(await c.query('SELECT clock_timestamp()+make_interval(mins=>$1) AS deadline',[holdMin])).rows[0].deadline as Date;
    const created=(await c.query(`INSERT INTO orders(listing_id,buyer_id,offer_id,price_usd_cents,payout_address,receipt_hash,expires_at,file_key,file_name,title,file_sha256,crypto_mode,capsule_envelope_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,[listingId,buyerId,offerId??null,price,item.payout_address,hashCode(receiptCode),expiresAt,item.file_key,item.file_name,item.title,item.file_sha256,item.crypto_mode,envelopeId])).rows[0];
    if(invite)await c.query('UPDATE sale_invitations SET redeemed_order_id=$2 WHERE id=$1',[invite.id,created.id]);
    await c.query("UPDATE listings SET status='reserved',updated_at=now() WHERE id=$1",[listingId]);
    const payment=await createPayment(c,{usdCents:price,refId:created.id,expiresAt});
    const fee=await setting<number>('platform_cut_bps',c);
    if(!Number.isSafeInteger(fee)||fee<0||fee>10000)throw new Error('Invalid platform fee');
    const sellerPayout=BigInt(payment.amountZat)*BigInt(10000-fee)/10000n;
    await c.query('UPDATE orders SET payment_id=$2,seller_payout_zat=$3,platform_fee_bps=$4 WHERE id=$1',[created.id,payment.paymentId,sellerPayout.toString(),fee]);
    return {orderId:created.id as string,payment};
  });
  return {...order,receiptCode};
}
export async function orderStatus(accountId:string,orderId:string){
  const row=(await pool.query(`SELECT o.id,o.listing_id,o.title,o.price_usd_cents,o.status,o.expires_at,o.paid_at,o.refund_status,o.refund_zat,o.acquisition_version,o.crypto_mode,o.file_sha256,o.funded_at,o.file_first_accessed_at,o.delivery_confirmed_at,o.disputed_at,o.release_after,o.dispute_due_at,
    COALESCE(p.received_zat,0)::text AS received_zat,COALESCE(p.confirmations,0) AS confirmations,
    'download' AS delivery,(o.status='paid') AS delivered,(o.status IN ('funded','paid','disputed')) AS downloadable,(o.delivery_confirmed_at IS NOT NULL) AS buyer_confirmed FROM orders o LEFT JOIN payments p ON p.id=o.payment_id WHERE o.id=$1 AND o.buyer_id=$2`,[orderId,accountId])).rows[0];
  if(!row)throw notFound();return row;
}
export async function orderPayment(accountId:string,orderId:string){
  const p=(await pool.query(`SELECT o.id,o.status,o.expires_at,p.address,p.memo_code,p.expected_zat,p.usd_cents FROM orders o
    JOIN payments p ON p.id=o.payment_id WHERE o.id=$1 AND o.buyer_id=$2`,[orderId,accountId])).rows[0];
  if(!p)throw notFound();
  const {zatToZecString,zip321}=await import('../lib/money.ts');
  return {orderId:p.id,status:p.status,expiresAt:p.expires_at,payment:{address:p.address,memo:p.memo_code,amountZat:String(p.expected_zat),
    amountZec:zatToZecString(BigInt(p.expected_zat)),usdCents:p.usd_cents,uri:zip321([{address:p.address,zat:BigInt(p.expected_zat),memo:p.memo_code}])}};
}
export async function myOrders(accountId:string){
  return (await pool.query('SELECT id,listing_id,title,status,price_usd_cents,created_at,refund_status FROM orders WHERE buyer_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100',[accountId])).rows;
}
export async function sales(accountId:string){
  return (await pool.query(`SELECT o.id,o.listing_id,o.title,o.status,o.price_usd_cents,o.created_at,o.funded_at,o.file_first_accessed_at,o.delivery_confirmed_at,o.disputed_at,o.release_after,o.dispute_due_at,
    o.platform_fee_bps,p.expected_zat::text AS price_zat,o.seller_payout_zat::text AS seller_payout_zat,(p.expected_zat-o.seller_payout_zat)::text AS platform_fee_zat
    FROM orders o JOIN listings l ON l.id=o.listing_id LEFT JOIN payments p ON p.id=o.payment_id
    WHERE l.seller_id=$1 ORDER BY o.created_at DESC,o.id DESC LIMIT 100`,[accountId])).rows;
}
export async function renewReceipt(accountId:string,orderId:string){
  const code=newCode('RCT',16);
  const {rows}=await pool.query("UPDATE orders SET receipt_hash=$3 WHERE id=$1 AND buyer_id=$2 AND status IN ('funded','disputed','paid') RETURNING id,title,price_usd_cents,paid_at",[orderId,accountId,hashCode(code)]);
  if(!rows[0])throw notFound();return {...rows[0],receiptCode:code};
}
export async function releaseExpired(c:PoolClient){
  const ids=(await c.query("SELECT DISTINCT listing_id FROM orders WHERE status='awaiting_payment' AND expires_at<=now() ORDER BY listing_id")).rows;
  for(const row of ids){await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[row.listing_id]);await expireListingOrder(c,row.listing_id);}
  await c.query("UPDATE payments SET status='expired' WHERE status='pending' AND expires_at<=now()");
}
export async function settlePurchase(c:PoolClient,p:PaymentRow,late:boolean){
  const ref=(await c.query('SELECT listing_id FROM orders WHERE id=$1',[p.ref_id])).rows[0];if(!ref)return;
  const item=(await c.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id])).rows[0];
  const order=(await c.query('SELECT *,expires_at<=clock_timestamp() AS deadline_passed FROM orders WHERE id=$1 FOR UPDATE',[p.ref_id])).rows[0];
  if(!order||!['awaiting_payment','expired'].includes(order.status))return;
  const received=BigInt(p.received_zat),expected=BigInt(p.expected_zat);
  if(late||order.status!=='awaiting_payment'||order.deadline_passed||item.status!=='reserved'||received<expected){
    await c.query("UPDATE orders SET status='refund_due',refund_zat=$2,refund_status='due' WHERE id=$1",[order.id,received.toString()]);
    await c.query("UPDATE payments SET status='late' WHERE id=$1",[p.id]);
    const other=(await c.query("SELECT 1 FROM orders WHERE listing_id=$1 AND id<>$2 AND status='awaiting_payment'",[item.id,order.id])).rows[0];
    if(!other)await c.query("UPDATE listings SET status='live',updated_at=now() WHERE id=$1 AND status='reserved'",[item.id]);
    return;
  }
  const excess=received-expected;
  await c.query(`UPDATE orders SET status=$4,paid_at=CASE WHEN $4='paid' THEN now() ELSE NULL END,funded_at=now(),refund_zat=$2,refund_status=$3,
    release_after=CASE WHEN $4='funded' THEN now()+make_interval(hours=>$5) END WHERE id=$1`,[order.id,excess.toString(),excess>0n?'due':'none',order.acquisition_version===1?'funded':'paid',config.escrowReviewHours]);
  await c.query("UPDATE listings SET status='sold',updated_at=now() WHERE id=$1",[item.id]);
  await c.query(`UPDATE offers SET status=CASE WHEN id=$2 THEN 'completed' ELSE 'declined' END,revision=revision+1,updated_at=now()
    WHERE listing_id=$1 AND status IN ('open','countered','accepted')`,[item.id,order.offer_id]);
  if(order.acquisition_version===1)return; // Funding unlocks inspection; acceptance queues the payout.
  const cutBps=await setting<number>('platform_cut_bps',c);
  if(!Number.isSafeInteger(cutBps)||cutBps<0||cutBps>10_000)throw new Error('Invalid platform fee');
  const payout=expected*BigInt(10_000-cutBps)/10_000n;
  if(payout>0n)await c.query("INSERT INTO payouts(kind,to_address,zat,ref_id) VALUES('seller_sale',$1,$2,$3) ON CONFLICT DO NOTHING",[order.payout_address,payout.toString(),order.id]);
}
export async function claimLateRefund(receiptCode:string,address:string){
  if(!looksShielded(address))throw bad('A testnet shielded-capable destination is required (mock validation only)');
  return tx(async c=>{
    const ref=(await c.query('SELECT id,listing_id FROM orders WHERE receipt_hash=$1',[hashCode(receiptCode)])).rows[0];if(!ref)throw notFound();
    await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
    const o=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[ref.id])).rows[0];
    if(!o||!o.receipt_hash.equals(hashCode(receiptCode)))throw notFound();
    const p=(await c.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[o.payment_id])).rows[0];
    if(o.refund_status!=='due'||!['paid','refund_due'].includes(o.status)||!p||p.status==='review')throw conflict('No refundable funds are currently available');
    if(BigInt(o.refund_zat)<=0n)throw conflict('No confirmed funds available');
    await c.query("UPDATE orders SET refund_status='queued',status=CASE WHEN status='refund_due' THEN 'refund_queued' ELSE status END WHERE id=$1",[o.id]);
    const r=await c.query("INSERT INTO payouts(kind,to_address,zat,ref_id) VALUES('buyer_refund',$1,$2,$3) RETURNING id",[address,o.refund_zat,o.id]);
    return {refundId:r.rows[0].id as string,status:'queued'};
  });
}
