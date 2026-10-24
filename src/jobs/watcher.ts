import {config} from '../config.ts';
import {pool,tx} from '../db.ts';
import {settle} from '../services/settlement.ts';
import type {WalletAdapter,ReceivedNote} from '../wallet/types.ts';
import type {PoolClient} from 'pg';
import {log,errorCode} from '../lib/log.ts';

function attributed(notes:ReceivedNote[],address:string,memo:string){
  const unique=new Map<string,ReceivedNote>();
  for(const n of notes){
    if(n.address!==address||n.memo!==memo||!n.shielded)continue;
    if(typeof n.zat!=='bigint'||n.zat<=0n||n.zat>2_100_000_000_000_000n||!Number.isSafeInteger(n.confirmations)||n.confirmations<0||!n.outputId||!n.txid)throw new Error('Invalid wallet observation');
    const prior=unique.get(n.outputId);
    if(prior&&(prior.zat!==n.zat||prior.txid!==n.txid))throw new Error('Conflicting duplicate output');
    unique.set(n.outputId,prior?{...n,confirmations:Math.min(prior.confirmations,n.confirmations),canonical:prior.canonical&&n.canonical}:n);
  }
  return [...unique.values()];
}
async function review(c:PoolClient,paymentId:string,orderId:string){
  const seller=(await c.query('SELECT l.seller_id FROM listings l JOIN orders o ON o.listing_id=l.id WHERE o.id=$1',[orderId])).rows[0];
  if(seller){await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[seller.seller_id]);await c.query("UPDATE trade_passports SET revoked_at=COALESCE(revoked_at,now()) WHERE source_order_id=$1 OR (account_id=$2 AND proof->'claim'->>'kind'='seller_deliveries')",[orderId,seller.seller_id]);}
  await c.query("UPDATE payments SET status='review' WHERE id=$1",[paymentId]);
  await c.query("UPDATE orders SET status=CASE WHEN status IN ('funded','disputed','paid') THEN 'payment_review' ELSE status END,refund_status='review' WHERE id=$1",[orderId]);
  await c.query("UPDATE payouts SET status='cancelled',failure_code='PAYMENT_REVIEW',updated_at=now() WHERE ref_id=$1 AND status='queued'",[orderId]);
  log('payment_review',{id:paymentId,level:'warn'});
}
/** The adapter contract is a complete historical output snapshot, never an account balance. */
export async function scanOnce(wallet:WalletAdapter){
  const guard=await pool.connect();
  const locked=(await guard.query('SELECT pg_try_advisory_lock(174428,3) AS locked')).rows[0].locked;
  if(!locked){guard.release();return;}
  try{
    if(!(await wallet.syncStatus()).ready)return;
    const {rows}=await pool.query(`SELECT id,address,memo_code,ref_id FROM payments WHERE scrubbed_at IS NULL AND status IN ('pending','expired','confirmed','late')
      ORDER BY last_scanned_at NULLS FIRST,created_at LIMIT 500`);
    let failures=0;
    for(const invoice of rows){
      try{
        const notes=attributed(await wallet.received(invoice.address),invoice.address,invoice.memo_code);
        await tx(async c=>{
          const ref=(await c.query('SELECT listing_id FROM orders WHERE id=$1',[invoice.ref_id])).rows[0];if(!ref)return;
          await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
          const order=(await c.query('SELECT *,expires_at<=clock_timestamp() AS deadline_passed FROM orders WHERE id=$1 FOR UPDATE',[invoice.ref_id])).rows[0];
          const p=(await c.query('SELECT *,expires_at<=clock_timestamp() AS deadline_passed FROM payments WHERE id=$1 FOR UPDATE',[invoice.id])).rows[0];
          if(!p||p.scrubbed_at||p.status==='review')return;
          const prior=(await c.query('SELECT * FROM payment_notes WHERE payment_id=$1',[p.id])).rows;
          await c.query('UPDATE payment_notes SET canonical=false WHERE payment_id=$1',[p.id]);
          for(const n of notes){
            const result=await c.query(`INSERT INTO payment_notes(output_id,payment_id,txid,address,memo,zat,confirmations,canonical)
              VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(output_id) DO UPDATE SET confirmations=EXCLUDED.confirmations,canonical=EXCLUDED.canonical,observed_at=now()
              WHERE payment_notes.payment_id=EXCLUDED.payment_id AND payment_notes.txid=EXCLUDED.txid AND payment_notes.address=EXCLUDED.address
                AND payment_notes.memo=EXCLUDED.memo AND payment_notes.zat=EXCLUDED.zat RETURNING output_id`,
              [n.outputId,p.id,n.txid,n.address,n.memo,n.zat.toString(),n.confirmations,n.canonical]);
            if(!result.rowCount){await review(c,p.id,order.id);return;}
          }
          const confirmed=notes.filter(n=>n.canonical&&n.confirmations>=config.minConfirmations);
          const total=confirmed.reduce((sum,n)=>sum+n.zat,0n);
          const confirmations=confirmed.length?Math.min(...confirmed.map(n=>n.confirmations)):0;
          await c.query(`UPDATE payments SET received_zat=$2,confirmations=$3,txid=$4,last_scanned_at=clock_timestamp() WHERE id=$1`,[p.id,total.toString(),confirmations,confirmed[0]?.txid??null]);
          const lostOutput=prior.some(n=>n.canonical&&n.confirmations>=config.minConfirmations&&!confirmed.some(current=>current.outputId===n.output_id));
          if(p.status==='confirmed'){
            if(total!==BigInt(p.received_zat)||total<BigInt(p.expected_zat)||lostOutput)await review(c,p.id,order.id);
            return;
          }
          if(p.status==='late'){
            if(lostOutput||total<BigInt(p.received_zat)||(total!==BigInt(p.received_zat)&&order.refund_status!=='due')){await review(c,p.id,order.id);return;}
            if(order.refund_status==='due')await c.query('UPDATE orders SET refund_zat=$2 WHERE id=$1',[order.id,total.toString()]);
            return;
          }
          const expired=p.status==='expired'||p.deadline_passed||order.status==='expired'||order.deadline_passed;
          if(total>=BigInt(p.expected_zat)||(expired&&total>0n)){
            await c.query("UPDATE payments SET status='confirmed',confirmed_at=now() WHERE id=$1",[p.id]);
            await settle(c,{...p,received_zat:total.toString()},expired);
          }else if(expired)await c.query("UPDATE payments SET status='expired' WHERE id=$1",[p.id]);
        });
      }catch(error){log('payment_scan_failed',{id:invoice.id,code:errorCode(error),level:'error'});failures++;}
    }
    if(failures)throw new Error('One or more invoices could not be scanned');
  }finally{await guard.query('SELECT pg_advisory_unlock(174428,3)').catch(()=>{});guard.release();}
}
export async function topUpAddressPool(wallet:WalletAdapter){
  if(!(await wallet.syncStatus()).ready)return;
  const guard=await pool.connect();
  const locked=(await guard.query('SELECT pg_try_advisory_lock(174428,4) AS locked')).rows[0].locked;
  try{
    if(!locked)return;
    const count=(await pool.query('SELECT count(*)::int AS n FROM address_pool WHERE NOT claimed')).rows[0].n;
    for(let i=count;i<config.addressPoolTarget;i++)await pool.query('INSERT INTO address_pool(address) VALUES($1) ON CONFLICT DO NOTHING',[await wallet.newAddress()]);
  }finally{if(locked)await guard.query('SELECT pg_advisory_unlock(174428,4)').catch(()=>{});guard.release();}
}
