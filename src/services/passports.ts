import {createPublicKey,createHash,sign,verify,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {pool,tx,type Db} from '../db.ts';
import {passportSignatureBytes} from '../../packages/client-crypto/src/index.ts';
import {attestationKeys} from './attestationKeys.ts';
import {conflict,notFound} from '../lib/errors.ts';
const claimSchema=z.object({version:z.literal(2),id:z.string().uuid(),keyId:z.string().regex(/^[a-f0-9]{64}$/),kind:z.enum(['completed_acquisition','seller_deliveries']),issuedAt:z.iso.datetime(),expiresAt:z.iso.datetime(),audience:z.string().min(1).max(120),holderFingerprint:z.string().regex(/^[a-f0-9]{64}$/),minimum:z.number().int().min(1).max(1000000),disclosedCount:z.number().int().min(1).max(1000000).optional()}).strict();
const proofSchema=z.object({algorithm:z.literal('Ed25519'),claim:claimSchema,signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/).refine(s=>Buffer.from(s,'base64url').toString('base64url')===s)}).strict();
export type Passport=z.infer<typeof proofSchema>;
export function passportBytes(claim:z.infer<typeof claimSchema>){return Buffer.from(passportSignatureBytes(claimSchema.parse(claim)));}
export async function signingIssuer(db:Db=pool){const keys=attestationKeys(),id=createHash('sha256').update(createPublicKey(keys.publicPem).export({type:'spki',format:'der'})).digest('hex');
 await db.query('INSERT INTO attestation_issuers(id,public_key) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[id,keys.publicPem]);const issuer=(await db.query('SELECT * FROM attestation_issuers WHERE id=$1 FOR SHARE',[id])).rows[0];if(!issuer||issuer.revoked_at||issuer.public_key!==keys.publicPem)throw conflict('Signing issuer is revoked or inconsistent');return {id,...keys};}
export async function issuePassport(accountId:string,input:{kind:'completed_acquisition'|'seller_deliveries';orderId?:string;minimum:number;discloseCount:boolean;audience:string;hours:number}){return tx(async c=>{
 // Serialize with privacy scrubbing/settlement for a selected acquisition.
 let orderId:string|null=null;
 if(input.kind==='completed_acquisition'){
  const ref=(await c.query('SELECT listing_id FROM orders WHERE id=$1',[input.orderId??null])).rows[0];if(!ref)throw notFound();await c.query('SELECT id FROM listings WHERE id=$1 FOR UPDATE',[ref.listing_id]);
  const row=(await c.query(`SELECT o.id FROM orders o JOIN listings l ON l.id=o.listing_id WHERE o.id=$1 AND $2 IN (o.buyer_id,l.seller_id) AND o.status='paid' AND o.delivery_confirmed_at IS NOT NULL`,[input.orderId,accountId])).rows[0];if(!row)throw notFound();orderId=row.id;
 }
 await c.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[accountId]);
 const identity=(await c.query('SELECT public_identity FROM encryption_identities WHERE account_id=$1 AND revoked_at IS NULL',[accountId])).rows[0];if(!identity)throw conflict('Active encryption identity required for holder binding');
 const count=input.kind==='completed_acquisition'?1:(await c.query(`SELECT count(*)::int AS n FROM orders o JOIN listings l ON l.id=o.listing_id WHERE l.seller_id=$1 AND o.status='paid' AND o.delivery_confirmed_at IS NOT NULL`,[accountId])).rows[0].n;
 if(count<input.minimum||input.kind==='completed_acquisition'&&input.minimum!==1)throw conflict('Requested fact is not established');
 const keys=await signingIssuer(c),time=(await c.query('SELECT clock_timestamp() AS issued,clock_timestamp()+make_interval(hours=>$1) AS expiry',[input.hours])).rows[0],id=randomUUID();
 const claim={version:2 as const,id,keyId:keys.id,kind:input.kind,issuedAt:time.issued.toISOString(),expiresAt:time.expiry.toISOString(),audience:input.audience,holderFingerprint:identity.public_identity.fingerprint,minimum:input.minimum,...(input.discloseCount?{disclosedCount:count}:{})};
 const proof={algorithm:'Ed25519' as const,claim,signature:sign(null,passportBytes(claim),keys.privatePem).toString('base64url')};
 await c.query('INSERT INTO trade_passports(id,account_id,source_order_id,issuer_id,proof,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,accountId,orderId,keys.id,proof,time.expiry]);return proof;
});}
export async function verifyPassport(raw:unknown,audience:string){
 const parsed=proofSchema.safeParse(raw);if(!parsed.success)return {valid:false};const p=parsed.data;
 const row=(await pool.query('SELECT public_key,revoked_at FROM attestation_issuers WHERE id=$1',[p.claim.keyId])).rows[0];
 if(!row||row.revoked_at||p.claim.audience!==audience||!verify(null,passportBytes(p.claim),row.public_key,Buffer.from(p.signature,'base64url')))return {valid:false};
 const record=(await pool.query('SELECT revoked_at,expires_at>clock_timestamp() AS current FROM trade_passports WHERE id=$1 AND issuer_id=$2',[p.claim.id,p.claim.keyId])).rows[0];
 if(!record||record.revoked_at||!record.current||Date.parse(p.claim.expiresAt)<=Date.now()||Date.parse(p.claim.issuedAt)>Date.now()+60000)return {valid:false};return {valid:true,claim:p.claim,holderProofRequired:true};
}
export async function revokePassport(accountId:string,id:string){const row=await pool.query('UPDATE trade_passports SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 AND account_id=$2 RETURNING id',[id,accountId]);if(!row.rowCount)throw notFound();return {revoked:true};}
export async function issuerHistory(){return (await pool.query('SELECT id,public_key,created_at,revoked_at FROM attestation_issuers ORDER BY created_at,id')).rows;}
export async function revokeIssuer(id:string){const row=await pool.query('UPDATE attestation_issuers SET revoked_at=COALESCE(revoked_at,now()) WHERE id=$1 RETURNING id',[id]);if(!row.rowCount)throw notFound();return {revoked:true};}

export async function issuerReady(){const key=attestationKeys(),id=createHash('sha256').update(createPublicKey(key.publicPem).export({type:'spki',format:'der'})).digest('hex');return !(await pool.query('SELECT revoked_at FROM attestation_issuers WHERE id=$1',[id])).rows[0]?.revoked_at;}
