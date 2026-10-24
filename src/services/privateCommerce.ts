import {createHash} from 'node:crypto';
import {z} from 'zod';
import {pool,tx} from '../db.ts';
import {bad,conflict,notFound} from '../lib/errors.ts';
import {invitationAccess} from './invitations.ts';
import {checkEnvelope,currentIdentity,identityById} from './cryptoIdentity.ts';
import {canDownload} from '../lib/acquisition.ts';
import {hashCode} from '../lib/crypto.ts';
export async function prepareCapsule(sellerId:string,listingId:string,buyerId:string,raw:unknown){return tx(async c=>{
 const listing=(await c.query('SELECT * FROM listings WHERE id=$1 AND seller_id=$2 FOR UPDATE',[listingId,sellerId])).rows[0];if(!listing)throw notFound();
 if(listing.crypto_mode!=='capsule-v1'||listing.status!=='live'||sellerId===buyerId)throw conflict('Capsule listing is unavailable');
 const envelope=await checkEnvelope(raw,'capsule-key',listingId,sellerId,buyerId,c);
 const result=await c.query(`INSERT INTO capsule_envelopes(listing_id,listing_revision,buyer_id,sender_key_id,recipient_key_id,envelope,expires_at)
 VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(listing_id,buyer_id,listing_revision,recipient_key_id) DO UPDATE SET envelope=EXCLUDED.envelope,expires_at=EXCLUDED.expires_at,sender_key_id=EXCLUDED.sender_key_id RETURNING id`,[listingId,listing.revision,buyerId,envelope.senderKeyId,envelope.recipientKeyId,envelope,envelope.context.expiresAt]);return {envelopeId:result.rows[0].id};
});}
export async function fundedEnvelope(buyerId:string,orderId:string,receipt:string){return tx(async c=>{
 const ref=(await c.query('SELECT o.listing_id FROM orders o JOIN capsule_envelopes e ON e.id=o.capsule_envelope_id WHERE o.id=$1 AND e.buyer_id=$2 AND (o.buyer_id=$2 OR o.buyer_id IS NULL)',[orderId,buyerId])).rows[0];if(!ref)throw notFound();
 await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
 const order=(await c.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
 if(!order||(order.buyer_id!==buyerId&&order.buyer_id!==null)||!order.receipt_hash.equals(hashCode(receipt))||!canDownload(order.status)||order.crypto_mode!=='capsule-v1')throw notFound();
 const row=(await c.query('SELECT envelope FROM capsule_envelopes WHERE id=$1 AND buyer_id=$2',[order.capsule_envelope_id,buyerId])).rows[0];if(!row)throw conflict('Prepared envelope unavailable');return {envelope:row.envelope};
});}
export async function createConversation(buyerId:string,listingId:string,days:number,invitation?:{id:string;capability:string}){return tx(async c=>{
 const listing=(await c.query("SELECT * FROM listings WHERE id=$1 AND status='live' FOR UPDATE",[listingId])).rows[0];if(!listing||listing.seller_id===buyerId)throw notFound();
 if(listing.invitation_only)await invitationAccess(c,listingId,buyerId,invitation);
 await c.query('SELECT id FROM accounts WHERE id=$1 FOR NO KEY UPDATE',[buyerId]);
 if((await c.query('SELECT count(*)::int AS n FROM conversations WHERE buyer_id=$1 AND expires_at>now() AND closed_at IS NULL',[buyerId])).rows[0].n>=25)throw conflict('Too many active conversations');
 const buyer=await currentIdentity(buyerId,c),seller=await currentIdentity(listing.seller_id,c);
 const row=(await c.query('INSERT INTO conversations(listing_id,buyer_id,seller_id,buyer_key_id,seller_key_id,expires_at) VALUES($1,$2,$3,$4,$5,clock_timestamp()+make_interval(days=>$6)) RETURNING *',[listingId,buyerId,listing.seller_id,buyer.id,seller.id,days])).rows[0];return {...row,buyerIdentity:buyer.public_identity,sellerIdentity:seller.public_identity};
});}
async function member(accountId:string,id:string,db=pool){const row=(await db.query('SELECT * FROM conversations WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2) AND expires_at>now() AND closed_at IS NULL',[id,accountId])).rows[0];if(!row)throw notFound();return row;}
export async function postMessage(accountId:string,id:string,input:{id:string;buyer:unknown;seller:unknown}){return tx(async c=>{
 const conv=(await c.query('SELECT * FROM conversations WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!conv||![conv.buyer_id,conv.seller_id].includes(accountId)||(await c.query('SELECT $1::timestamptz<=now() AS expired',[conv.expires_at])).rows[0].expired||conv.closed_at||conv.sequence>=500)throw notFound();
 const buyer=await checkEnvelope(input.buyer,'message',id,accountId,conv.buyer_id,c),seller=await checkEnvelope(input.seller,'message',id,accountId,conv.seller_id,c);
 if(buyer.recipientKeyId!==conv.buyer_key_id||seller.recipientKeyId!==conv.seller_key_id||buyer.context.nonce!==input.id||seller.context.nonce!==input.id||buyer.senderKeyId!==seller.senderKeyId||Date.parse(buyer.context.expiresAt)>conv.expires_at.getTime()||Date.parse(seller.context.expiresAt)>conv.expires_at.getTime())throw bad('Conversation identity/expiry mismatch');
 await c.query('INSERT INTO encrypted_messages(id,conversation_id,sender_id,sequence,buyer_envelope,seller_envelope) VALUES($1,$2,$3,$4,$5,$6)',[input.id,id,accountId,conv.sequence+1,buyer,seller]);await c.query('UPDATE conversations SET sequence=sequence+1 WHERE id=$1',[id]);return {sequence:conv.sequence+1};
});}
export async function messages(accountId:string,id:string,after:number){const conv=await member(accountId,id);const field=accountId===conv.buyer_id?'buyer_envelope':'seller_envelope';return (await pool.query(`SELECT id,sequence,sender_id,${field} AS envelope,created_at FROM encrypted_messages WHERE conversation_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100`,[id,after])).rows;}
export async function closeConversation(accountId:string,id:string){await member(accountId,id);await pool.query('DELETE FROM conversations WHERE id=$1 AND (buyer_id=$2 OR seller_id=$2)',[id,accountId]);return {deleted:true};}
export async function assignReviewer(orderId:string,reviewerId:string,replace=false){return tx(async c=>{
 const ref=(await c.query('SELECT listing_id FROM orders WHERE id=$1',[orderId])).rows[0];if(!ref)throw notFound();await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
 const order=(await c.query("SELECT buyer_id FROM orders WHERE id=$1 AND status='disputed' FOR UPDATE",[orderId])).rows[0];if(!order)throw conflict('Disputed order required');
 const seller=(await c.query('SELECT seller_id FROM listings WHERE id=$1',[ref.listing_id])).rows[0];if([order.buyer_id,seller.seller_id].includes(reviewerId))throw bad('Independent reviewer required');
 const key=await currentIdentity(reviewerId,c);
 if(replace)await c.query('INSERT INTO dispute_reviewers(order_id,reviewer_id,reviewer_key_id) VALUES($1,$2,$3) ON CONFLICT(order_id) DO UPDATE SET reviewer_id=EXCLUDED.reviewer_id,reviewer_key_id=EXCLUDED.reviewer_key_id,assigned_at=clock_timestamp()',[orderId,reviewerId,key.id]);
 else await c.query('INSERT INTO dispute_reviewers(order_id,reviewer_id,reviewer_key_id) VALUES($1,$2,$3)',[orderId,reviewerId,key.id]);return {reviewerIdentity:key.public_identity};
});}
export async function reviewer(accountId:string,orderId:string){const row=(await pool.query(`SELECT r.*,k.public_identity FROM dispute_reviewers r JOIN orders o ON o.id=r.order_id JOIN listings l ON l.id=o.listing_id JOIN encryption_identities k ON k.id=r.reviewer_key_id WHERE r.order_id=$1 AND $2 IN (o.buyer_id,l.seller_id,r.reviewer_id)`,[orderId,accountId])).rows[0];if(!row)throw notFound();return {reviewerIdentity:row.public_identity};}
export async function submitEvidence(accountId:string,orderId:string,raw:unknown){return tx(async c=>{
 const ref=(await c.query('SELECT listing_id FROM orders WHERE id=$1',[orderId])).rows[0];if(!ref)throw notFound();await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
 const order=(await c.query("SELECT o.*,l.seller_id FROM orders o JOIN listings l ON l.id=o.listing_id WHERE o.id=$1 FOR UPDATE OF o",[orderId])).rows[0];if(!order||order.status!=='disputed'||![order.buyer_id,order.seller_id].includes(accountId))throw notFound();
 const assigned=(await c.query('SELECT * FROM dispute_reviewers WHERE order_id=$1',[orderId])).rows[0];if(!assigned)throw conflict('Reviewer assignment required');
 const envelope=await checkEnvelope(raw,'evidence',orderId,accountId,assigned.reviewer_id,c);
 if(envelope.recipientKeyId!==assigned.reviewer_key_id)throw bad('Reviewer key mismatch');
 if((await c.query('SELECT count(*)::int AS n FROM dispute_evidence WHERE order_id=$1',[orderId])).rows[0].n>=20)throw conflict('Evidence limit reached');
 const expiresAt=(await c.query("SELECT LEAST($1::timestamptz,clock_timestamp()+interval '30 days') AS time",[envelope.context.expiresAt])).rows[0].time;
 const hash=createHash('sha256').update(JSON.stringify(envelope)).digest('hex');await c.query('INSERT INTO dispute_evidence(id,order_id,submitter_id,reviewer_id,envelope,ciphertext_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[envelope.context.nonce,orderId,accountId,assigned.reviewer_id,envelope,hash,expiresAt]);return {evidenceId:envelope.context.nonce,ciphertextSha256:hash};
});}
export async function evidence(accountId:string,orderId:string){
 const assignment=(await pool.query('SELECT 1 FROM dispute_reviewers WHERE order_id=$1 AND reviewer_id=$2',[orderId,accountId])).rowCount;if(!assignment)throw notFound();
 return (await pool.query('SELECT id,submitter_id,envelope,ciphertext_hash,expires_at FROM dispute_evidence WHERE order_id=$1 AND reviewer_id=$2 AND expires_at>now() ORDER BY created_at LIMIT 20',[orderId,accountId])).rows;
}
