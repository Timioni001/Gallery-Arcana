import {createPrivateKey,createPublicKey,sign,verify,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';

const claimSchema=z.object({version:z.literal(1),orderId:z.string().uuid(),listingId:z.string().uuid(),
  assetSha256:z.string().regex(/^[a-f0-9]{64}$/),finalizedAt:z.iso.datetime(),
  outcome:z.enum(['buyer_accepted','operator_release','auto_release']),paymentMode:z.enum(['mock','testnet'])}).strict();
const proofSchema=z.object({claim:claimSchema,algorithm:z.literal('Ed25519'),signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/)}).strict();
export type TransferClaim=z.infer<typeof claimSchema>;
export type TransferProof=z.infer<typeof proofSchema>;
export function canDownload(status:string){return ['funded','paid','disputed'].includes(status);}
export function canBuyerConfirm(status:string,fileAccessed:boolean){return status==='funded'&&fileAccessed;}
export function equalDigest(expected:string,got:string){
  if(!/^[a-f0-9]{64}$/i.test(expected)||!/^[a-f0-9]{64}$/i.test(got))return false;
  return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(got,'hex'));
}
/** Fixed field order, strict schemas: unsigned extra claims cannot accompany a valid signature. */
export function canonicalClaim(claim:TransferClaim){
  const c=claimSchema.parse(claim);
  return JSON.stringify([c.version,c.orderId,c.listingId,c.assetSha256,c.finalizedAt,c.outcome,c.paymentMode]);
}
export function signTransfer(claim:TransferClaim,privateKeyPem:string):TransferProof{
  const key=createPrivateKey(privateKeyPem);if(key.asymmetricKeyType!=='ed25519')throw new Error('Ed25519 key required');
  const signature=sign(null,Buffer.from(canonicalClaim(claim)),key).toString('base64url');
  return {claim,algorithm:'Ed25519',signature};
}
export function verifyTransfer(proof:unknown,publicKeyPem:string){
  try{
    const parsed=proofSchema.parse(proof),key=createPublicKey(publicKeyPem);
    return key.asymmetricKeyType==='ed25519'&&verify(null,Buffer.from(canonicalClaim(parsed.claim)),key,Buffer.from(parsed.signature,'base64url'));
  }catch{return false;}
}
