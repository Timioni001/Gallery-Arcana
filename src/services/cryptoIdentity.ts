import {randomUUID,randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {Db} from '../db.ts';
import {pool,tx} from '../db.ts';
import {config} from '../config.ts';
import {bad,conflict,notFound,unauthorized} from '../lib/errors.ts';
import {sha256,verifyPassphrase} from '../lib/crypto.ts';
import {validatePublicIdentity,sealChallenge,b64,registrationStatement,verifyStatement,verifyEnvelope,type PublicIdentity,type Envelope} from '../../packages/client-crypto/src/index.ts';
const base64=z.string().regex(/^[A-Za-z0-9_-]+$/);
export const publicIdentitySchema=z.object({v:z.literal(1),keyId:z.string().uuid(),accountId:z.string().uuid(),origin:z.string().url(),encryptionKey:base64.max(100),signingKey:base64.max(100),fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const envelopeSchema=z.object({v:z.literal(1),senderKeyId:z.string().uuid(),recipientKeyId:z.string().uuid(),context:z.object({origin:z.string().url().max(200),purpose:z.enum(['capsule-key','message','evidence']),resourceId:z.string().uuid(),nonce:z.string().uuid(),senderAccountId:z.string().uuid(),recipientAccountId:z.string().uuid(),expiresAt:z.iso.datetime()}).strict(),enc:base64.max(100),ciphertext:base64.max(87410),signature:base64.max(100)}).strict();
export async function currentIdentity(accountId:string,db:Db=pool){
 const row=(await db.query('SELECT * FROM encryption_identities WHERE account_id=$1 AND revoked_at IS NULL FOR SHARE',[accountId])).rows[0];if(!row)throw conflict('An active encryption identity is required');return row;
}
export async function identityById(id:string,db:Db=pool,active=false){const row=(await db.query(`SELECT * FROM encryption_identities WHERE id=$1 ${active?'AND revoked_at IS NULL FOR SHARE':''}`,[id])).rows[0];if(!row)throw conflict('Encryption identity unavailable');return row;}
export async function identityHistory(accountId:string){return (await pool.query('SELECT public_identity,binding,epoch,revision,created_at,revoked_at FROM encryption_identities WHERE account_id=$1 ORDER BY revision',[accountId])).rows;}
export async function challengeIdentity(accountId:string,raw:unknown){
 const proposed=publicIdentitySchema.parse(raw);if(proposed.accountId!==accountId||proposed.origin!==config.publicOrigin)throw bad('Identity account/origin mismatch');
 try{await validatePublicIdentity(proposed);}catch{throw bad('Invalid public keys');}
 return tx(async c=>{
  const account=(await c.query('SELECT encryption_epoch FROM accounts WHERE id=$1 FOR NO KEY UPDATE',[accountId])).rows[0];
  const previous=(await c.query('SELECT id FROM encryption_identities WHERE account_id=$1 AND epoch=$2 ORDER BY revision DESC LIMIT 1',[accountId,account.encryption_epoch])).rows[0];
  const id=randomUUID(),secret=randomBytes(32),expiresAt=(await c.query("SELECT clock_timestamp()+interval '5 minutes' AS time")).rows[0].time.toISOString();
  const statement=JSON.stringify(['arcana-registration-challenge/v1',id,accountId,config.publicOrigin,proposed.fingerprint,previous?.id??null,account.encryption_epoch,expiresAt]);
  await c.query('DELETE FROM identity_challenges WHERE account_id=$1 OR expires_at<=now()',[accountId]);
  await c.query('INSERT INTO identity_challenges(id,account_id,epoch,current_id,proposed,statement,secret_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,accountId,account.encryption_epoch,previous?.id??null,proposed,statement,sha256(b64(secret)),expiresAt]);
  return {challengeId:id,statement,sealed:await sealChallenge(proposed,secret,statement),expiresAt};
 });
}
export async function registerIdentity(accountId:string,id:string,input:{secret:string;signature:string;previousSignature?:string}){
 return tx(async c=>{
  const account=(await c.query('SELECT encryption_epoch FROM accounts WHERE id=$1 FOR NO KEY UPDATE',[accountId])).rows[0];
  const challenge=(await c.query('SELECT * FROM identity_challenges WHERE id=$1 AND account_id=$2 AND expires_at>clock_timestamp() FOR UPDATE',[id,accountId])).rows[0];if(!challenge||challenge.epoch!==account.encryption_epoch||!challenge.secret_hash.equals(sha256(input.secret)))throw unauthorized('Invalid registration challenge');
  const latest=(await c.query('SELECT * FROM encryption_identities WHERE account_id=$1 AND epoch=$2 ORDER BY revision DESC LIMIT 1',[accountId,account.encryption_epoch])).rows[0];if((latest?.id??null)!==challenge.current_id)throw conflict('Identity changed');
  const statement=registrationStatement(challenge.statement,input.secret);
  if(!await verifyStatement(challenge.proposed,statement,input.signature)||(latest&&!await verifyStatement(latest.public_identity,statement,input.previousSignature??'')))throw unauthorized('Identity continuity signature required');
  await c.query('UPDATE encryption_identities SET revoked_at=clock_timestamp() WHERE account_id=$1 AND revoked_at IS NULL',[accountId]);
  await c.query(`INSERT INTO encryption_identities(id,account_id,epoch,public_identity,binding,revision)
    VALUES($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(revision),0)+1 FROM encryption_identities WHERE account_id=$2))`,[challenge.proposed.keyId,accountId,challenge.epoch,challenge.proposed,{statement:challenge.statement,secret:input.secret,signature:input.signature,previousSignature:input.previousSignature??null,previousKeyId:challenge.current_id}]);
  await c.query('UPDATE trade_passports SET revoked_at=COALESCE(revoked_at,now()) WHERE account_id=$1',[accountId]);
  await c.query('DELETE FROM identity_challenges WHERE account_id=$1',[accountId]);return {identity:challenge.proposed,epoch:challenge.epoch};
 });
}
/** Explicit continuity break, requires fresh passphrase knowledge in addition to the session. */
export async function resetIdentity(accountId:string,passphrase:string){
 const row=(await pool.query('SELECT pass_hash FROM accounts WHERE id=$1',[accountId])).rows[0];if(!row||!await verifyPassphrase(passphrase,row.pass_hash))throw unauthorized();
 return tx(async c=>{await c.query('SELECT id FROM accounts WHERE id=$1 FOR NO KEY UPDATE',[accountId]);await c.query('UPDATE encryption_identities SET revoked_at=COALESCE(revoked_at,now()) WHERE account_id=$1',[accountId]);await c.query('DELETE FROM identity_challenges WHERE account_id=$1',[accountId]);const result=await c.query('UPDATE accounts SET encryption_epoch=encryption_epoch+1 WHERE id=$1 RETURNING encryption_epoch',[accountId]);await c.query('UPDATE trade_passports SET revoked_at=COALESCE(revoked_at,now()) WHERE account_id=$1',[accountId]);return {epoch:result.rows[0].encryption_epoch,continuityLost:true,oldCiphertextRecoverable:false};});
}
export async function checkEnvelope(raw:unknown,purpose:Envelope['context']['purpose'],resourceId:string,senderId:string,recipientId:string,db:Db=pool){
 const e=envelopeSchema.parse(raw);
 if(e.context.origin!==config.publicOrigin||e.context.purpose!==purpose||e.context.resourceId!==resourceId||e.context.senderAccountId!==senderId||e.context.recipientAccountId!==recipientId)throw bad('Envelope context mismatch');
 const [sender,recipient]=await Promise.all([identityById(e.senderKeyId,db,true),identityById(e.recipientKeyId,db,true)]);
 if(sender.account_id!==senderId||recipient.account_id!==recipientId||!await verifyEnvelope(e,sender.public_identity,recipient.public_identity))throw unauthorized('Invalid envelope authentication');
 const valid=(await db.query('SELECT $1::timestamptz>clock_timestamp() AND $1::timestamptz<=clock_timestamp()+interval \'90 days\' AS valid',[e.context.expiresAt])).rows[0].valid;
 if(!valid)throw bad('Envelope expiry must be within 90 days');return e;
}
