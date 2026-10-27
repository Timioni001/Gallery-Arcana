// Local regtest verification of the Zallet adapter against the real Zebra + Zallet
// binaries from the Zcash Foundation Z3 stack. Regtest coins have no value.
//   npm run regtest -- status
//   npm run regtest -- setup        (create merchant/buyer/seller accounts, print env + miner address)
//   npm run regtest -- fund [blocks] (mine to the buyer, shield coinbase, give the merchant a fee float)
//   npm run regtest -- journey      (full purchase + payout through the running API and worker)
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';
import {z} from 'zod';
import {ZalletRpc,RawNumber} from '../src/wallet/zalletRpc.ts';
import {zatToZecString} from '../src/lib/money.ts';

const STATE='.regtest-accounts.json';
const env=process.env;
const zallet=new ZalletRpc({url:env.ZALLET_RPC_URL??'http://127.0.0.1:50232',user:env.ZALLET_RPC_USER??'zebra',password:env.ZALLET_RPC_PASS??'zebra',timeoutMs:120000,maxBytes:8_388_608},
  ['getwalletstatus','z_getnewaccount','z_listaccounts','z_getaddressforaccount','z_listunifiedreceivers','z_shieldcoinbase','z_sendmany','z_getoperationstatus','z_getbalanceforaccount','z_viewtransaction']);
const ZEBRA=env.ZEBRA_RPC_URL??'http://127.0.0.1:29232',ZEBRA_AUTH='Basic '+Buffer.from(`${env.ZEBRA_RPC_USER??'zebra'}:${env.ZEBRA_RPC_PASS??'zebra'}`).toString('base64');
const API=env.ARCANA_API??'http://localhost:8080';
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const step=(m:string)=>console.log(`✓ ${m}`);

async function zebra(method:string,params:unknown[]=[]){
  if(!['127.0.0.1','localhost'].includes(new URL(ZEBRA).hostname))throw new Error('Zebra RPC must be loopback');
  const res=await fetch(ZEBRA,{method:'POST',headers:{'content-type':'application/json',authorization:ZEBRA_AUTH},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(120000)});
  const body=await res.json() as any;if(body.error)throw new Error(`Zebra ${method}: ${body.error.message}`);return body.result;
}
async function call(method:string,params:unknown[]=[]){
  try{return await zallet.call(method,params) as any;}
  catch(e){throw new Error(`Zallet ${method} failed (${(e as Error).message}). Check ZALLET_RPC_URL/USER/PASS in .env.worker.`);}
}
async function op(opid:string){
  for(let i=0;i<240;i++){
    const [s]=await call('z_getoperationstatus',[[opid]]);
    if(s?.status==='success')return s.result as {txids:string[];broadcast:boolean};
    if(s&&['failed','cancelled'].includes(s.status))throw new Error(`Operation ${s.status}: ${s.error?.message??''}`);
    await sleep(1000);
  }
  throw new Error('Operation timed out');
}
async function synced(){
  for(let i=0;i<120;i++){
    const s=await call('getwalletstatus');
    if(!s.sync_work_remaining&&s.wallet_tip?.height===s.node_tip.height&&s.fully_synced_height===s.node_tip.height)return s;
    await sleep(1000);
  }
  throw new Error('Wallet did not catch up with Zebra');
}
async function mine(n:number){await zebra('generate',[n]);return synced();}
// Shielded Action balance: NU6.3 builds of Zallet report Orchard-receiver funds under 'ironwood'.
const orchardBalance=async(uuid:string,minconf=1)=>{const p=(await call('z_getbalanceforaccount',[uuid,minconf])).pools??{};return BigInt(p.orchard?.valueZat??0)+BigInt(p.ironwood?.valueZat??0);};

type Accounts={merchant:{uuid:string;ua:string};buyer:{uuid:string;ua:string;taddr:string};seller:{uuid:string;ua:string}};
const load=():Accounts=>{if(!existsSync(STATE))throw new Error('Run `npm run regtest -- setup` first');return JSON.parse(readFileSync(STATE,'utf8'));};

async function setup(){
  if(existsSync(STATE)){console.log(`Accounts already provisioned in ${STATE}:`);}
  else{
    const account=async(name:string)=>{const r=await call('z_getnewaccount',[name]);const uuid=typeof r==='string'?r:r.account_uuid;if(!z.string().uuid().safeParse(uuid).success)throw new Error('Unexpected z_getnewaccount result');return uuid as string;};
    const orchardUa=async(uuid:string)=>(await call('z_getaddressforaccount',[uuid,['orchard']])).address as string;
    const merchant=await account('gallery-merchant'),buyer=await account('regtest-buyer'),seller=await account('regtest-seller');
    const buyerFull=(await call('z_getaddressforaccount',[buyer,['p2pkh','orchard']])).address as string;
    const receivers=await call('z_listunifiedreceivers',[buyerFull]);
    const state:Accounts={merchant:{uuid:merchant,ua:await orchardUa(merchant)},buyer:{uuid:buyer,ua:await orchardUa(buyer),taddr:receivers.p2pkh},seller:{uuid:seller,ua:await orchardUa(seller)}};
    writeFileSync(STATE,JSON.stringify(state,null,2),{mode:0o600});step(`created accounts, saved to ${STATE}`);
  }
  const a=load();
  console.log(`\n1) Add to .env.worker (alongside ZALLET_RPC_URL/USER/PASS):\nZALLET_ACCOUNT_ID=${a.merchant.uuid}\nZALLET_RECEIVE_ADDRESS=${a.merchant.ua}`);
  console.log(`\n2) Add to .env:\nWALLET_DRIVER=zallet\nZALLET_TESTNET_ACK=testnet-in-progress\nZCASH_NETWORK=regtest\nPRICE_SOURCE=fixed\nMIN_CONFIRMATIONS=2`);
  console.log(`\n3) Point Zebra's regtest miner at the buyer's transparent address, then restart Zebra:\n   miner address: ${a.buyer.taddr}\n   grep -rn miner_address ~/z3/config/regtest/   # edit that line, then:\n   cd ~/z3 && docker compose --env-file .env.regtest restart zebra`);
  console.log(`\n4) npm run regtest -- fund`);
}

async function fund(blocks:number){
  const a=load();
  await synced();
  console.log(`Mining ${blocks} blocks so coinbase matures…`);await mine(blocks);step(`mined ${blocks} blocks`);
  const shield=await call('z_shieldcoinbase',[a.buyer.uuid,a.buyer.ua,null,50,null,'AllowRevealedSenders']);
  const shielded=await op(shield.opid??shield);step(`shielded coinbase → buyer (${shielded.txids.join(',')})`);
  await mine(3);
  const float=await call('z_sendmany',[a.buyer.ua,[{address:a.merchant.ua,amount:new RawNumber('1')}],1,null,'FullPrivacy']);
  await op(float);await mine(3);step('sent a 1 ZEC payout-fee float to the merchant account');
  console.log(`Balances (orchard, zat): buyer ${await orchardBalance(a.buyer.uuid)}, merchant ${await orchardBalance(a.merchant.uuid)}`);
}

async function journey(){
  const a=load();
  const health=await (await fetch(`${API}/api/health`)).json() as any;
  if(health.mode!=='zallet'||health.network!=='regtest')throw new Error(`API must run with WALLET_DRIVER=zallet and ZCASH_NETWORK=regtest (got ${health.mode}/${health.network})`);
  const jar:Record<string,string>={};
  const req=async(who:string,method:string,path:string,body?:unknown,raw?:Buffer)=>{
    const res=await fetch(API+path,{method,redirect:'error',headers:{'x-arcana-action':'1',origin:health.origin,...(jar[who]?{cookie:jar[who]}:{}),...(raw?{'content-type':'application/octet-stream'}:body?{'content-type':'application/json'}:{})},body:raw?new Uint8Array(raw):(body?JSON.stringify(body):undefined)});
    const cookie=res.headers.get('set-cookie');if(cookie)jar[who]=cookie.split(';')[0]!;
    if(!res.ok)throw new Error(`${method} ${path} → ${res.status} ${await res.text()}`);return res;
  };
  const signup=(who:string)=>req(who,'POST','/api/signup',{alias:`rt${who}${randomBytes(3).toString('hex')}`,passphrase:randomBytes(24).toString('base64url')});
  await signup('seller');await signup('buyer');
  await req('seller','PUT','/api/me/payout',{address:a.seller.ua});
  const file=Buffer.from(`regtest acquisition ${new Date().toISOString()}`),digest=createHash('sha256').update(file).digest('hex');
  const key=(await (await req('seller','POST','/api/assets/private',undefined,file)).json() as any).key;
  const listingId=(await (await req('seller','POST','/api/listings',{title:'Regtest acquisition',fileKey:key,priceUsdCents:500})).json() as any).listingId;
  const order=await (await req('buyer','POST',`/api/listings/${listingId}/checkout`,{})).json() as any;
  step(`checkout: ${order.payment.amountZec} ZEC to ${order.payment.address.slice(0,24)}… memo ${order.payment.memo}`);
  const memoHex=Buffer.from(order.payment.memo,'utf8').toString('hex');
  const payment=await op(await call('z_sendmany',[a.buyer.ua,[{address:order.payment.address,amount:new RawNumber(zatToZecString(BigInt(order.payment.amountZat))),memo:memoHex}],1,null,'FullPrivacy']));
  step(`buyer paid from Zallet: ${payment.txids.join(',')} (broadcast ${payment.broadcast})`);
  const waitFor=async(label:string,check:()=>Promise<boolean>,mineEach=true)=>{for(let i=0;i<60;i++){if(await check())return;if(mineEach)await mine(1);await sleep(3000);}throw new Error(`Timed out waiting for ${label}`);};
  await waitFor('funding',async()=>(await (await req('buyer','GET',`/api/orders/${order.orderId}`)).json() as any).status==='funded');
  step('worker observed the shielded payment and the order is funded');
  const got=Buffer.from(await (await req('buyer','POST',`/api/files/${listingId}`,{receiptCode:order.receiptCode})).arrayBuffer());
  if(createHash('sha256').update(got).digest('hex')!==digest)throw new Error('Delivered file digest mismatch');
  await req('buyer','POST',`/api/orders/${order.orderId}/confirm-delivery`,{receiptCode:order.receiptCode,assetSha256:digest});step('buyer verified the file and approved release');
  const before=await orchardBalance(a.seller.uuid,0);
  await waitFor('seller payout',async()=>(await orchardBalance(a.seller.uuid,0))>before);
  await mine(2);
  // Evidence is read back from the database the worker wrote, not from what this script sent.
  const {pool}=await import('../src/db.ts');
  try{
    // The worker marks a payout sent only once its transaction is mined and verified.
    await waitFor('payout recorded as sent',async()=>!!(await pool.query("SELECT 1 FROM payouts WHERE ref_id=$1 AND kind='seller_sale' AND status='sent' AND txid IS NOT NULL",[order.orderId])).rowCount);
    const db=(await pool.query(`SELECT o.id,o.status,o.funded_at,o.paid_at,o.release_after,o.proof->'claim'->>'outcome' AS outcome,
      p.address,p.memo_code,p.expected_zat::text,p.received_zat::text,p.status AS payment_status
      FROM orders o JOIN payments p ON p.id=o.payment_id WHERE o.id=$1`,[order.orderId])).rows[0];
    const notes=(await pool.query('SELECT txid,zat::text,confirmations,canonical FROM payment_notes WHERE payment_id=(SELECT payment_id FROM orders WHERE id=$1)',[order.orderId])).rows;
    const payouts=(await pool.query('SELECT kind,zat::text,status,txid FROM payouts WHERE ref_id=$1',[order.orderId])).rows;
    const chain=await zebra('getblockchaininfo');
    const evidence={
      settlementMode:'local-regtest',
      notPublicTestnet:true,valueBearing:false,
      note:'Real Zebra and Zallet binaries on a private regtest chain. Not public testnet, not mainnet. Regtest coins have no value.',
      recordedAt:new Date().toISOString(),
      chain:{chain:chain.chain,tipHeight:chain.blocks,zalletTip:(await call('getwalletstatus')).wallet_tip?.height??null},
      invoice:{orderId:db.id,address:db.address,memo:db.memo_code,expectedZat:db.expected_zat,receivedZat:db.received_zat,paymentStatus:db.payment_status},
      buyerPayment:{txids:payment.txids,observedNotes:notes},
      delivery:{fileSha256:digest,downloadedSha256Matched:true},
      escrow:{fundedAt:db.funded_at,releaseAfter:db.release_after,paidAt:db.paid_at,orderStatus:db.status,proofOutcome:db.outcome},
      sellerPayout:{payouts,sellerOrchardBalanceIncreaseZat:(await orchardBalance(a.seller.uuid,0)-before).toString()},
    };
    const ok=db.status==='paid'&&notes.some(n=>payment.txids.includes(n.txid))&&payouts.some(x=>x.kind==='seller_sale'&&x.status==='sent'&&x.txid);
    mkdirSync('docs/evidence',{recursive:true});
    const file=`docs/evidence/settlement-regtest-${evidence.recordedAt.replace(/[:.]/g,'-')}.json`;
    writeFileSync(file,JSON.stringify({...evidence,verified:ok},null,2)+'\n');
    step(`evidence written to ${file} (verified: ${ok})`);
    if(!ok)process.exitCode=1;
  }finally{await pool.end();}
}

const [cmd,arg]=process.argv.slice(2);
try{
  if(cmd==='status'){console.log({zebra:(await zebra('getblockchaininfo')).blocks,zallet:await call('getwalletstatus')});}
  else if(cmd==='setup')await setup();
  else if(cmd==='fund')await fund(Number(arg??110));
  else if(cmd==='journey')await journey();
  else{console.error('Usage: npm run regtest -- status | setup | fund [blocks] | journey');process.exitCode=1;}
}catch(e){console.error(`✗ ${(e as Error).message}`);process.exitCode=1;}
