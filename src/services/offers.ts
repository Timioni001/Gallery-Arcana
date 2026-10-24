import { pool, tx } from '../db.ts';
import { bad, conflict, forbidden, notFound } from '../lib/errors.ts';

export async function makeOffer(buyerId: string, listingId: string, cents: number) {
  return tx(async c => {
    const { rows } = await c.query('SELECT seller_id,status FROM listings WHERE id=$1 FOR UPDATE', [listingId]);
    if (!rows[0]) throw notFound();
    if (rows[0].seller_id === buyerId) throw forbidden('You cannot make an offer on your own listing');
    if (rows[0].status !== 'live') throw conflict('This listing is not accepting offers');
    const { rows: existing } = await c.query(`SELECT id FROM offers WHERE listing_id=$1 AND buyer_id=$2 AND status IN ('open','countered','accepted')`, [listingId,buyerId]);
    if (existing.length) throw conflict('You already have an active offer for this listing');
    const { rows: offer } = await c.query('INSERT INTO offers(listing_id,buyer_id,amount_usd_cents) VALUES($1,$2,$3) RETURNING id', [listingId,buyerId,cents]);
    return { offerId: offer[0].id };
  });
}

export async function offersFor(accountId: string) {
  const { rows } = await pool.query(`SELECT o.id,o.listing_id,l.title AS listing_title,
    (o.buyer_id=$1) AS am_buyer, (l.seller_id=$1) AS am_seller,
    o.amount_usd_cents,o.counter_usd_cents,o.status,o.created_at,l.delivery
    FROM offers o JOIN listings l ON l.id=o.listing_id
    WHERE o.buyer_id=$1 OR l.seller_id=$1 ORDER BY o.created_at DESC LIMIT 100`, [accountId]);
  return rows;
}
export async function actOnOffer(accountId: string, offerId: string, action: 'accept'|'counter'|'decline'|'withdraw', counterCents?: number) {
  return tx(async c => {
    const { rows } = await c.query(`SELECT o.*,l.seller_id,l.status AS listing_status
      FROM offers o JOIN listings l ON l.id=o.listing_id WHERE o.id=$1 FOR UPDATE OF o,l`, [offerId]);
    const o = rows[0];
    if (!o) throw notFound();
    if (action === 'withdraw') {
      if (o.buyer_id !== accountId) throw forbidden();
      if (!['open','countered','accepted'].includes(o.status)) throw conflict('Offer no longer active');
      await c.query(`UPDATE offers SET status='withdrawn', updated_at=now() WHERE id=$1`, [offerId]);
      return { status: 'withdrawn' };
    }
    if (o.seller_id !== accountId) throw forbidden();
    if (o.listing_status !== 'live') throw conflict('Listing is unavailable');
    if (!['open','countered'].includes(o.status)) throw conflict('Offer already handled');
    if (action === 'counter') {
      if (!counterCents) throw bad('Counterprice required');
      await c.query(`UPDATE offers SET counter_usd_cents=$2,status='countered',updated_at=now() WHERE id=$1`, [offerId,counterCents]);
      return { status: 'countered' };
    }
    if (action === 'accept') {
      await c.query(`UPDATE offers SET status='accepted',updated_at=now() WHERE id=$1`, [offerId]);
      return { status: 'accepted' };
    }
    await c.query(`UPDATE offers SET status='declined',updated_at=now() WHERE id=$1`, [offerId]);
    return { status: 'declined' };
  });
}

export async function acceptCounter(buyerId: string, offerId: string) {
  const { rows } = await pool.query(`UPDATE offers o SET status='accepted', amount_usd_cents=o.counter_usd_cents,
    counter_usd_cents=NULL,updated_at=now() FROM listings l WHERE o.listing_id=l.id AND l.status='live'
    AND o.id=$1 AND o.buyer_id=$2 AND o.status='countered'
    RETURNING id`,[offerId,buyerId]);
  if (!rows[0]) throw conflict('Counteroffer no longer available');
  return { status: 'accepted' };
}
