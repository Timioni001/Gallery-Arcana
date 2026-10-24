import {pool,tx} from '../db.ts';
import {randomToken,sha256} from '../lib/crypto.ts';
import {conflict,notFound} from '../lib/errors.ts';
export async function createInvitation(sellerId:string,listingId:string,input:{buyerId?:string;priceUsdCents?:number;offerId?:string;hours:number}){return tx(async c=>{
 const listing=(await c.query("SELECT * FROM listings WHERE id=$1 AND seller_id=$2 AND status='live' FOR UPDATE",[listingId,sellerId])).rows[0];if(!listing)throw notFound();if(listing.crypto_mode!=='capsule-v1')throw conflict('Private invitations require a capsule product');
 let price=input.priceUsdCents??listing.price_usd_cents,buyerId=input.buyerId;
 if(input.offerId){const offer=(await c.query("SELECT * FROM offers WHERE id=$1 AND listing_id=$2 AND status='accepted' AND listing_revision=$3",[input.offerId,listingId,listing.revision])).rows[0];if(!offer||input.priceUsdCents!==undefined||(input.buyerId&&input.buyerId!==offer.buyer_id))throw conflict('A current accepted offer must determine invitation terms');buyerId=offer.buyer_id;price=offer.amount_usd_cents;}
 if(buyerId===sellerId)throw conflict('Seller cannot purchase their own asset');
 const capability=randomToken();const row=(await c.query(`INSERT INTO sale_invitations(listing_id,seller_id,buyer_id,listing_revision,price_usd_cents,offer_id,capability_hash,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+make_interval(hours=>$8)) RETURNING id,expires_at`,[listingId,sellerId,buyerId??null,listing.revision,price,input.offerId??null,sha256(capability),input.hours])).rows[0];
 await c.query("UPDATE listings SET invitation_only=true,visibility='unlisted' WHERE id=$1",[listingId]);return {invitationId:row.id,capability,expiresAt:row.expires_at};
});}
export async function inspectInvitation(accountId:string,id:string,capability:string){
 const row=(await pool.query(`SELECT i.id,i.listing_id,i.price_usd_cents,i.expires_at,l.title,l.crypto_mode FROM sale_invitations i JOIN listings l ON l.id=i.listing_id
 WHERE i.id=$1 AND i.capability_hash=$2 AND (i.buyer_id IS NULL OR i.buyer_id=$3) AND i.revoked_at IS NULL AND i.redeemed_order_id IS NULL AND i.expires_at>now() AND i.listing_revision=l.revision AND l.status='live'`,[id,sha256(capability),accountId])).rows[0];if(!row)throw notFound();return row;
}
export async function revokeInvitation(sellerId:string,id:string){return tx(async c=>{
 const ref=(await c.query('SELECT listing_id FROM sale_invitations WHERE id=$1 AND seller_id=$2',[id,sellerId])).rows[0];if(!ref)throw notFound();await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
 const result=await c.query('UPDATE sale_invitations SET revoked_at=now() WHERE id=$1 AND seller_id=$2 AND redeemed_order_id IS NULL RETURNING id',[id,sellerId]);if(!result.rowCount)throw conflict('Invitation already redeemed');return {revoked:true};
});}

export async function invitationAccess(db:import('../db.ts').Db,listingId:string,buyerId:string,invitation?:{id:string;capability:string}){
 if(!invitation)throw notFound('Invitation capability required');
 const row=(await db.query(`SELECT 1 FROM sale_invitations i JOIN listings l ON l.id=i.listing_id WHERE i.id=$1 AND i.listing_id=$2 AND i.capability_hash=$3
  AND (i.buyer_id IS NULL OR i.buyer_id=$4) AND i.revoked_at IS NULL AND i.redeemed_order_id IS NULL AND i.expires_at>clock_timestamp() AND i.listing_revision=l.revision`,[invitation.id,listingId,sha256(invitation.capability),buyerId])).rowCount;
 if(!row)throw notFound();
}
