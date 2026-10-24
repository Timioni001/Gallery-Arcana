import {pool,tx} from '../db.ts';
import type {WalletAdapter} from '../wallet/types.ts';
import {log,errorCode} from '../lib/log.ts';
async function recordSent(id:string,txid:string){
  await tx(async c=>{
    const ref=(await c.query('SELECT o.id,o.listing_id FROM orders o JOIN payouts p ON p.ref_id=o.id WHERE p.id=$1',[id])).rows[0];
    if(!ref)return;
    await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
    await c.query('SELECT id FROM orders WHERE id=$1 FOR UPDATE',[ref.id]);
    const payout=(await c.query("UPDATE payouts SET status='sent',txid=$2,updated_at=now(),failure_code=NULL WHERE id=$1 AND status='sending' RETURNING kind,ref_id",[id,txid])).rows[0];
    if(payout?.kind==='buyer_refund')await c.query("UPDATE orders SET refund_status='sent' WHERE id=$1 AND refund_status='queued'",[payout.ref_id]);
  });
}
export async function reconcilePayouts(wallet:WalletAdapter){
  const {rows}=await pool.query("SELECT id,to_address,zat FROM payouts WHERE status='sending' ORDER BY updated_at LIMIT 100");
  for(const p of rows){
    const result=await wallet.lookupSend(p.id);
    if(result.state==='found'&&result.to===p.to_address&&result.zat===BigInt(p.zat))await recordSent(p.id,result.txid);
    else log('payout_reconciliation_required',{id:p.id,level:'warn'});
  }
}
/** The durable payout UUID is the wallet submission key. Uncertain sends are never resubmitted. */
export async function runPayouts(wallet:WalletAdapter,batch=10){
  if(!(await wallet.syncStatus()).ready)return;
  await reconcilePayouts(wallet);
  const {rows}=await pool.query(`WITH claim AS (
    SELECT p.id FROM payouts p JOIN orders o ON o.id=p.ref_id JOIN payments invoice ON invoice.id=o.payment_id
    WHERE p.status='queued' AND invoice.status IN ('confirmed','late')
      AND ((p.kind='seller_sale' AND o.status='paid') OR (p.kind='buyer_refund' AND o.refund_status='queued'))
    ORDER BY p.created_at FOR UPDATE OF p SKIP LOCKED LIMIT $1)
    UPDATE payouts p SET status='sending',attempts=attempts+1,updated_at=now()
    FROM claim WHERE p.id=claim.id AND p.status='queued' RETURNING p.id,p.to_address,p.zat`,[batch]);
  for(const p of rows){
    try{const txid=await wallet.send(p.to_address,BigInt(p.zat),undefined,p.id);await recordSent(p.id,txid);}
    catch(error){
      await pool.query("UPDATE payouts SET failure_code=$2,updated_at=now() WHERE id=$1 AND status='sending'",[p.id,errorCode(error)]);
      log('payout_submission_uncertain',{id:p.id,level:'warn',code:errorCode(error)});
    }
  }
}
