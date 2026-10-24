import Fastify from 'fastify';
import type {FastifyReply,FastifyRequest} from 'fastify';
import {z} from 'zod';
import {config} from '../config.ts';
import {pool} from '../db.ts';
import {HttpError,unauthorized,notFound,forbidden} from '../lib/errors.ts';
import {allow} from '../lib/ratelimit.ts';
import {hashCode} from '../lib/crypto.ts';
import * as gate from '../services/gate.ts';
import * as listings from '../services/listings.ts';
import * as offers from '../services/offers.ts';
import * as checkout from '../services/checkout.ts';
import {storeAsset,previewStream,privateBytes} from '../services/storage.ts';

type Who={id:string;alias:string;hasPayout:boolean};
const COOKIE='arc';
const cookieOptions=`Path=/; HttpOnly; SameSite=Strict; Max-Age=${config.sessionDays*86400}${config.publicOrigin.startsWith('https:')?'; Secure':''}`;
const cookie=(reply:FastifyReply,token:string)=>reply.header('set-cookie',`${COOKIE}=${token}; ${cookieOptions}`);
function token(req:FastifyRequest){
  const bearer=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  return bearer??req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)??null;
}
async function current(req:FastifyRequest):Promise<Who|null>{const t=token(req);return t?gate.loadSession(t):null;}
async function requireAccount(req:FastifyRequest):Promise<Who>{const a=await current(req);if(!a)throw unauthorized();return a;}
function limit(req:FastifyRequest,bucket:string,n:number,ms:number){
  if(!allow(`${bucket}:${req.ip}`,n,ms))throw new HttpError(429,'Too many requests');
}
function limitAccount(accountId:string,bucket:string,n:number,ms:number){
  if(!allow(`account:${accountId}:${bucket}`,n,ms))throw new HttpError(429,'Too many requests');
}
const id=z.object({id:z.string().uuid()});
const amount=z.number().int().min(50).max(100_000_000);

export function buildServer(){
  const app=Fastify({logger:false,trustProxy:false,bodyLimit:26*1024*1024});
  app.addContentTypeParser('application/octet-stream',{parseAs:'buffer'},(_req,body,done)=>done(null,body));
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('Referrer-Policy','no-referrer');
    reply.header('X-Content-Type-Options','nosniff');
    reply.header('Cache-Control','no-store');
    reply.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (config.publicOrigin.startsWith('https:')) reply.header('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    if(['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if(req.headers['x-arcana-action']!=='1')throw forbidden('Missing request verification header');
      if(config.publicOrigin && req.headers.origin && req.headers.origin!==config.publicOrigin)
        throw forbidden('Invalid request origin');
    }
  });
  app.setErrorHandler((err:any,_req,reply)=>{
    if(err instanceof HttpError)return reply.status(err.status).send({error:err.message});
    if(err instanceof z.ZodError)return reply.status(400).send({error:'Invalid input',details:err.issues});
    console.error('[api] internal error',err?.message);
    return reply.status(500).send({error:'Internal error'});
  });
  app.get('/',()=>({name:'Gallery Arcana API',version:'0.3.0',documentation:'README.md',frontend:false}));
  app.get('/api/health',()=>({ok:true,mode:config.walletDriver,network:config.network}));

  app.post('/api/signup',async(req,reply)=>{
    limit(req,'signup',6,60*60_000);
    const body=gate.signupSchema.parse(req.body);
    const session=await gate.signup(body.alias,body.passphrase);
    cookie(reply,session.sessionToken);
    return {account:session.account};
  });
  app.post('/api/login',async(req,reply)=>{
    limit(req,'login',10,10*60_000);
    const {alias,passphrase}=z.object({alias:z.string().max(24),passphrase:z.string().max(200)}).parse(req.body);
    const session=await gate.login(alias,passphrase);
    cookie(reply,session.sessionToken);
    return {account:session.account};
  });
  app.post('/api/logout',async(req,reply)=>{
    const t=token(req);if(t)await gate.logout(t);
    reply.header('set-cookie',`${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return {ok:true};
  });
  app.get('/api/me',async req=>({account:await current(req)}));
  app.put('/api/me/payout',async req=>gate.updatePayout((await requireAccount(req)).id,
    z.object({address:z.string()}).parse(req.body).address));

  app.get('/api/listings',req=>{
    const filters=z.object({category:z.enum(['digital','collectible','onchain','other']).optional(),q:z.string().max(70).optional()}).parse(req.query);
    return listings.browse({category:filters.category,query:filters.q});
  });
  app.get('/api/listings/mine',async req=>listings.mine((await requireAccount(req)).id));
  app.get('/api/listings/:id',async req=>listings.getListing(id.parse(req.params).id,(await current(req))?.id));
  app.post('/api/listings',async req=>{
    limit(req,'listing',30,60*60_000);
    const who=await requireAccount(req); limitAccount(who.id,'listing',30,60*60_000);
    return listings.createListing(who.id,listings.listingSchema.parse(req.body));
  });
  app.post('/api/listings/:id/status',async req=>{
    const who=await requireAccount(req);
    const {status}=z.object({status:z.enum(['live','paused'])}).parse(req.body);
    return listings.setListingStatus(who.id,id.parse(req.params).id,status);
  });
  app.post('/api/assets/:kind',async(req)=>{
    limit(req,'uploads',40,60*60_000);
    const who=await requireAccount(req);
    limitAccount(who.id,'uploads',40,60*60_000);
    const kind=z.object({kind:z.enum(['previews','private'])}).parse(req.params).kind;
    const data=req.body;
    if(!Buffer.isBuffer(data))throw new HttpError(415,'Upload raw bytes as application/octet-stream');
    const mime=String(req.headers['x-asset-type']??'');
    const uploaded=storeAsset(kind,data,mime);
    const original=String(req.headers['x-asset-filename']??'').split(/[\\/]/).at(-1)?.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120)||null;
    await pool.query('INSERT INTO uploaded_assets(key,owner_id,kind,original_name) VALUES($1,$2,$3,$4)',[uploaded.key,who.id,kind,original]);
    return uploaded;
  });
  app.get('/previews/:key',async(req,reply)=>{
    const key=z.object({key:z.string().regex(/^[a-f0-9]{32}\.(png|jpg|webp)$/)}).parse(req.params).key;
    const stream=previewStream(key);if(!stream)throw notFound();
    const ext=key.split('.').at(-1);
    reply.type(ext==='jpg'?'image/jpeg':ext==='png'?'image/png':'image/webp');
    return reply.send(stream);
  });

  app.post('/api/listings/:id/offers',async req=>{
    limit(req,'offer',30,60*60_000);
    const who=await requireAccount(req);
    limitAccount(who.id,'offer',30,60*60_000);
    return offers.makeOffer(who.id,id.parse(req.params).id,z.object({amountUsdCents:amount}).parse(req.body).amountUsdCents);
  });
  app.get('/api/offers',async req=>offers.offersFor((await requireAccount(req)).id));
  app.post('/api/offers/:id/action',async req=>{
    const who=await requireAccount(req);
    const {action,counterUsdCents}=z.object({action:z.enum(['accept','decline','counter','withdraw','accept-counter']),counterUsdCents:amount.optional()}).parse(req.body);
    const offerId=id.parse(req.params).id;
    return action==='accept-counter'?offers.acceptCounter(who.id,offerId):offers.actOnOffer(who.id,offerId,action,counterUsdCents);
  });

  app.post('/api/listings/:id/checkout',async req=>{
    limit(req,'checkout',12,60*60_000);
    const who=await requireAccount(req);
    limitAccount(who.id,'checkout',12,60*60_000);
    const {offerId}=z.object({offerId:z.string().uuid().optional()}).parse(req.body??{});
    return checkout.checkout(who.id,id.parse(req.params).id,offerId);
  });
  app.get('/api/orders',async req=>checkout.myOrders((await requireAccount(req)).id));
  app.get('/api/orders/:id',async req=>checkout.orderStatus((await requireAccount(req)).id,id.parse(req.params).id));
  app.get('/api/orders/:id/payment',async req=>checkout.orderPayment((await requireAccount(req)).id,id.parse(req.params).id));
  app.post('/api/files/:id',async(req,reply)=>{
    limit(req,'downloads',30,10*60_000);
    const code=z.object({receiptCode:z.string().min(10)}).parse(req.body).receiptCode;
    const {rows}=await pool.query(`SELECT l.file_key,l.file_name FROM orders o JOIN listings l ON l.id=o.listing_id
      WHERE o.listing_id=$1 AND o.status='paid' AND o.receipt_hash=$2 AND l.delivery='download'`,
      [id.parse(req.params).id,hashCode(code)]);
    if(!rows[0]?.file_key)throw notFound('Paid downloadable file not found');
    const file=privateBytes(rows[0].file_key);if(!file)throw notFound('File unavailable');
    const name=String(rows[0].file_name||'gallery-arcana-asset.bin').replace(/[^a-zA-Z0-9._ -]/g,'_');
    reply.header('Content-Disposition',`attachment; filename="${name}"`);
    reply.type('application/octet-stream');
    return reply.send(file);
  });
  app.post('/api/refunds/late',async req=>{
    limit(req,'refunds',10,60*60_000);
    const b=z.object({receiptCode:z.string(),address:z.string()}).parse(req.body);
    return checkout.claimLateRefund(b.receiptCode,b.address);
  });
  app.get('/api/admin/payouts/stuck',async req=>{
    if(config.adminToken==='change-me'||req.headers['x-admin-token']!==config.adminToken)throw unauthorized();
    return (await pool.query(`SELECT id,kind,status,attempts,created_at FROM payouts WHERE status IN ('sending','failed')`)).rows;
  });
  return app;
}
