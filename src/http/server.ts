import Fastify from 'fastify';
import {issuerReady} from '../services/passports.ts';
import {privateRoutes} from './privateRoutes.ts';
import type {FastifyReply,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {timingSafeEqual,createHash} from 'node:crypto';
import {log,errorCode} from '../lib/log.ts';
import {config} from '../config.ts';
import {pool} from '../db.ts';
import {HttpError,unauthorized,notFound,forbidden} from '../lib/errors.ts';
import {allow} from '../lib/ratelimit.ts';
import * as gate from '../services/gate.ts';
import * as listings from '../services/listings.ts';
import * as offers from '../services/offers.ts';
import * as checkout from '../services/checkout.ts';
import * as acquisitions from '../services/acquisitions.ts';
import {attestationKeys,publicVerificationKey} from '../services/attestationKeys.ts';
import {storeAsset,previewStream,sanitizePreview,removeAsset,validateAssetKey} from '../services/storage.ts';

type Who={id:string;alias:string;hasPayout:boolean};
const COOKIE='arc';
const cookieOptions=`Path=/; HttpOnly; SameSite=Strict; Max-Age=${config.sessionDays*86400}${config.publicOrigin.startsWith('https:')?'; Secure':''}`;
const cookie=(reply:FastifyReply,token:string)=>reply.header('set-cookie',`${COOKIE}=${token}; ${cookieOptions}`);
function token(req:FastifyRequest){
  const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  return bearer??req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??null;
}
const identities=new WeakMap<FastifyRequest,Promise<Who|null>>();
async function current(req:FastifyRequest):Promise<Who|null>{
  if(!identities.has(req)){const t=token(req);identities.set(req,t&&/^[A-Za-z0-9_-]{43}$/.test(t)?gate.loadSession(t):Promise.resolve(null));}
  return identities.get(req)!;
}
async function requireAccount(req:FastifyRequest):Promise<Who>{const a=await current(req);if(!a)throw unauthorized();return a;}
async function limit(req:FastifyRequest,bucket:string,n:number,ms:number){
  if(!await allow(`${bucket}:${req.ip}`,n,ms))throw new HttpError(429,'Too many requests');
}
async function limitAccount(accountId:string,bucket:string,n:number,ms:number){
  if(!await allow(`account:${accountId}:${bucket}`,n,ms))throw new HttpError(429,'Too many requests');
}
function requireAdmin(req:FastifyRequest){
  if(!config.adminToken||!['127.0.0.1','::1'].includes(req.ip)||typeof req.headers['x-admin-token']!=='string')throw notFound();
  const digest=(s:string)=>createHash('sha256').update(s).digest();
  if(!timingSafeEqual(digest(req.headers['x-admin-token']),digest(config.adminToken)))throw notFound();
}
const id=z.object({id:z.string().uuid()});
const amount=z.number().int().min(50).max(100_000_000);

export function buildServer(){
  const app=Fastify({logger:false,trustProxy:false,bodyLimit:1024*1024});
  app.addContentTypeParser('application/octet-stream',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('Referrer-Policy','no-referrer');
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('Cache-Control','no-store');
    reply.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (config.publicOrigin.startsWith('https:')) reply.header('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    if(!['/api/health','/api/ready'].includes(req.url.split('?')[0]!))await limit(req,'api',180,60_000);
    if((req.routeOptions.url?.startsWith('/api/assets/')||req.routeOptions.url==='/api/capsules')&&req.method==='POST'){
      const who=await requireAccount(req);await limit(req,'uploads',40,60*60_000);await limitAccount(who.id,'uploads',40,60*60_000);
    }
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if(req.headers['sec-fetch-site']==='cross-site')throw forbidden('Cross-site request rejected');
      const who=await current(req);if(who)await limitAccount(who.id,'mutations',100,60_000);
      if(req.headers['x-arcana-action']!=='1')throw forbidden('Missing request verification header');
      if(config.publicOrigin && req.headers.origin && req.headers.origin!==config.publicOrigin)
        throw forbidden('Invalid request origin');
    }
  });
  app.setErrorHandler((err:any,_req,reply)=>{
    if(err instanceof HttpError)return reply.status(err.status).send({error:err.message});
    if(err instanceof z.ZodError)return reply.status(400).send({error:'Invalid input',details:err.issues.map((i:any)=>({path:i.path,code:i.code}))});
    if([400,413,415].includes(err.statusCode))return reply.status(err.statusCode).send({error:'Invalid request'});
    if(['23505','23503','23514'].includes(err.code))return reply.status(409).send({error:'Request conflicts with current state'});
    log('api_error',{code:errorCode(err),level:'error'});
    return reply.status(500).send({error:'Internal error'});
  });
  app.get('/',()=>({name:'Gallery Arcana API',version:'0.5.0',documentation:'README.md',frontend:false}));
  app.get('/api/health',()=>({ok:true,mode:config.walletDriver,network:config.network}));
  app.get('/api/ready',async(_req,reply)=>{
    try{
      validateAssetKey();attestationKeys();
      const db=await pool.query("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='010_asset_control.sql') AND EXISTS(SELECT 1 FROM worker_health WHERE name='payments' AND ready AND heartbeat_at>now()-interval '30 seconds') AND EXISTS(SELECT 1 FROM address_pool WHERE NOT claimed) AS ready");
      if(!db.rows[0].ready||!await issuerReady())return reply.status(503).send({ready:false});
      return {ready:true,mode:'mock',network:'test'};
    }catch{return reply.status(503).send({ready:false});}
  });

  app.post('/api/signup',async(req,reply)=>{
    await limit(req,'signup',6,60*60_000);
    const body=gate.signupSchema.parse(req.body);
    const session=await gate.signup(body.alias,body.passphrase);
    cookie(reply,session.sessionToken);
    return {account:session.account};
  });
  app.post('/api/login',async(req,reply)=>{
    await limit(req,'login',10,10*60_000);
    const {alias,passphrase}=z.object({alias:z.string().max(24),passphrase:z.string().max(200)}).parse(req.body);
    if(!await allow('login-alias:'+alias.trim().toLowerCase(),10,10*60_000))throw new HttpError(429,'Too many requests');
    const session=await gate.login(alias,passphrase);
    cookie(reply,session.sessionToken);
    return {account:session.account};
  });
  app.post('/api/logout',async(req,reply)=>{
    const t=token(req);if(t)await gate.logout(t);
    reply.header('set-cookie',`${COOKIE}=; ${cookieOptions.replace(/Max-Age=\d+/,'Max-Age=0')}`);
    return {ok:true};
  });
  app.post('/api/session/rotate',async(req,reply)=>{
    const t=token(req);if(!t)throw unauthorized();cookie(reply,await gate.rotateSession(t));return {ok:true};
  });
  app.post('/api/sessions/revoke',async(req,reply)=>{
    await gate.revokeSessions((await requireAccount(req)).id);
    reply.header('set-cookie',`${COOKIE}=; ${cookieOptions.replace(/Max-Age=\d+/,'Max-Age=0')}`);return {ok:true};
  });
  app.get('/api/me',async req=>({account:await current(req)}));
  app.put('/api/me/payout',async req=>gate.updatePayout((await requireAccount(req)).id,
    z.object({address:z.string()}).parse(req.body).address));

  app.get('/api/listings',req=>{
    const filters=z.object({category:z.enum(['digital','collectible','onchain','other']).optional(),q:z.string().max(70).optional(),limit:z.coerce.number().int().min(1).max(80).default(40),offset:z.coerce.number().int().min(0).max(10000).default(0)}).parse(req.query);
    return listings.browse({category:filters.category,query:filters.q,limit:filters.limit,offset:filters.offset});
  });
  app.get('/api/listings/mine',async req=>listings.mine((await requireAccount(req)).id));
  app.get('/api/listings/:id',async req=>listings.getListing(id.parse(req.params).id,(await current(req))?.id));
  app.post('/api/listings',async req=>{
    await limit(req,'listing',30,60*60_000);
    const who=await requireAccount(req); await limitAccount(who.id,'listing',30,60*60_000);
    return listings.createListing(who.id,listings.listingSchema.parse(req.body));
  });
  app.patch('/api/listings/:id',async req=>listings.editListing((await requireAccount(req)).id,id.parse(req.params).id,listings.listingPatchSchema.parse(req.body)));
  app.post('/api/listings/:id/status',async req=>{
    const who=await requireAccount(req);
    const {status}=z.object({status:z.enum(['live','paused'])}).parse(req.body);
    return listings.setListingStatus(who.id,id.parse(req.params).id,status);
  });
  app.post('/api/assets/:kind',{bodyLimit:26*1024*1024},async(req)=>{
    const who=await requireAccount(req);
    const kind=z.object({kind:z.enum(['previews','private'])}).parse(req.params).kind;
    const data=req.body;
    if(!Buffer.isBuffer(data))throw new HttpError(415,'Upload raw bytes as application/octet-stream');
    const mime=String(req.headers['x-asset-type']??'');
    const uploaded=storeAsset(kind,kind==='previews'?await sanitizePreview(data,mime):data,mime);
    const original=String(req.headers['x-asset-filename']??'').split(/[\\/]/).at(-1)?.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120)||null;
    const digest=kind==='private'?createHash('sha256').update(data).digest('hex'):null;
    try{await pool.query('INSERT INTO uploaded_assets(key,owner_id,kind,original_name,file_sha256) VALUES($1,$2,$3,$4,$5)',[uploaded.key,who.id,kind,original,digest]);}
    catch(error){removeAsset(kind,uploaded.key);throw error;}
    return {...uploaded,...(digest?{sha256:digest}:{})};
  });
  app.get('/previews/:key',async(req,reply)=>{
    const key=z.object({key:z.string().regex(/^[a-f0-9]{32}\.(png|jpg|webp)$/)}).parse(req.params).key;
    const stream=previewStream(key);if(!stream)throw notFound();
    const ext=key.split('.').at(-1);
    reply.type(ext==='jpg'?'image/jpeg':ext==='png'?'image/png':'image/webp');
    return reply.send(stream);
  });

  app.post('/api/listings/:id/offers',async req=>{
    await limit(req,'offer',30,60*60_000);
    const who=await requireAccount(req);
    await limitAccount(who.id,'offer',30,60*60_000);
    const body=z.object({amountUsdCents:amount,invitation:z.object({id:z.string().uuid(),capability:z.string().min(40).max(100)}).strict().optional()}).parse(req.body);
    return offers.makeOffer(who.id,id.parse(req.params).id,body.amountUsdCents,body.invitation);
  });
  app.get('/api/offers',async req=>offers.offersFor((await requireAccount(req)).id));
  app.post('/api/offers/:id/action',async req=>{
    const who=await requireAccount(req);
    const {action,counterUsdCents,expectedVersion}=z.object({action:z.enum(['accept','decline','counter','withdraw','accept-counter','decline-counter']),counterUsdCents:amount.optional(),expectedVersion:z.number().int().positive().optional()}).parse(req.body);
    const offerId=id.parse(req.params).id;
    return action==='accept-counter'?offers.acceptCounter(who.id,offerId,expectedVersion):offers.actOnOffer(who.id,offerId,action,counterUsdCents,expectedVersion);
  });

  app.post('/api/listings/:id/checkout',async req=>{
    await limit(req,'checkout',12,60*60_000);
    const who=await requireAccount(req);
    await limitAccount(who.id,'checkout',12,60*60_000);
    const {offerId}=z.object({offerId:z.string().uuid().optional()}).parse(req.body??{});
    return checkout.checkout(who.id,id.parse(req.params).id,offerId);
  });
  app.get('/api/sales',async req=>checkout.sales((await requireAccount(req)).id));
  app.post('/api/orders/:id/receipt',async req=>checkout.renewReceipt((await requireAccount(req)).id,id.parse(req.params).id));
  app.get('/api/orders',async req=>checkout.myOrders((await requireAccount(req)).id));
  app.get('/api/orders/:id',async req=>checkout.orderStatus((await requireAccount(req)).id,id.parse(req.params).id));
  app.get('/api/orders/:id/payment',async req=>checkout.orderPayment((await requireAccount(req)).id,id.parse(req.params).id));
  app.post('/api/files/:id',async(req,reply)=>{
    await limit(req,'downloads',30,10*60_000);
    const code=z.object({receiptCode:z.string().min(10).max(100)}).parse(req.body).receiptCode;
    const file=await acquisitions.downloadAsset((await current(req))?.id,id.parse(req.params).id,code);
    const name=String(file.name||'gallery-arcana-asset.bin').replace(/[^a-zA-Z0-9._ -]/g,'_');
    reply.header('Content-Disposition',`attachment; filename="${name}"`);
    reply.header('X-Arcana-Asset-SHA256',file.digest);
    reply.type('application/octet-stream');
    return reply.send(file.bytes);
  });
  app.post('/api/refunds/late',async req=>{
    await limit(req,'refunds',10,60*60_000);
    const b=z.object({receiptCode:z.string().min(10).max(100),address:z.string().max(350)}).parse(req.body);
    return checkout.claimLateRefund(b.receiptCode,b.address);
  });
  app.get('/api/admin/payouts/stuck',async req=>{
    requireAdmin(req);
    return (await pool.query(`SELECT id,kind,status,attempts,created_at FROM payouts WHERE status IN ('sending','failed')`)).rows;
  });
  app.post('/api/orders/:id/confirm-delivery',async req=>{
    const who=await requireAccount(req),body=z.object({receiptCode:z.string().min(10).max(100),assetSha256:z.string().regex(/^[a-f0-9]{64}$/i)}).strict().parse(req.body);
    return acquisitions.confirmDelivery(who.id,id.parse(req.params).id,body.receiptCode,body.assetSha256);
  });
  app.post('/api/orders/:id/dispute',async req=>{
    const who=await requireAccount(req),body=z.object({reason:z.string().trim().min(10).max(2000)}).strict().parse(req.body);
    return acquisitions.disputeDelivery(who.id,id.parse(req.params).id,body.reason);
  });
  app.post('/api/orders/:id/proof',async req=>{
    const body=z.object({receiptCode:z.string().min(10).max(100)}).strict().parse(req.body);
    return acquisitions.getAcquisitionProof(body.receiptCode,id.parse(req.params).id);
  });
  app.get('/api/proofs/public-key',()=>({algorithm:'Ed25519',publicKey:publicVerificationKey()}));
  app.post('/api/proofs/verify',async req=>({valid:acquisitions.verifySignedTransfer(z.object({proof:z.unknown()}).parse(req.body).proof)}));
  app.get('/api/admin/disputes',async req=>{requireAdmin(req);return acquisitions.adminDisputes();});
  app.post('/api/admin/orders/:id/resolve',async req=>{
    requireAdmin(req);await limit(req,'resolution',20,60_000);
    const body=z.object({decision:z.enum(['release','refund']),refundAddress:z.string().max(350).optional()}).strict().parse(req.body);
    return acquisitions.resolveDispute(id.parse(req.params).id,body.decision,body.refundAddress);
  });
  privateRoutes(app,{account:requireAccount,admin:requireAdmin,limit});
  return app;
}
