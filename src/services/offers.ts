import {pool,tx} from '../db.ts';
import {bad,conflict,forbidden,notFound} from '../lib/errors.ts';
import type {PoolClient} from 'pg';
async function lockOffer(c:PoolClient,id:string){
  const ref=(await c.query('SELECT listing_id FROM offers WHERE id=$1',[id])).rows[0];
  if(!ref)throw notFound();
  const item=(await c.query('SELECT * FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id])).rows[0];
  const offer=(await c.query('SELECT * FROM offers WHERE id=$1 FOR UPDATE',[id])).rows[0];
  return {...offer,seller_id:item.seller_id,listing_status:item.status,current_revision:item.revision};
}
export async function makeOffer(buyerId:string,listingId:string,cents:number){
  return tx(async c=>{
    const item=(await c.query('SELECT seller_id,status,revision FROM listings WHERE id=$1 FOR UPDATE',[listingId])).rows[0];
    if(!item)throw notFound();
    if(item.seller_id===buyerId)throw forbidden('You cannot make an offer on your own listing');
    if(item.status!=='live')throw conflict('This listing is not accepting offers');
    const {rows}=await c.query(`INSERT INTO offers(listing_id,buyer_id,amount_usd_cents,listing_revision) VALUES($1,$2,$3,$4)
      ON CONFLICT(listing_id,buyer_id) WHERE status IN ('open','countered','accepted') DO NOTHING RETURNING id,revision`,[listingId,buyerId,cents,item.revision]);
    if(!rows[0])throw conflict('You already have an active offer for this listing');
    return {offerId:rows[0].id,revision:rows[0].revision};
  });
}
export async function offersFor(accountId:string){
  return (await pool.query(`SELECT o.id,o.listing_id,l.title AS listing_title,(o.buyer_id=$1) AS am_buyer,(l.seller_id=$1) AS am_seller,
    o.amount_usd_cents,o.counter_usd_cents,o.status,o.created_at,l.delivery,o.revision,o.listing_revision
    FROM offers o JOIN listings l ON l.id=o.listing_id WHERE o.buyer_id=$1 OR l.seller_id=$1 ORDER BY o.created_at DESC,o.id DESC LIMIT 100`,[accountId])).rows;
}
export async function actOnOffer(accountId:string,offerId:string,action:'accept'|'counter'|'decline'|'withdraw'|'decline-counter',counterCents?:number,expectedVersion?:number){
  return tx(async c=>{
    const o=await lockOffer(c,offerId);
    if(action==='withdraw'||action==='decline-counter'){
      if(o.buyer_id!==accountId)throw forbidden();
      if(action==='decline-counter'&&o.status!=='countered')throw conflict('No active counteroffer');
    }else if(o.seller_id!==accountId)throw forbidden();
    if(o.listing_status!=='live'||o.listing_revision!==o.current_revision)throw conflict('Listing or terms changed');
    if(expectedVersion!==undefined&&expectedVersion!==o.revision)throw conflict('Offer changed; reload before acting');
    if(!['open','countered','accepted'].includes(o.status))throw conflict('Offer no longer active');
    if(action==='accept'&&o.status!=='open')throw conflict('Only an open buyer offer can be accepted by the seller');
    if(['counter','decline'].includes(action)&&o.status==='accepted')throw conflict('Offer already accepted');
    if(action==='counter'&&(counterCents===undefined||!Number.isSafeInteger(counterCents)||counterCents<50||counterCents>100_000_000))throw bad('Counterprice required');
    const status=action==='withdraw'||action==='decline-counter'?'withdrawn':action==='counter'?'countered':action==='accept'?'accepted':'declined';
    const {rows}=await c.query(`UPDATE offers SET status=$2,counter_usd_cents=$3,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision`,[offerId,status,action==='counter'?counterCents:null]);
    return {status,revision:rows[0].revision};
  });
}
export async function acceptCounter(buyerId:string,offerId:string,expectedVersion?:number){
  if(expectedVersion===undefined)throw bad('expectedVersion is required to accept the counteroffer you viewed');
  return tx(async c=>{
    const o=await lockOffer(c,offerId);
    if(o.buyer_id!==buyerId)throw forbidden();
    if(o.status!=='countered'||o.listing_status!=='live'||o.listing_revision!==o.current_revision||o.revision!==expectedVersion)throw conflict('Counteroffer changed or is unavailable');
    const {rows}=await c.query(`UPDATE offers SET status='accepted',amount_usd_cents=counter_usd_cents,counter_usd_cents=NULL,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision`,[offerId]);
    return {status:'accepted',revision:rows[0].revision};
  });
}
