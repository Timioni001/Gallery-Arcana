import {createServer} from 'node:http';
import {config} from './config.ts';
import {pool,tx} from './db.ts';
import {getWallet} from './wallet/index.ts';
import type {MockWallet} from './wallet/mock.ts';
import {scanOnce,topUpAddressPool} from './jobs/watcher.ts';
import {runPayouts} from './jobs/payouts.ts';
import {scrubOrders} from './jobs/privacy.ts';
import {releaseExpired} from './services/checkout.ts';
function every(name:string,ms:number,fn:()=>Promise<unknown>){
  let running=false;
  const tick=async()=>{ if(running)return;running=true;try{await fn();}catch(e){console.error(`[${name}]`,e);}finally{running=false;} };
  void tick(); return setInterval(tick,ms);
}
const wallet=getWallet();
every('watcher',5000,()=>scanOnce(wallet));
every('address-pool',30000,()=>topUpAddressPool(wallet));
every('payouts',15000,()=>runPayouts(wallet));
every('expired-orders',10000,()=>tx(c=>releaseExpired(c)));
every('privacy',60*60_000,scrubOrders);
process.on('SIGTERM',async()=>{await pool.end();process.exit(0)});
console.log('Gallery Arcana payment worker started');
if(config.walletDriver==='mock'&&config.network==='test'&&process.env.NODE_ENV!=='production'){
  const mock=wallet as MockWallet;
  createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/dev/pay'){res.writeHead(404).end();return;}
    let body='';for await(const chunk of req){body+=chunk;if(body.length>2048){res.writeHead(413).end();return;}}
    try{
      const {address,zat,memo}=JSON.parse(body);
      mock.simulatePayment(address,BigInt(zat),memo??null);
      res.writeHead(200).end('ok');
    }catch{res.writeHead(400).end('invalid simulated payment');}
  }).listen(8081,'127.0.0.1');
}
