import {pool,setting} from '../db.ts';
/** Remove account/payment links after the dispute period while keeping receipt redemption possible. */
export async function scrubOrders(){
  const days=await setting<number>('dispute_days');
  await pool.query('DELETE FROM sessions WHERE expires_at<now()');
  await pool.query(`WITH due AS (
      SELECT o.id,o.payment_id FROM orders o
      WHERE o.status='paid' AND o.scrubbed_at IS NULL
        AND o.paid_at<now()-make_interval(days=>$1)
        AND NOT EXISTS (SELECT 1 FROM payouts p WHERE p.ref_id=o.id AND p.status IN ('queued','sending','failed'))
      FOR UPDATE SKIP LOCKED
    ), scrubbed AS (
      UPDATE orders o SET buyer_id=NULL,payment_id=NULL,offer_id=NULL,scrubbed_at=now()
      FROM due WHERE o.id=due.id RETURNING o.id
    )
    UPDATE payments p SET address='scrubbed:'||p.id,memo_code='scrubbed:'||p.id,
      txid=NULL,ref_id=gen_random_uuid()
    FROM due JOIN scrubbed s ON s.id=due.id WHERE p.id=due.payment_id`,[days]);
  await pool.query(`DELETE FROM offers o USING listings l WHERE o.listing_id=l.id
    AND l.status='sold' AND l.updated_at<now()-make_interval(days=>$1)`,[days]);
}
