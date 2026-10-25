import {createServer} from 'node:http';
import {timingSafeEqual,createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {config} from './config.ts';
import {pool,tx} from './db.ts';
import {getWallet} from './wallet/index.ts';
import {DatabaseMockWallet} from './wallet/databaseMock.ts';
import {scanOnce,topUpAddressPool} from './jobs/watcher.ts';
import {runPayouts} from './jobs/payouts.ts';
import {scrubOrders} from './jobs/privacy.ts';
import {releaseExpired} from './services/checkout.ts';
import {refreshQuote} from './services/priceFeed.ts';
import {log,errorCode} from './lib/log.ts';
import {registerWorker,heartbeatWorker} from './jobs/workerHealth.ts';
const wallet=getWallet();
const instanceId=randomUUID();
let lastQuote=0,stopping=false,ready=false,timer:NodeJS.Timeout|undefined,inflight:Promise<void>=Promise.resolve(),lastPrivacy=0,failures=0;
const guard=await pool.connect().catch(async()=>{log('worker_start_failed',{level:'error'});await pool.end();process.exit(1);});
let locked=false;try{locked=(await guard.query('SELECT pg_try_advisory_lock(174428,5) AS locked')).rows[0].locked;}catch{log('worker_start_failed',{level:'error'});}
if(!locked){log('worker_lock_unavailable',{level:'error'});guard.release();await pool.end();process.exit(1);}
try{
  if(!(await guard.query("SELECT 1 FROM schema_migrations WHERE version='014_waitlist.sql'")).rowCount)throw new Error('Migrations required');
  await registerWorker(guard,instanceId);
}catch{log('worker_start_failed',{level:'error'});guard.release(true);await pool.end();process.exit(1);}
const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'&&req.url==='/health'){res.end(JSON.stringify({ok:true,mode:config.walletDriver}));return;}
  if(req.method==='GET'&&req.url==='/ready'){res.writeHead(ready?200:503).end(JSON.stringify({ready,mode:config.walletDriver}));return;}
  if(stopping||req.method!=='POST'||req.url!=='/dev/pay'||!config.simulatorToken||!(wallet instanceof DatabaseMockWallet)){res.writeHead(404).end('{}');return;}
  const expected=Buffer.from(config.simulatorToken),provided=Buffer.from(req.headers.authorization?.replace(/^Bearer /,'')??'');
  const digest=(v:Buffer)=>createHash('sha256').update(v).digest();
  if(!timingSafeEqual(digest(expected),digest(provided))){res.writeHead(401).end('{}');return;}
  try{
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2048){res.writeHead(413).end('{}');return;}}
    const input=z.object({address:z.string().max(350),zat:z.string().regex(/^[0-9]{1,16}$/),memo:z.string().max(512).nullable().optional()}).parse(JSON.parse(body));
    await wallet.simulatePayment(input.address,BigInt(input.zat),input.memo??null);
    res.end(JSON.stringify({accepted:true,mode:'mock'}));
  }catch{res.writeHead(400).end(JSON.stringify({error:'Invalid mock payment'}));}
});
async function heartbeat(value:boolean){if(!await heartbeatWorker(pool,instanceId,value))throw new Error('Worker ownership lost');}
async function cycle(){
  try{
    if(!(await wallet.syncStatus()).ready)throw new Error('Wallet is not synchronized');
    // A failed quote refresh pauses new checkouts (stale price) but never blocks settlement.
    if(config.priceSource==='market'&&Date.now()-lastQuote>60_000){lastQuote=Date.now();await refreshQuote().catch(()=>{});}
    await topUpAddressPool(wallet);if(stopping)return;
    if(config.demoAutopaySeconds&&wallet instanceof DatabaseMockWallet)await wallet.autopay(config.demoAutopaySeconds);
    await tx(c=>releaseExpired(c));if(stopping)return;
    await scanOnce(wallet);if(stopping)return;
    await runPayouts(wallet);if(stopping)return;
    if(Date.now()-lastPrivacy>3600_000){await scrubOrders();lastPrivacy=Date.now();}
    if(stopping)return;
    await heartbeat(true);ready=true;failures=0;
  }catch(error){ready=false;failures++;await heartbeat(false).catch(()=>{});log('worker_cycle_failed',{code:errorCode(error),level:'error'});}
  if(!stopping)timer=setTimeout(()=>{inflight=cycle();},Math.min(30000,config.workerPollMs*2**Math.min(failures,4)));
}
async function stop(){
  if(stopping)return;stopping=true;ready=false;if(timer)clearTimeout(timer);
  const deadline=setTimeout(()=>process.exit(1),15000).unref();
  await new Promise<void>(resolve=>server.close(()=>resolve()));await inflight;
  await heartbeat(false).catch(()=>{});await guard.query('SELECT pg_advisory_unlock(174428,5)').catch(()=>{});guard.release();await pool.end();clearTimeout(deadline);
}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
guard.on('error',()=>{log('worker_lock_lost',{level:'error'});process.exitCode=1;void stop();});
server.requestTimeout=5000;server.headersTimeout=5000;
server.on('error',()=>{log('worker_server_failed',{level:'error'});void stop();process.exitCode=1;});
server.listen(config.workerPort,'127.0.0.1',()=>log('worker_started'));
inflight=cycle();
