import type {FastifyInstance,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {pool} from '../db.ts';
import {allow} from '../lib/ratelimit.ts';
import {HttpError,bad} from '../lib/errors.ts';
import * as control from '../services/assetControl.ts';
import * as invitations from '../services/invitations.ts';
import * as passports from '../services/passports.ts';
import {checkout} from '../services/checkout.ts';
import * as identities from '../services/cryptoIdentity.ts';
import * as commerce from '../services/privateCommerce.ts';
import {storeAsset,removeAsset} from '../services/storage.ts';
import {validateCapsule} from '../../packages/client-crypto/src/index.ts';
const id=z.object({id:z.string().uuid()});
type Guards={account:(req:FastifyRequest)=>Promise<{id:string}>;admin:(req:FastifyRequest)=>void;limit:(req:FastifyRequest,bucket:string,n:number,ms:number)=>Promise<void>};
export function privateRoutes(app:FastifyInstance,guards:Guards){
 app.post('/api/encryption/challenges',async req=>{const who=await guards.account(req);await guards.limit(req,'identity',20,3600000);return identities.challengeIdentity(who.id,req.body);});
 app.post('/api/encryption/challenges/:id/complete',async req=>{const who=await guards.account(req);return identities.registerIdentity(who.id,id.parse(req.params).id,z.object({secret:z.string().max(100),signature:z.string().max(100),previousSignature:z.string().max(100).optional()}).strict().parse(req.body));});
 app.get('/api/encryption/identities/:id',async req=>{await guards.account(req);return identities.identityHistory(id.parse(req.params).id);});
 app.post('/api/encryption/reset',async req=>{const who=await guards.account(req);await guards.limit(req,'identity-reset',3,3600000);if(!await allow('identity-reset-account:'+who.id,3,3600000))throw new HttpError(429,'Too many requests');const body=z.object({passphrase:z.string().max(200),acknowledgeKeyLoss:z.literal(true)}).strict().parse(req.body);return identities.resetIdentity(who.id,body.passphrase);});
 app.post('/api/capsules',{bodyLimit:24*1024*1024},async req=>{
  const who=await guards.account(req);await guards.limit(req,'capsules',20,3600000);if(!Buffer.isBuffer(req.body))throw bad('Upload encoded capsule JSON as octet-stream');
  let capsule;try{capsule=JSON.parse(req.body.toString('utf8'));z.object({v:z.literal(1),id:z.string().uuid(),chunkSize:z.number(),size:z.number(),prefix:z.string().max(20),metadata:z.string().max(11000),chunks:z.array(z.string().max(1400000)).max(256)}).strict().parse(capsule);validateCapsule(capsule);}catch{throw bad('Invalid capsule format');}
  await identities.currentIdentity(who.id);
  const bytes=Buffer.from(JSON.stringify(capsule));const sha256=createHash('sha256').update(bytes).digest('hex'),asset=storeAsset('private',bytes,'application/octet-stream');
  try{await pool.query("INSERT INTO uploaded_assets(key,owner_id,kind,original_name,file_sha256,crypto_mode,capsule_id) VALUES($1,$2,'private','arcana-capsule.json',$3,'capsule-v1',$4)",[asset.key,who.id,sha256,capsule.id]);}catch(error){removeAsset('private',asset.key);throw error;}
  return {...asset,sha256,capsuleId:capsule.id,cryptoMode:'capsule-v1'};
 });
 app.post('/api/listings/:id/capsule-envelope',async req=>{const who=await guards.account(req),body=z.object({buyerId:z.string().uuid(),envelope:identities.envelopeSchema}).strict().parse(req.body);return commerce.prepareCapsule(who.id,id.parse(req.params).id,body.buyerId,body.envelope);});
 app.post('/api/orders/:id/key-envelope',async req=>{const who=await guards.account(req),body=z.object({receiptCode:z.string().min(10).max(100)}).strict().parse(req.body);return commerce.fundedEnvelope(who.id,id.parse(req.params).id,body.receiptCode);});
 app.post('/api/conversations',async req=>{const who=await guards.account(req);await guards.limit(req,'conversations',25,3600000);const body=z.object({listingId:z.string().uuid(),days:z.number().int().min(1).max(30).default(7),invitation:z.object({id:z.string().uuid(),capability:z.string().min(40).max(100)}).strict().optional()}).strict().parse(req.body);return commerce.createConversation(who.id,body.listingId,body.days,body.invitation);});
 app.get('/api/conversations',async req=>commerce.listConversations((await guards.account(req)).id));
 app.post('/api/conversations/:id/messages',async req=>{const who=await guards.account(req);await guards.limit(req,'messages',60,60000);return commerce.postMessage(who.id,id.parse(req.params).id,z.object({id:z.string().uuid(),buyer:identities.envelopeSchema,seller:identities.envelopeSchema}).strict().parse(req.body));});
 app.get('/api/conversations/:id/messages',async req=>{const who=await guards.account(req),query=z.object({after:z.coerce.number().int().min(0).default(0)}).parse(req.query);return commerce.messages(who.id,id.parse(req.params).id,query.after);});
 app.delete('/api/conversations/:id',async req=>commerce.closeConversation((await guards.account(req)).id,id.parse(req.params).id));
 app.post('/api/admin/orders/:id/reviewer',async req=>{guards.admin(req);const body=z.object({reviewerId:z.string().uuid(),replaceAssignment:z.boolean().default(false)}).strict().parse(req.body);return commerce.assignReviewer(id.parse(req.params).id,body.reviewerId,body.replaceAssignment);});
 app.get('/api/orders/:id/reviewer',async req=>commerce.reviewer((await guards.account(req)).id,id.parse(req.params).id));
 app.post('/api/orders/:id/evidence',async req=>{const who=await guards.account(req),body=z.object({consent:z.literal(true),envelope:identities.envelopeSchema}).strict().parse(req.body);return commerce.submitEvidence(who.id,id.parse(req.params).id,body.envelope);});
 app.get('/api/orders/:id/evidence',async req=>commerce.evidence((await guards.account(req)).id,id.parse(req.params).id));
 app.post('/api/listings/:id/invitations',async req=>{const who=await guards.account(req);await guards.limit(req,'invitations',20,3600000);const body=z.object({buyerId:z.string().uuid().optional(),priceUsdCents:z.number().int().min(50).max(100000000).optional(),offerId:z.string().uuid().optional(),hours:z.number().int().min(1).max(168).default(24)}).strict().parse(req.body);return invitations.createInvitation(who.id,id.parse(req.params).id,body);});
 app.post('/api/invitations/:id/inspect',async req=>{const who=await guards.account(req),body=z.object({capability:z.string().min(40).max(100)}).strict().parse(req.body);return invitations.inspectInvitation(who.id,id.parse(req.params).id,body.capability);});
 app.post('/api/invitations/:id/redeem',async req=>{const who=await guards.account(req);await guards.limit(req,'checkout',12,3600000);const body=z.object({capability:z.string().min(40).max(100)}).strict().parse(req.body),inviteId=id.parse(req.params).id;const invitation=await invitations.inspectInvitation(who.id,inviteId,body.capability);return checkout(who.id,invitation.listing_id,undefined,{id:inviteId,capability:body.capability});});
 app.delete('/api/invitations/:id',async req=>invitations.revokeInvitation((await guards.account(req)).id,id.parse(req.params).id));
 app.post('/api/passports',async req=>{const who=await guards.account(req);await guards.limit(req,'passports',20,3600000);return passports.issuePassport(who.id,z.object({kind:z.enum(['completed_acquisition','seller_deliveries']),orderId:z.string().uuid().optional(),minimum:z.number().int().min(1).max(1000000).default(1),discloseCount:z.boolean().default(false),audience:z.string().min(1).max(120),hours:z.number().int().min(1).max(168).default(24)}).strict().parse(req.body));});
 app.post('/api/passports/verify',async req=>{const body=z.object({proof:z.unknown(),audience:z.string().max(120)}).strict().parse(req.body);return passports.verifyPassport(body.proof,body.audience);});
 app.delete('/api/passports/:id',async req=>passports.revokePassport((await guards.account(req)).id,id.parse(req.params).id));
 app.get('/api/passports/issuers',async()=>passports.issuerHistory());
 app.post('/api/asset-control/challenges',async req=>{const who=await guards.account(req);await guards.limit(req,'asset-control',10,3600000);const body=z.object({kind:z.enum(['dns','github','evm']),subject:z.string().min(1).max(253),chainId:z.number().int().optional()}).strict().parse(req.body);return control.createControlChallenge(who.id,body.kind,body.subject,body.chainId);});
 app.post('/api/asset-control/challenges/:id/verify',async req=>{const who=await guards.account(req);await guards.limit(req,'asset-control-verify',20,3600000);const body=z.object({signature:z.string().max(200).optional()}).strict().parse(req.body);return control.verifyControl(who.id,id.parse(req.params).id,body.signature);});
 app.get('/api/asset-control/verifications',async req=>control.controlVerifications((await guards.account(req)).id));

 app.post('/api/admin/passport-issuers/:key/revoke',async req=>{guards.admin(req);return passports.revokeIssuer(z.object({key:z.string().regex(/^[a-f0-9]{64}$/)}).parse(req.params).key);});

}
