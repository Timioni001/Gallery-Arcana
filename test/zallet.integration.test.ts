import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {pool} from '../src/db.ts';
import {buildServer} from '../src/http/server.ts';
import {scanOnce,topUpAddressPool} from '../src/jobs/watcher.ts';
import {runPayouts} from '../src/jobs/payouts.ts';
import {ZalletRpc} from '../src/wallet/zalletRpc.ts';
import {ZalletWallet,ZALLET_METHODS} from '../src/wallet/zalletWallet.ts';
import {parseConfig} from '../src/config.ts';
const enabled=process.env.RUN_DB_TESTS==='1'&&process.env.ARCANA_ISOLATED_TEST_DB==='1';
const hex32=()=>randomBytes(32).toString('hex');
const memoHex=(text:string)=>Buffer.concat([Buffer.from(text,'utf8'),Buffer.alloc(512-Buffer.byteLength(text))]).toString('hex');

/** In-process stand-in for the pinned Zallet JSON-RPC contract (shapes from docs/ZALLET_GAP.md sources). */
function fakeZallet(accountId:string){
  const s={height:1000,hash:hex32(),locked:false,synced:true,txs:new Map<string,any>(),order:[] as string[],addresses:0,ops:new Map<string,any>(),
    calls:[] as string[],onList:null as null|(()=>void),send:'ok' as 'ok'|'drop'|'reject'|'unbroadcast'|'pending',sendTo:new Map<string,bigint>()};
  const view=(txid:string)=>{const t=s.txs.get(txid);return {...t,confirmations:t.minedAt===null?0:s.height-t.minedAt+1,status:t.minedAt===null?'waiting':'mined',blockhash:t.minedAt===null?undefined:t.blockhash};};
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const {id,method,params}=JSON.parse(body);s.calls.push(method);
    const ok=(result:unknown)=>res.end(JSON.stringify({jsonrpc:'2.0',id,result}));
    const err=(code:number)=>res.end(JSON.stringify({jsonrpc:'2.0',id,error:{code,message:'rejected'}}));
    const tip={height:s.height,blockhash:s.hash};
    switch(method){
      case 'getwalletstatus':return ok({node_tip:tip,wallet_tip:s.synced?tip:{height:s.height-5,blockhash:hex32()},fully_synced_height:s.synced?s.height:s.height-5,locked:s.locked});
      case 'z_getaddressforaccount':s.addresses++;return ok({account_uuid:accountId,diversifier_index:Date.now()*1000+s.addresses,receiver_types:['orchard'],address:`utest1fake${String(s.addresses).padStart(40,'0')}`});
      case 'z_listtransactions':{const [,, ,offset,limit]=params;const page=s.order.slice(offset,offset+limit).map(txid=>({account_uuid:accountId,txid,mined_height:s.txs.get(txid).minedAt,expired_unmined:false}));s.onList?.();return ok(page);}
      case 'z_viewtransaction':return s.txs.has(params[0])?ok(view(params[0])):err(-5);
      case 'z_sendmany':{
        if(s.send==='drop'){req.socket.destroy();return;}
        if(s.send==='reject')return err(-6);
        const [,[{address,amount}]]=params,opid=`opid-${randomUUID()}`,txid=hex32();
        assert.match(body,/"amount":\d+(\.\d{1,8})?[,}]/,'amount must be a raw JSON number');
        const zat=BigInt(Math.round(Number(amount)*1e8));s.sendTo.set(txid,zat);
        s.txs.set(txid,{txid,minedAt:null,blockhash:hex32(),spends:[{pool:'orchard'}],outputs:[{pool:'orchard',action:0,address,outgoing:true,walletInternal:false,valueZat:Number(zat)}]});
        s.ops.set(opid,{id:opid,status:s.send==='pending'?'executing':'success',...(s.send==='pending'?{}:{result:{txid,txids:[txid],broadcast:s.send!=='unbroadcast'}})});
        return ok(opid);
      }
      case 'z_getoperationstatus':return ok(params[0].map((o:string)=>s.ops.get(o)).filter(Boolean));
      case 'z_getbalanceforaccount':return ok({pools:{orchard:{valueZat:123}},minimum_confirmations:params[1]});
      default:return err(-32601);
    }
  });
  const pay=(address:string,zat:bigint,memo:string|null,opts:{pool?:string;spendPool?:string;memoRaw?:string}={})=>{
    const txid=hex32();s.txs.set(txid,{txid,minedAt:null,blockhash:hex32(),spends:[{pool:opts.spendPool??'orchard'}],
      outputs:[{pool:opts.pool??'orchard',action:0,account_uuid:accountId,address,outgoing:false,walletInternal:false,valueZat:Number(zat),...(opts.memoRaw?{memo:opts.memoRaw}:memo===null?{}:{memo:memoHex(memo)})}]});
    s.order.push(txid);return txid;
  };
  const mine=(txid:string)=>{s.txs.get(txid).minedAt=s.height;};
  const advance=(n=1)=>{s.height+=n;s.hash=hex32();};
  return {s,server,pay,mine,advance};
}

test('Zallet testnet adapter: snapshot scanning, attribution, reorgs and non-resubmitting payouts',{skip:!enabled},async t=>{
  assert.throws(()=>parseConfig({...process.env,WALLET_DRIVER:'zallet',ZALLET_TESTNET_ACK:''}),/ZALLET_TESTNET_ACK/);
  assert.equal(parseConfig({...process.env,WALLET_DRIVER:'zallet',ZALLET_TESTNET_ACK:'testnet-in-progress',PRICE_SOURCE:'market'}).walletDriver,'zallet');
  const accountId=randomUUID(),fake=fakeZallet(accountId);
  await new Promise<void>(r=>fake.server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${(fake.server.address() as {port:number}).port}`;
  const app=buildServer();await app.ready();
  t.after(async()=>{await app.close();fake.server.closeAllConnections();fake.server.close();await pool.end();});
  const wallet=new ZalletWallet(new ZalletRpc({url,timeoutMs:2000},ZALLET_METHODS),{accountId,fundingAddress:`utest1funding${'0'.repeat(30)}`,minConfirmations:2,reorgDepth:10,pageSize:2,sendTimeoutMs:1500});
  let ip=60;
  const call=(method:any,url:string,body?:any,c?:{cookie:string;ip:string},extra:Record<string,string>={})=>app.inject({method,url,payload:body,remoteAddress:c?.ip??'127.0.0.1',headers:{'x-arcana-action':'1',...(c?{cookie:c.cookie}:{}),...extra}});
  const signup=async()=>{const address=`127.0.0.${ip++}`;const r=await app.inject({method:'POST',url:'/api/signup',remoteAddress:address,headers:{'x-arcana-action':'1'},payload:{alias:'z'+randomBytes(4).toString('hex'),passphrase:'zallet-adapter-passphrase'}});return {cookie:String(r.headers['set-cookie']).split(';')[0]!,ip:address};};
  const seller=await signup();assert.equal((await call('PUT','/api/me/payout',{address:'utest1mockpayout1234567890'},seller)).statusCode,200);
  const content=Buffer.from('zallet adapter acceptance file'),digest=createHash('sha256').update(content).digest('hex');

  await topUpAddressPool(wallet);
  assert.ok((await pool.query("SELECT count(*)::int AS n FROM address_pool WHERE address LIKE 'utest1fake%'")).rows[0].n>=20,'invoice addresses come from z_getaddressforaccount');
  const makeOrder=async()=>{
    const key=(await call('POST','/api/assets/private',content,seller,{'content-type':'application/octet-stream'})).json().key;
    const listingId=(await call('POST','/api/listings',{title:'Zallet adapter '+randomBytes(3).toString('hex'),fileKey:key,priceUsdCents:500},seller)).json().listingId;
    const buyer=await signup();const r=await call('POST',`/api/listings/${listingId}/checkout`,{},buyer);assert.equal(r.statusCode,200,r.body);
    assert.match(r.json().payment.address,/^utest1fake/);return {...r.json(),listingId,buyer};
  };
  const status=async(o:any)=>(await call('GET',`/api/orders/${o.orderId}`,undefined,o.buyer)).json().status;

  let paid:any;
  await t.test('funds only at the confirmation threshold, across paginated history',async()=>{
    const o=await makeOrder();
    for(let i=0;i<3;i++)fake.mine(fake.pay(`utest1other${i}${'0'.repeat(30)}`,1000n,null));
    const txid=fake.pay(o.payment.address,BigInt(o.payment.amountZat),o.payment.memo);fake.mine(txid);
    await scanOnce(wallet);assert.equal(await status(o),'awaiting_payment','one confirmation is not enough');
    fake.advance();await scanOnce(wallet);assert.equal(await status(o),'funded');
    paid=o;
  });

  await t.test('a scan is discarded when the tip moves mid-scan',async()=>{
    const before=(await pool.query('SELECT tip_height FROM zallet_scan_state')).rows[0].tip_height;
    fake.advance();fake.s.onList=()=>{fake.advance();fake.s.onList=null;};
    assert.equal((await wallet.syncStatus()).ready,false);
    assert.equal((await pool.query('SELECT tip_height FROM zallet_scan_state')).rows[0].tip_height,before);
    assert.equal((await wallet.syncStatus()).ready,true);
  });

  await t.test('an unsynchronized wallet is never ready',async()=>{
    fake.s.synced=false;assert.equal((await wallet.syncStatus()).ready,false);fake.s.synced=true;
  });

  await t.test('a confirmed payment that disappears in a reorg goes to review',async()=>{
    const o=await makeOrder();const txid=fake.pay(o.payment.address,BigInt(o.payment.amountZat),o.payment.memo);fake.mine(txid);fake.advance(2);
    await scanOnce(wallet);assert.equal(await status(o),'funded');
    fake.s.order=fake.s.order.filter(x=>x!==txid);fake.s.txs.delete(txid);fake.advance();
    await scanOnce(wallet);assert.equal(await status(o),'payment_review');
    assert.equal((await pool.query('SELECT present FROM zallet_transactions WHERE txid=$1',[txid])).rows[0].present,false);
  });

  await t.test('non-shielded or unattributable funds at an invoice address go to review; hostile memos cannot halt scanning',async()=>{
    fake.mine(fake.pay(`utest1junk${'0'.repeat(30)}`,5n,null,{memoRaw:'ff'.repeat(512)}));
    const mixed=await makeOrder();fake.mine(fake.pay(mixed.payment.address,BigInt(mixed.payment.amountZat),mixed.payment.memo,{spendPool:'sapling'}));
    const memoless=await makeOrder();fake.mine(fake.pay(memoless.payment.address,BigInt(memoless.payment.amountZat),null));
    fake.advance(2);await scanOnce(wallet);
    assert.equal((await pool.query("SELECT status FROM payments WHERE address=$1",[mixed.payment.address])).rows[0].status,'review');
    assert.equal((await pool.query("SELECT status FROM payments WHERE address=$1",[memoless.payment.address])).rows[0].status,'review');
  });

  const queue=async()=>{
    assert.equal((await call('POST',`/api/files/${paid.listingId}`,{receiptCode:paid.receiptCode},paid.buyer)).statusCode,200);
    const r=await call('POST',`/api/orders/${paid.orderId}/confirm-delivery`,{receiptCode:paid.receiptCode,assetSha256:digest},paid.buyer);assert.equal(r.statusCode,200,r.body);
    return (await pool.query("SELECT * FROM payouts WHERE ref_id=$1",[paid.orderId])).rows[0];
  };
  const payout=async(id:string)=>(await pool.query('SELECT * FROM payouts WHERE id=$1',[id])).rows[0];
  const sends=()=>fake.s.calls.filter(c=>c==='z_sendmany').length;

  await t.test('locked wallet and RPC rejection requeue without uncertainty',async()=>{
    const p=await queue();assert.equal(p.status,'queued');
    fake.s.locked=true;await runPayouts(wallet);assert.equal((await payout(p.id)).status,'queued');assert.equal((await payout(p.id)).failure_code,'WALLET_LOCKED');assert.equal(sends(),0);
    fake.s.locked=false;fake.s.send='reject';await runPayouts(wallet);
    assert.equal((await payout(p.id)).status,'queued');assert.equal((await payout(p.id)).failure_code,'REJECTED');assert.equal(sends(),1);
  });

  await t.test('a lost submission response is never resubmitted',async()=>{
    const id=(await pool.query("SELECT id FROM payouts WHERE ref_id=$1",[paid.orderId])).rows[0].id;
    fake.s.send='drop';await runPayouts(wallet);
    assert.equal((await payout(id)).status,'sending');const after=sends();
    fake.s.send='ok';await runPayouts(wallet);await runPayouts(wallet);
    assert.equal(sends(),after,'no second z_sendmany for an ambiguous submission');
    assert.equal((await payout(id)).status,'sending');
    assert.equal((await pool.query('SELECT state,operation_id FROM zallet_submissions WHERE idempotency_key=$1',[id])).rows[0].operation_id,null);
    // Operator verified on-chain that nothing was sent and clears the record (manual procedure).
    await pool.query('DELETE FROM zallet_submissions WHERE idempotency_key=$1',[id]);
    await pool.query("UPDATE payouts SET status='queued' WHERE id=$1",[id]);
  });

  await t.test('success counts only after broadcast and an exact verified output',async()=>{
    const id=(await pool.query("SELECT id FROM payouts WHERE ref_id=$1",[paid.orderId])).rows[0].id;
    fake.s.send='unbroadcast';await runPayouts(wallet);
    assert.equal((await payout(id)).status,'sending');
    assert.equal((await pool.query('SELECT state FROM zallet_submissions WHERE idempotency_key=$1',[id])).rows[0].state,'unbroadcast');
    await pool.query('DELETE FROM zallet_submissions WHERE idempotency_key=$1',[id]);await pool.query("UPDATE payouts SET status='queued' WHERE id=$1",[id]);
    fake.s.send='pending';await runPayouts(wallet);assert.equal((await payout(id)).status,'sending','still executing');
    const op=[...fake.s.ops.values()].at(-1);const txid=[...fake.s.sendTo.keys()].at(-1)!;op.status='success';op.result={txid,txids:[txid],broadcast:true};
    const before=sends();await runPayouts(wallet);
    const done=await payout(id);assert.equal(done.status,'sent');assert.equal(done.txid,txid);assert.equal(sends(),before,'reconciled, not resent');
    assert.equal(fake.s.sendTo.get(txid),BigInt(done.zat));
  });

  await t.test('balance reads the Orchard pool',async()=>{assert.equal(await wallet.balance(),123n);});
});
