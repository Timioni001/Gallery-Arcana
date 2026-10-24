import {pool,setting,tx} from '../db.ts';
/** Remove buyer/payment links after settled retention, while retaining private bearer redemption. */
export async function scrubOrders(){
  const days=await setting<number>('dispute_days');
  if(!Number.isSafeInteger(days)||days<1)throw new Error('Invalid retention setting');
  await pool.query('DELETE FROM sessions WHERE expires_at<=now() OR absolute_expires_at<=now()');
  await pool.query('DELETE FROM rate_limits WHERE reset_at<now()');
  const due=(await pool.query(`SELECT id,listing_id FROM orders WHERE scrubbed_at IS NULL
    AND ((status='paid' AND paid_at<now()-make_interval(days=>$1)) OR
      (status='refund_queued' AND refund_status='sent' AND resolved_at<now()-make_interval(days=>$1)))
    AND refund_status IN ('none','sent') ORDER BY listing_id LIMIT 100`,[days])).rows;
  for(const ref of due)await tx(async c=>{
    await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
    const o=(await c.query("SELECT * FROM orders WHERE id=$1 AND status IN ('paid','refund_queued') AND scrubbed_at IS NULL FOR UPDATE",[ref.id])).rows[0];if(!o)return;
    const p=(await c.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[o.payment_id])).rows[0];
    if(!p||!['confirmed','late'].includes(p.status)||!['none','sent'].includes(o.refund_status))return;
    if((await c.query("SELECT 1 FROM payouts WHERE ref_id=$1 AND status IN ('queued','sending','failed')",[o.id])).rows[0])return;
    await c.query('DELETE FROM payment_notes WHERE payment_id=$1',[p.id]);
    await c.query('DELETE FROM mock_notes WHERE address=$1',[p.address]);
    // The durable mock submission ledger also holds destinations/transaction IDs.
    // Completed sends no longer need reconciliation after the retention boundary.
    await c.query(`DELETE FROM mock_sends m USING payouts payout WHERE m.idempotency_key=payout.id::text
      AND payout.ref_id=$1 AND payout.status='sent'`,[o.id]);
    await c.query("UPDATE orders SET buyer_id=NULL,payment_id=NULL,offer_id=NULL,payout_address='scrubbed',dispute_reason=NULL,scrubbed_at=now() WHERE id=$1",[o.id]);
    await c.query("UPDATE payments SET address='scrubbed:'||id,memo_code='scrubbed:'||id,txid=NULL,ref_id=gen_random_uuid(),scrubbed_at=now() WHERE id=$1",[p.id]);
    await c.query("UPDATE payouts SET to_address='scrubbed',txid=NULL WHERE ref_id=$1 AND status IN ('sent','cancelled')",[o.id]);
  });
  await pool.query(`DELETE FROM offers o USING listings l WHERE o.listing_id=l.id AND l.status='sold'
    AND l.updated_at<now()-make_interval(days=>$1) AND NOT EXISTS(SELECT 1 FROM orders WHERE offer_id=o.id)`,[days]);
}
