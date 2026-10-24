import type { PoolClient } from 'pg';
import { pool, setting, tx } from '../db.ts';
import { bad, conflict, forbidden, notFound } from '../lib/errors.ts';
import { hashCode, newCode } from '../lib/crypto.ts';
import { looksShielded } from './gate.ts';
import { createPayment } from './payments.ts';
import type { PaymentRow } from './settlement.ts';

export async function checkout(buyerId: string, listingId: string, offerId?: string) {
  const receiptCode = newCode('RCT', 16); // secret delivered once; only hashed at rest
  const order = await tx(async c => {
    const { rows } = await c.query(`SELECT l.*,a.payout_address FROM listings l
      JOIN accounts a ON a.id=l.seller_id WHERE l.id=$1 FOR UPDATE OF l`,[listingId]);
    const item = rows[0];
    if (!item) throw notFound();
    if (item.seller_id===buyerId) throw forbidden('Cannot buy your own listing');
    if (item.status!=='live') throw conflict('This listing is unavailable');
    if (item.delivery!=='download') throw conflict('Automatic checkout is supported only for downloadable products. External asset settlement is not yet safe.');
    if (!item.payout_address) throw conflict('Seller must configure a payout address');
    let price = item.price_usd_cents as number;
    if (offerId) {
      const offer = (await c.query(`SELECT * FROM offers WHERE id=$1 AND listing_id=$2 AND buyer_id=$3
        FOR UPDATE`,[offerId,listingId,buyerId])).rows[0];
      if (!offer || offer.status!=='accepted') throw forbidden('Only your accepted offer can be used');
      price=offer.amount_usd_cents;
    }
    const holdMin=await setting<number>('reservation_minutes',c);
    const expiresAt = new Date(Date.now()+holdMin*60_000);
    const { rows: created } = await c.query(`INSERT INTO orders(listing_id,buyer_id,offer_id,price_usd_cents,payout_address,receipt_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[listingId,buyerId,offerId??null,price,item.payout_address,hashCode(receiptCode),expiresAt]);
    await c.query(`UPDATE listings SET status='reserved',updated_at=now() WHERE id=$1`,[listingId]);
    const payment=await createPayment(c,{usdCents:price,refId:created[0].id,expiresAt});
    await c.query(`UPDATE orders SET payment_id=$2 WHERE id=$1`,[created[0].id,payment.paymentId]);
    return {orderId:created[0].id as string,payment};
  });
  return {...order, receiptCode};
}

export async function orderStatus(accountId:string,orderId:string) {
  const {rows}=await pool.query(`SELECT o.id,o.listing_id,l.title,o.price_usd_cents,o.status,o.expires_at,o.paid_at,
    l.delivery, CASE WHEN o.status='paid' THEN true ELSE false END AS delivered
    FROM orders o JOIN listings l ON l.id=o.listing_id WHERE o.id=$1 AND o.buyer_id=$2`,[orderId,accountId]);
  if(!rows[0]) throw notFound();
  return rows[0];
}

/** Recover only the authenticated buyer's checkout instructions after refresh. Never return the receipt secret. */
export async function orderPayment(accountId: string, orderId: string) {
  const { rows } = await pool.query(`SELECT o.id,o.status,o.expires_at,p.address,p.memo_code,p.expected_zat,p.usd_cents
    FROM orders o JOIN payments p ON p.id=o.payment_id WHERE o.id=$1 AND o.buyer_id=$2`, [orderId,accountId]);
  const p=rows[0];
  if(!p) throw notFound();
  const { zatToZecString, zip321 } = await import('../lib/money.ts');
  return { orderId:p.id, status:p.status, expiresAt:p.expires_at,
    payment: {address:p.address, memo:p.memo_code, amountZat:String(p.expected_zat),
      amountZec:zatToZecString(BigInt(p.expected_zat)), usdCents:p.usd_cents,
      uri:zip321([{address:p.address,zat:BigInt(p.expected_zat),memo:p.memo_code}])} };
}

export async function myOrders(accountId:string){
  const {rows}=await pool.query(`SELECT o.id,o.listing_id,l.title,o.status,o.price_usd_cents,o.created_at
    FROM orders o JOIN listings l ON l.id=o.listing_id WHERE o.buyer_id=$1
    ORDER BY o.created_at DESC LIMIT 100`,[accountId]);
  return rows;
}

export async function releaseExpired(c:PoolClient){
  const {rows}=await c.query(`UPDATE orders SET status='expired'
    WHERE status='awaiting_payment' AND expires_at<now() RETURNING id,listing_id`);
  for (const o of rows) {
    await c.query(`UPDATE listings SET status='live',updated_at=now() WHERE id=$1 AND status='reserved'`,[o.listing_id]);
  }
  await c.query(`UPDATE payments SET status='expired' WHERE status='pending' AND expires_at<now()`);
}

/** Buyer paid after order expired or listing was sold. Do not deliver; explicitly offer a refund. */
export async function settlePurchase(c:PoolClient,p:PaymentRow,late:boolean){
  const {rows}=await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[p.ref_id]);
  const order=rows[0];
  if(!order || order.status==='paid' || order.status==='refund_due' || order.status==='refund_queued') return;
  const {rows:list}=await c.query(`SELECT l.*,a.payout_address FROM listings l JOIN accounts a ON a.id=l.seller_id
    WHERE l.id=$1 FOR UPDATE OF l`,[order.listing_id]);
  const item=list[0];
  if(late || order.status!=='awaiting_payment' || new Date(order.expires_at)<new Date() || item.status!=='reserved') {
    await c.query(`UPDATE orders SET status='refund_due' WHERE id=$1`,[order.id]);
    await c.query(`UPDATE payments SET status='late' WHERE id=$1`,[p.id]);
    return;
  }
  await c.query(`UPDATE orders SET status='paid',paid_at=now() WHERE id=$1`,[order.id]);
  await c.query(`UPDATE listings SET status='sold',updated_at=now() WHERE id=$1`,[item.id]);
  await c.query(`UPDATE offers SET status='completed',updated_at=now()
    WHERE listing_id=$1 AND status IN ('open','countered','accepted')`,[item.id]);
  const cutBps=await setting<number>('platform_cut_bps',c);
  const payout=(BigInt(p.received_zat)*BigInt(10_000-cutBps))/10_000n;
  if(payout>0n) await c.query(`INSERT INTO payouts(kind,to_address,zat,ref_id)
    VALUES('seller_sale',$1,$2,$3) ON CONFLICT DO NOTHING`,[order.payout_address,payout.toString(),order.id]);
}

export async function claimLateRefund(receiptCode:string,address:string){
  if(!looksShielded(address)) throw bad('A shielded-capable Zcash unified address is required');
  return tx(async c=>{
    const {rows}=await c.query(`SELECT o.id,o.status,p.received_zat FROM orders o JOIN payments p ON p.id=o.payment_id
      WHERE o.receipt_hash=$1 FOR UPDATE OF o`,[hashCode(receiptCode)]);
    const o=rows[0];
    if(!o) throw notFound();
    if(o.status!=='refund_due') throw conflict('No refund is currently due');
    if(BigInt(o.received_zat)<=0n) throw conflict('No confirmed funds available');
    await c.query(`UPDATE orders SET status='refund_queued' WHERE id=$1`,[o.id]);
    const r=await c.query(`INSERT INTO payouts(kind,to_address,zat,ref_id)
      VALUES('buyer_refund',$1,$2,$3) RETURNING id`,[address,o.received_zat,o.id]);
    return {refundId:r.rows[0].id as string,status:'queued'};
  });
}
