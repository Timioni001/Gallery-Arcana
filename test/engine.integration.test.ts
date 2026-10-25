import {test} from 'node:test';
import pg from 'pg';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,symlinkSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import type {InjectOptions} from 'light-my-request';
import {pool,tx} from '../src/db.ts';
import {config} from '../src/config.ts';
import {buildServer} from '../src/http/server.ts';
import {DatabaseMockWallet} from '../src/wallet/databaseMock.ts';
import {scanOnce,topUpAddressPool} from '../src/jobs/watcher.ts';
import {runPayouts} from '../src/jobs/payouts.ts';
import {releaseExpired} from '../src/services/checkout.ts';
import {setOracle,fixedOracle} from '../src/services/pricing.ts';
import {privateBytes} from '../src/services/storage.ts';
import {scrubOrders} from '../src/jobs/privacy.ts';
import {allow} from '../src/lib/ratelimit.ts';
import {sha256} from '../src/lib/crypto.ts';
import {migrate} from '../src/migrations.ts';
import {rotateSession,revokeSessions,loadSession} from '../src/services/gate.ts';
import {registerWorker,heartbeatWorker} from '../src/jobs/workerHealth.ts';

const enabled=process.env.RUN_DB_TESTS==='1'&&process.env.ARCANA_ISOLATED_TEST_DB==='1';
test('isolated PostgreSQL marketplace and recovery acceptance', {skip:!enabled},async t=>{
  assert.match(new URL(config.databaseUrl).pathname,/^\/arcana_test_[a-f0-9]{16}$/);
  const app=buildServer();await app.ready();
  t.after(async()=>{await app.close();await pool.end();});
  // This file owns its own isolated PostgreSQL database and temporary storage.
  await pool.query('TRUNCATE rate_limits');
  const wallet=new DatabaseMockWallet();await topUpAddressPool(wallet);
  let clientIp=10;
  type Client={cookie:string;id:string;alias:string;ip:string};
  const call=(method:InjectOptions['method'],url:string,payload?:InjectOptions['payload'],client?:Client,headers:Record<string,string>={})=>
    app.inject({method,url,payload,remoteAddress:client?.ip??'127.0.0.9',headers:{'x-arcana-action':'1',...(client?{cookie:client.cookie}:{}),...headers}});
  const signup=async(prefix:string):Promise<Client>=>{
    const alias=`${prefix}${randomBytes(4).toString('hex')}`,ip=`127.0.0.${clientIp++}`;
    const res=await app.inject({method:'POST',url:'/api/signup',remoteAddress:ip,headers:{'x-arcana-action':'1'},payload:{alias,passphrase:'integration-unique-passphrase'}});
    assert.equal(res.statusCode,200,res.body);
    assert.match(String(res.headers['set-cookie']),/HttpOnly/);assert.match(String(res.headers['set-cookie']),/SameSite=Strict/);
    return {cookie:String(res.headers['set-cookie']).split(';')[0]!,id:res.json().account.id,alias,ip};
  };
  const seller=await signup('seller'),buyer=await signup('buyer'),other=await signup('other');
  assert.equal((await call('PUT','/api/me/payout',{address:'utest1mockpayout1234567890'},seller)).statusCode,200);
  const original=Buffer.from('a private purchased digital original');
  const upload=await call('POST','/api/assets/private',original,seller,{'content-type':'application/octet-stream','x-asset-filename':'original.bin'});
  assert.equal(upload.statusCode,200,upload.body);const fileKey=upload.json().key as string;
  const listing=async(extra:Record<string,unknown>={})=>{
    const res=await call('POST','/api/listings',{title:`Asset ${randomBytes(4).toString('hex')}`,fileKey,priceUsdCents:500,...extra},seller);
    assert.equal(res.statusCode,200,res.body);return res.json().listingId as string;
  };
  const checkout=async(id:string,client=buyer,offerId?:string)=>{
    await topUpAddressPool(wallet);
    const res=await call('POST',`/api/listings/${id}/checkout`,offerId?{offerId}:{},client);
    assert.equal(res.statusCode,200,res.body);return res.json();
  };
  const payment=async(purchase:any,amount=BigInt(purchase.payment.amountZat),confirmations=config.minConfirmations)=>
    wallet.simulatePayment(purchase.payment.address,amount,purchase.payment.memo,confirmations);
  const status=async(id:string)=>(await pool.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];
  const expire=async(id:string)=>{await pool.query("UPDATE orders SET expires_at=now()-interval '1 minute' WHERE id=$1",[id]);await pool.query("UPDATE payments SET expires_at=now()-interval '1 minute' WHERE ref_id=$1",[id]);};
  const download=(id:string,code:string,client=buyer)=>call('POST',`/api/files/${id}`,{receiptCode:code},client);
  const confirm=async(id:string,order:any,client=buyer)=>{assert.equal((await download(id,order.receiptCode,client)).statusCode,200);const result=await call('POST',`/api/orders/${order.orderId}/confirm-delivery`,{receiptCode:order.receiptCode,assetSha256:createHash('sha256').update(original).digest('hex')},client);assert.equal(result.statusCode,200,result.body);};
  const paid=async()=>{const id=await listing(),order=await checkout(id);await payment(order);await scanOnce(wallet);assert.equal((await status(order.orderId)).status,'funded');await confirm(id,order);assert.equal((await status(order.orderId)).status,'paid');return {id,order};};

  await t.test('sessions rotate atomically, expire, revoke and reject wrong credentials',async()=>{
    const account=await signup('auth');const old=account.cookie;
    assert.equal((await call('POST','/api/login',{alias:account.alias,passphrase:'wrong-passphrase'})).statusCode,401);
    const rotations=await Promise.all([call('POST','/api/session/rotate',{},account),call('POST','/api/session/rotate',{},account)]);
    assert.deepEqual(rotations.map(r=>r.statusCode).sort(),[200,401]);
    account.cookie=String(rotations.find(r=>r.statusCode===200)!.headers['set-cookie']).split(';')[0]!;
    assert.notEqual(account.cookie,old);assert.equal((await call('GET','/api/me',undefined,{...account,cookie:old})).json().account,null);
    const active=await call('GET','/api/me',undefined,account);assert.equal(active.json().account.id,account.id);assert.ok((await pool.query('SELECT expires_at>now() AS active FROM sessions WHERE account_id=$1',[account.id])).rows[0].active);
    await pool.query("UPDATE sessions SET absolute_expires_at=now()-interval '1 second' WHERE account_id=$1",[account.id]);
    assert.equal((await call('GET','/api/me',undefined,account)).json().account,null);
    await pool.query("UPDATE sessions SET absolute_expires_at=now()+interval '1 day' WHERE account_id=$1",[account.id]);
    await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE account_id=$1",[account.id]);
    assert.equal((await call('GET','/api/me',undefined,account)).json().account,null);
    const login=await call('POST','/api/login',{alias:account.alias,passphrase:'integration-unique-passphrase'});
    account.cookie=String(login.headers['set-cookie']).split(';')[0]!;
    assert.equal((await call('POST','/api/sessions/revoke',{},account)).statusCode,200);
    assert.equal((await call('GET','/api/me',undefined,account)).json().account,null);
  });
  await t.test('CSRF, unauthorized endpoints and default admin access fail closed',async()=>{
    assert.equal((await call('POST','/api/logout',{},buyer,{'x-arcana-action':'0'})).statusCode,403);
    assert.equal((await call('POST','/api/logout',{},buyer,{origin:'https://attacker.example'})).statusCode,403);
    assert.equal((await call('POST','/api/logout',{},buyer,{'sec-fetch-site':'cross-site'})).statusCode,403);
    for(const url of ['/api/orders','/api/sales','/api/offers','/api/listings/mine'])assert.equal((await call('GET',url)).statusCode,401);
    assert.equal((await call('GET','/api/admin/payouts/stuck',undefined,undefined,{'x-admin-token':'replace-with-a-strong-secret'})).statusCode,404);
    assert.equal((await call('POST','/api/assets/private',original,undefined,{'content-type':'application/octet-stream'})).statusCode,401);
    assert.equal((await call('PUT','/api/me/payout',{address:'u1mainnetaddress123456789'},seller)).statusCode,400);
  });
  await t.test('revoke-all includes a successor minted by an already running rotation',async()=>{
    const account=await signup('revokerace'),token=account.cookie.slice(account.cookie.indexOf('=')+1);
    const blocker=await pool.connect();let rotation:Promise<PromiseSettledResult<string>>|undefined,revocation:Promise<PromiseSettledResult<void>>|undefined;
    const settle=<T>(p:Promise<T>)=>p.then(value=>({status:'fulfilled' as const,value}),reason=>({status:'rejected' as const,reason}));
    const waitBlocked=async(blockedBy:number,prefix:string)=>{
      for(let i=0;i<100;i++){
        const result=await pool.query(`SELECT pid FROM pg_stat_activity WHERE datname=current_database()
          AND $1=ANY(pg_blocking_pids(pid)) AND query LIKE $2`,[blockedBy,prefix+'%']);
        if(result.rows[0])return result.rows[0].pid as number;
        await new Promise(r=>setTimeout(r,10));
      }
      throw new Error('Expected concurrent session lock was not observed');
    };
    try{
      await blocker.query('BEGIN');await blocker.query('SELECT token_hash FROM sessions WHERE account_id=$1 FOR UPDATE',[account.id]);
      const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      rotation=settle(rotateSession(token));const rotationPid=await waitBlocked(pid,'DELETE FROM sessions WHERE token_hash=');
      revocation=settle(revokeSessions(account.id));await waitBlocked(rotationPid,'SELECT id FROM accounts WHERE id=');
      await blocker.query('COMMIT');
      const rotated=await rotation;assert.equal(rotated.status,'fulfilled');assert.equal((await revocation).status,'fulfilled');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM sessions WHERE account_id=$1',[account.id])).rows[0].n,0);
      if(rotated.status==='fulfilled')assert.equal(await loadSession(rotated.value),null);
    }finally{await blocker.query('ROLLBACK');blocker.release();await Promise.all([rotation,revocation]);}
  });
  await t.test('a stale worker cannot overwrite replacement readiness or its shutdown state',async()=>{
    const first=randomUUID(),replacement=randomUUID();await registerWorker(pool,first);
    assert.equal(await heartbeatWorker(pool,first,true),true);await registerWorker(pool,replacement);
    assert.equal(await heartbeatWorker(pool,replacement,true),true);
    for(const state of [false,true])assert.equal(await heartbeatWorker(pool,first,state),false);
    assert.deepEqual((await pool.query("SELECT instance_id,ready FROM worker_health WHERE name='payments'")).rows[0],{instance_id:replacement,ready:true});
    assert.equal(await heartbeatWorker(pool,replacement,false),true);
    assert.equal(await heartbeatWorker(pool,first,true),false);
    assert.equal((await pool.query("SELECT ready FROM worker_health WHERE name='payments'")).rows[0].ready,false);
  });
  await t.test('owner listing edits use revisions and invalidate outdated offers',async()=>{
    const id=await listing({description:'Keep this description',visibility:'unlisted'});const made=await call('POST',`/api/listings/${id}/offers`,{amountUsdCents:200},buyer);
    assert.equal(made.statusCode,200);
    assert.equal((await call('PATCH',`/api/listings/${id}`,{title:'Unauthorized edit',expectedRevision:1},buyer)).statusCode,404);
    assert.equal((await call('PATCH',`/api/listings/${id}`,{title:'Updated product',expectedRevision:1},seller)).statusCode,200);
    assert.equal((await call('GET',`/api/listings/${id}`)).json().description,'Keep this description');
    assert.equal((await call('GET',`/api/listings/${id}`)).json().visibility,'unlisted');
    assert.equal((await call('PATCH',`/api/listings/${id}`,{title:'Stale edit',expectedRevision:1},seller)).statusCode,409);
    assert.equal((await pool.query('SELECT status FROM offers WHERE id=$1',[made.json().offerId])).rows[0].status,'declined');
    assert.equal((await call('POST',`/api/offers/${made.json().offerId}/action`,{action:'accept'},seller)).statusCode,409);
    assert.equal((await call('POST','/api/listings',{title:'Stolen product',fileKey,priceUsdCents:500},buyer)).statusCode,403);
  });
  await t.test('public/unlisted, pause, search, category and bounded pagination preserve privacy',async()=>{
    const publicId=await listing({title:'Unique searchable art',category:'collectible'}),hidden=await listing({title:'Unique hidden art',visibility:'unlisted'});
    const publicRows=(await call('GET','/api/listings?q=Unique&limit=1&offset=0')).json();assert.equal(publicRows.length,1);assert.equal(publicRows[0].id,publicId);
    assert.equal((await call('GET','/api/listings?q=Unique&limit=1&offset=1')).json().length,0);
    assert.equal((await call('GET',`/api/listings/${hidden}`)).statusCode,200);
    assert.equal((await call('GET','/api/listings?limit=100000')).statusCode,400);
    assert.equal((await call('GET','/api/listings?q=%27%20OR%201%3D1--')).json().length,0);
    assert.equal((await call('POST',`/api/listings/${publicId}/status`,{status:'paused'},seller)).statusCode,200);
    assert.equal((await call('GET',`/api/listings/${publicId}`)).statusCode,404);
    assert.equal((await call('GET',`/api/listings/${publicId}`,undefined,seller)).statusCode,200);
  });
  await t.test('counteroffers require the viewed revision, support rejection and hide other participants',async()=>{
    const id=await listing();let offer=(await call('POST',`/api/listings/${id}/offers`,{amountUsdCents:300},buyer)).json();
    const counter=await call('POST',`/api/offers/${offer.offerId}/action`,{action:'counter',counterUsdCents:400},seller);assert.equal(counter.statusCode,200);
    assert.equal((await call('POST',`/api/offers/${offer.offerId}/action`,{action:'accept-counter',expectedVersion:1},buyer)).statusCode,409);
    assert.equal((await call('POST',`/api/offers/${offer.offerId}/action`,{action:'accept-counter',expectedVersion:2},other)).statusCode,403);
    assert.equal((await call('POST',`/api/offers/${offer.offerId}/action`,{action:'decline-counter'},buyer)).statusCode,200);
    offer=(await call('POST',`/api/listings/${id}/offers`,{amountUsdCents:300},buyer)).json();
    await call('POST',`/api/offers/${offer.offerId}/action`,{action:'counter',counterUsdCents:450},seller);
    assert.equal((await call('POST',`/api/offers/${offer.offerId}/action`,{action:'accept-counter'},buyer)).statusCode,400);
    assert.equal((await call('POST',`/api/offers/${offer.offerId}/action`,{action:'accept-counter',expectedVersion:2},buyer)).statusCode,200);
    const order=await checkout(id,buyer,offer.offerId);assert.equal(order.payment.usdCents,450);
    assert.equal((await call('POST',`/api/offers/${offer.offerId}/action`,{action:'withdraw'},buyer)).statusCode,409);
    assert.equal((await call('GET','/api/offers',undefined,other)).json().some((o:any)=>o.id===offer.offerId),false);
  });
  await t.test('offer acceptance through verified mock receive, private receipt and file delivery',async()=>{
    const id=await listing(),made=await call('POST',`/api/listings/${id}/offers`,{amountUsdCents:350},buyer),offerId=made.json().offerId;
    assert.equal((await call('POST',`/api/offers/${offerId}/action`,{action:'accept'},seller)).statusCode,200);
    const order=await checkout(id,buyer,offerId);
    assert.equal((await download(id,order.receiptCode)).statusCode,404);
    assert.equal((await call('GET',`/api/orders/${order.orderId}`,undefined,other)).statusCode,404);
    assert.equal((await call('GET',`/api/orders/${order.orderId}/payment`,undefined,seller)).statusCode,404);
    assert.equal((await call('PATCH',`/api/listings/${id}`,{expectedRevision:1,title:'Mutated'},seller)).statusCode,409);
    await wallet.simulatePayment(order.payment.address,BigInt(order.payment.amountZat),'wrong-invoice');await scanOnce(wallet);
    assert.equal((await status(order.orderId)).status,'awaiting_payment');
    const output=await payment(order,BigInt(order.payment.amountZat),0);await scanOnce(wallet);assert.equal((await status(order.orderId)).status,'awaiting_payment');
    await pool.query('UPDATE mock_notes SET confirmations=$2 WHERE output_id=$1',[output,config.minConfirmations]);
    await scanOnce(new DatabaseMockWallet());
    assert.equal((await status(order.orderId)).status,'funded');await confirm(id,order);assert.equal((await download(id,order.receiptCode)).body,original.toString());
    assert.equal(readFileSync(resolve(config.storageDir,'private',fileKey)).includes(original),false);
    const publicData=(await call('GET',`/api/listings/${id}`)).json();
    for(const key of ['buyer_id','offer_id','file_key','payment_id','receipt_hash','memo_code','payout_address'])assert.equal(key in publicData,false);
    const sale=(await call('GET','/api/sales',undefined,seller)).json().find((s:any)=>s.id===order.orderId);assert.ok(sale);assert.equal('buyer_id' in sale,false);
    assert.equal((await call('POST',`/api/orders/${order.orderId}/receipt`,{},other)).statusCode,404);
    const renewed=await call('POST',`/api/orders/${order.orderId}/receipt`,{},buyer);assert.equal(renewed.statusCode,200);
    assert.equal((await download(id,order.receiptCode)).statusCode,404);assert.equal((await download(id,renewed.json().receiptCode)).statusCode,200);
  });
  await t.test('simultaneous buyers reserve only one order and one destination',async()=>{
    const id=await listing();const responses=await Promise.all([call('POST',`/api/listings/${id}/checkout`,{},buyer),call('POST',`/api/listings/${id}/checkout`,{},other)]);
    assert.deepEqual(responses.map(r=>r.statusCode).sort(),[200,409]);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders WHERE listing_id=$1',[id])).rows[0].n,1);
  });
  await t.test('invoice creation failure rolls back listing, order and address claim',async()=>{
    const id=await listing(),before=(await pool.query('SELECT count(*)::int AS n FROM address_pool WHERE NOT claimed')).rows[0].n;
    const logs:string[]=[];const output=console.log;console.log=(line:string)=>{logs.push(line);};
    setOracle({async rateMicroUsd(){throw new Error('SECRET-DO-NOT-LOG');}});
    try{assert.equal((await call('POST',`/api/listings/${id}/checkout`,{},other)).statusCode,500);}finally{setOracle(fixedOracle);console.log=output;}
    assert.equal(logs.join('').includes('SECRET-DO-NOT-LOG'),false);
    assert.equal((await pool.query('SELECT status FROM listings WHERE id=$1',[id])).rows[0].status,'live');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM orders WHERE listing_id=$1',[id])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM address_pool WHERE NOT claimed')).rows[0].n,before);
  });
  await t.test('stale reservations release without a worker; late payment cannot release a new reservation',async()=>{
    const id=await listing(),old=await checkout(id);await expire(old.orderId);
    const fresh=await checkout(id,other);await payment(old);await scanOnce(wallet);
    assert.equal((await status(old.orderId)).status,'refund_due');assert.equal((await pool.query('SELECT status FROM listings WHERE id=$1',[id])).rows[0].status,'reserved');
    assert.equal((await download(id,old.receiptCode)).statusCode,404);
    await payment(fresh);await scanOnce(wallet);assert.equal((await status(fresh.orderId)).status,'funded');
  });
  await t.test('underpaid expired invoices produce refunds and never unlock goods',async()=>{
    const id=await listing(),order=await checkout(id,other);await payment(order,BigInt(order.payment.amountZat)-1n);await scanOnce(wallet);
    assert.equal((await status(order.orderId)).status,'awaiting_payment');await expire(order.orderId);await tx(c=>releaseExpired(c));await scanOnce(wallet);
    assert.equal((await status(order.orderId)).status,'refund_due');assert.equal((await download(id,order.receiptCode)).statusCode,404);
    const claim=await call('POST','/api/refunds/late',{receiptCode:order.receiptCode,address:'utest1mockrefund1234567890'});assert.equal(claim.statusCode,200,claim.body);
    await runPayouts(wallet);assert.equal((await status(order.orderId)).refund_status,'sent');
    await pool.query("UPDATE orders SET resolved_at=now()-interval '31 days' WHERE id=$1",[order.orderId]);await scrubOrders();
    assert.equal((await status(order.orderId)).buyer_id,null);assert.equal((await status(order.orderId)).payment_id,null);
    assert.equal((await call('POST','/api/refunds/late',{receiptCode:order.receiptCode,address:'utest1mockrefund1234567890'})).statusCode,409);
  });
  await t.test('overpayment pays only the agreed amount and refunds the excess',async()=>{
    const id=await listing(),order=await checkout(id);await payment(order,BigInt(order.payment.amountZat)+123n);await scanOnce(wallet);
    assert.equal((await status(order.orderId)).refund_zat,'123');await confirm(id,order);
    const sale=(await pool.query("SELECT zat FROM payouts WHERE kind='seller_sale' AND ref_id=$1",[order.orderId])).rows[0];assert.equal(sale.zat,order.payment.amountZat);
    assert.equal((await call('POST','/api/refunds/late',{receiptCode:order.receiptCode,address:'utest1mockrefund1234567890'})).statusCode,200);
    await runPayouts(wallet);assert.equal((await status(order.orderId)).status,'paid');assert.equal((await status(order.orderId)).refund_status,'sent');
  });
  await t.test('duplicate output observations and repeated/concurrent scans settle once',async()=>{
    const id=await listing(),order=await checkout(id);await payment(order);
    class DuplicateWallet extends DatabaseMockWallet{override async received(address:string){const rows=await super.received(address);return [...rows,...rows];}}
    await Promise.all([scanOnce(new DuplicateWallet()),scanOnce(new DatabaseMockWallet())]);await scanOnce(wallet);
    assert.equal((await pool.query('SELECT received_zat FROM payments WHERE ref_id=$1',[order.orderId])).rows[0].received_zat,order.payment.amountZat);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_notes WHERE payment_id=$1',[order.payment.paymentId])).rows[0].n,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payouts WHERE ref_id=$1 AND kind='seller_sale'",[order.orderId])).rows[0].n,0);await confirm(id,order);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payouts WHERE ref_id=$1 AND kind='seller_sale'",[order.orderId])).rows[0].n,1);
  });
  await t.test('unsynchronized wallets cannot settle and an output cannot be reassigned to another invoice',async()=>{
    const first=await paid(),secondId=await listing(),second=await checkout(secondId,other);
    class Unsynced extends DatabaseMockWallet{override async syncStatus(){return {ready:false};}}
    await payment(second);await scanOnce(new Unsynced());assert.equal((await status(second.orderId)).status,'awaiting_payment');
    const known=(await wallet.received(first.order.payment.address))[0]!;
    class ForgedAttribution extends DatabaseMockWallet{override async received(address:string){return address===second.payment.address?[{...known,address,memo:second.payment.memo}]:super.received(address);}}
    await scanOnce(new ForgedAttribution());
    assert.equal((await pool.query('SELECT status FROM payments WHERE id=$1',[second.payment.paymentId])).rows[0].status,'review');
    assert.equal((await download(secondId,second.receiptCode)).statusCode,404);
  });
  await t.test('concurrent payout claimers send a queued sale exactly once',async()=>{
    await runPayouts(wallet);const {order}=await paid();
    await Promise.all([runPayouts(new DatabaseMockWallet()),runPayouts(new DatabaseMockWallet())]);
    const payout=(await pool.query("SELECT * FROM payouts WHERE kind='seller_sale' AND ref_id=$1",[order.orderId])).rows[0];
    assert.equal(payout.status,'sent');assert.equal(payout.attempts,1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM mock_sends WHERE idempotency_key=$1',[payout.id])).rows[0].n,1);
  });
  await t.test('pre-confirmation reorgs do not deliver; post-confirmation reorgs freeze delivery and queued spending',async()=>{
    const id=await listing(),order=await checkout(id),note=await payment(order,BigInt(order.payment.amountZat),0);
    await scanOnce(wallet);await pool.query('UPDATE mock_notes SET canonical=false WHERE output_id=$1',[note]);await scanOnce(wallet);
    assert.equal((await status(order.orderId)).status,'awaiting_payment');
    await pool.query('UPDATE mock_notes SET canonical=true,confirmations=$2 WHERE output_id=$1',[note,config.minConfirmations]);await scanOnce(wallet);
    assert.equal((await status(order.orderId)).status,'funded');await confirm(id,order);
    await pool.query('UPDATE mock_notes SET canonical=false WHERE output_id=$1',[note]);await scanOnce(wallet);
    assert.equal((await status(order.orderId)).status,'payment_review');assert.equal((await download(id,order.receiptCode)).statusCode,404);
    assert.equal((await pool.query("SELECT status FROM payouts WHERE kind='seller_sale' AND ref_id=$1",[order.orderId])).rows[0].status,'cancelled');
    await pool.query('UPDATE mock_notes SET canonical=true WHERE output_id=$1',[note]);await scanOnce(wallet);
    assert.equal((await status(order.orderId)).status,'payment_review','manual reconciliation is required after a settled reorg');
  });
  await t.test('payout accepted before a lost response is reconciled after restart without a second send',async()=>{
    await runPayouts(wallet);const {order}=await paid();
    class LostResponseWallet extends DatabaseMockWallet{override async send(to:string,zat:bigint,memo?:string,key?:string):Promise<string>{await super.send(to,zat,memo,key);throw new Error('simulated lost response');}}
    await runPayouts(new LostResponseWallet(),1);
    let row=(await pool.query("SELECT * FROM payouts WHERE kind='seller_sale' AND ref_id=$1",[order.orderId])).rows[0];assert.equal(row.status,'sending');
    await runPayouts(new DatabaseMockWallet());row=(await pool.query('SELECT * FROM payouts WHERE id=$1',[row.id])).rows[0];
    assert.equal(row.status,'sent');assert.equal(row.attempts,1);assert.equal((await pool.query('SELECT count(*)::int AS n FROM mock_sends WHERE idempotency_key=$1',[row.id])).rows[0].n,1);
  });
  await t.test('an uncertain submission with no reconciled result is never automatically retried',async()=>{
    await runPayouts(wallet);const {order}=await paid();
    class UncertainWallet extends DatabaseMockWallet{override async send():Promise<string>{throw new Error('uncertain submission');}}
    await runPayouts(new UncertainWallet(),1);await runPayouts(wallet);
    const row=(await pool.query("SELECT * FROM payouts WHERE ref_id=$1 AND kind='seller_sale'",[order.orderId])).rows[0];assert.equal(row.status,'sending');assert.equal(row.attempts,1);
  });
  await t.test('asset traversal, symlinks and malformed preview images cannot expose originals',async()=>{
    assert.throws(()=>privateBytes('../.env'));
    const key=`${randomBytes(16).toString('hex')}.bin`,path=resolve(config.storageDir,'private',key),target=resolve(config.storageDir,'secret-fixture');
    writeFileSync(target,'secret');symlinkSync(target,path);try{assert.throws(()=>privateBytes(key));}finally{unlinkSync(path);unlinkSync(target);}
    const bad=await call('POST','/api/assets/previews',Buffer.from('89504e470d0a1a0a001122','hex'),seller,{'content-type':'application/octet-stream','x-asset-type':'image/png'});assert.equal(bad.statusCode,400);
    const sharp=(await import('sharp')).default;const png=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).withMetadata({exif:{IFD0:{Artist:'Private artist metadata'}}}).png().toBuffer();
    const preview=await call('POST','/api/assets/previews',png,seller,{'content-type':'application/octet-stream','x-asset-type':'image/png'});assert.equal(preview.statusCode,200,preview.body);
    const published=await call('GET',`/previews/${preview.json().key}`);assert.equal(published.statusCode,200);assert.equal((await sharp(published.rawPayload).metadata()).exif,undefined);
    assert.equal((await call('GET',`/previews/${fileKey}`)).statusCode,400);
  });
  await t.test('shared PostgreSQL rate limiting is atomic across callers and retains hashed keys only',async()=>{
    const key='private-ip-or-alias-'+randomBytes(4).toString('hex');
    const results=await Promise.all(Array.from({length:10},()=>allow(key,5,60_000)));assert.equal(results.filter(Boolean).length,5);
    const row=(await pool.query('SELECT key_hash,hits FROM rate_limits WHERE key_hash=$1',[sha256(key)])).rows[0];assert.equal(row.hits,10);assert.equal(row.key_hash.includes(Buffer.from(key)),false);
  });
  await t.test('versioned migrations repeat without changing data and reject altered checksums',async()=>{
    const before=(await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n;await migrate(pool);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n,before);
    const saved=(await pool.query("SELECT checksum FROM schema_migrations WHERE version='002_hardening.sql'")).rows[0].checksum;
    await pool.query("UPDATE schema_migrations SET checksum='tampered' WHERE version='002_hardening.sql'");
    await assert.rejects(migrate(pool),/checksum mismatch/);await pool.query("UPDATE schema_migrations SET checksum=$1 WHERE version='002_hardening.sql'",[saved]);
  });
  await t.test('an intact original unversioned schema upgrades without losing accounts or mock destinations',async()=>{
    await pool.query('CREATE SCHEMA legacy_upgrade');
    const legacy=new pg.Pool({connectionString:config.databaseUrl,options:'-c search_path=legacy_upgrade,public'});
    try{
      await legacy.query(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'));
      await legacy.query("INSERT INTO accounts(alias,pass_hash) VALUES('legacy_alias','preserved-fixture-hash')");
      const address='utest1mock'+randomBytes(12).toString('hex');await legacy.query('INSERT INTO address_pool(address) VALUES($1)',[address]);
      await migrate(legacy);await migrate(legacy);
      assert.equal((await legacy.query("SELECT alias FROM accounts WHERE alias='legacy_alias'")).rows[0].alias,'legacy_alias');
      assert.equal((await legacy.query('SELECT address FROM mock_addresses WHERE address=$1',[address])).rows[0].address,address);
      assert.equal((await legacy.query('SELECT count(*)::int AS n FROM schema_migrations')).rows[0].n,15);
    }finally{await legacy.end();await pool.query('DROP SCHEMA legacy_upgrade CASCADE');}
  });
  await t.test('retention removes settled buyer/payment links and keeps private file redemption working',async()=>{
    const {id,order}=await paid();await runPayouts(wallet);
    const submission=(await pool.query("SELECT id FROM payouts WHERE ref_id=$1 AND kind='seller_sale'",[order.orderId])).rows[0].id;
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM mock_sends WHERE idempotency_key=$1',[submission])).rows[0].n,1);
    await pool.query("UPDATE orders SET paid_at=now()-interval '31 days' WHERE id=$1",[order.orderId]);
    await pool.query("UPDATE listings SET updated_at=now()-interval '31 days' WHERE id=$1",[id]);await scrubOrders();
    const row=await status(order.orderId);assert.equal(row.buyer_id,null);assert.equal(row.payment_id,null);assert.ok(row.scrubbed_at);
    assert.equal((await download(id,order.receiptCode)).body,original.toString());
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM payment_notes WHERE payment_id=$1',[order.payment.paymentId])).rows[0].n,0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM mock_sends WHERE idempotency_key=$1',[submission])).rows[0].n,0);
  });
  await t.test('public API rejects missing encryption keys and inherited spending credentials before listening',async()=>{
    for(const override of [{ASSET_ENCRYPTION_KEY:'invalid'},{ZALLET_RPC_PASS:'NEVER-LOG-THIS-WALLET-SECRET'}]){
      const lines:string[]=[];
      const child=spawn(process.execPath,['--import','tsx','src/main.ts'],{env:{...process.env,...override},stdio:['ignore','pipe','pipe']});
      child.stdout!.on('data',b=>lines.push(b.toString()));child.stderr!.on('data',b=>lines.push(b.toString()));
      const result=await new Promise<number|null>(resolve=>child.once('exit',resolve));
      assert.equal(result,1);assert.equal(lines.join('').includes('NEVER-LOG-THIS-WALLET-SECRET'),false);
    }
  });
  await t.test('HTTP signup-to-delivery journey survives a real worker crash and graceful API/worker shutdown',async()=>{
    const freePort=async()=>{const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));return port;};
    const port=await freePort(),apiPort=await freePort(),base=`http://127.0.0.1:${apiPort}`;
    const simulatorToken=randomBytes(32).toString('hex'),logs:string[]=[];const children:ChildProcess[]=[];
    const start=(kind:'main'|'worker')=>{const child=spawn(process.execPath,['--import','tsx',`src/${kind}.ts`],{env:{...process.env,PORT:String(apiPort),PUBLIC_ORIGIN:base,WORKER_PORT:String(port),WORKER_POLL_MS:'100',MOCK_SIMULATOR_TOKEN:kind==='worker'?simulatorToken:undefined},stdio:['ignore','pipe','pipe']});
      child.stdout!.on('data',b=>logs.push(b.toString()));child.stderr!.on('data',b=>logs.push(b.toString()));children.push(child);return child;};
    const wait=async(predicate:()=>Promise<boolean>)=>{for(let i=0;i<100;i++){if(await predicate().catch(()=>false))return;await new Promise(r=>setTimeout(r,100));}throw new Error('HTTP service readiness timeout');};
    const exited=(child:ChildProcess)=>new Promise<void>(resolve=>{if(child.exitCode!==null||child.signalCode)resolve();else child.once('exit',()=>resolve());});
    const http=async(method:string,path:string,body?:object|Buffer,cookie?:string)=>{
      const response=await fetch(base+path,{method,headers:{'x-arcana-action':'1',...(cookie?{cookie}:{}),...(body?{'content-type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{})},body:body===undefined?undefined:Buffer.isBuffer(body)?body as unknown as BodyInit:JSON.stringify(body)});
      return response;
    };
    try{
      let child=start('worker');const api=start('main');await wait(async()=> (await fetch(base+'/api/ready')).ok);
      const previous=(await pool.query("SELECT instance_id FROM worker_health WHERE name='payments'")).rows[0].instance_id;
      const lock=(await pool.query(`SELECT pid FROM pg_locks WHERE locktype='advisory' AND classid=174428 AND objid=5 AND objsubid=2 AND granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`)).rows;
      assert.equal(lock.length,1);await pool.query('SELECT pg_terminate_backend($1)',[lock[0].pid]);
      await exited(child);assert.equal(child.exitCode,1);assert.equal((await fetch(base+'/api/ready')).status,503);
      child=start('worker');await wait(async()=> (await fetch(base+'/api/ready')).ok);
      assert.notEqual((await pool.query("SELECT instance_id FROM worker_health WHERE name='payments'")).rows[0].instance_id,previous);
      const sellerResponse=await http('POST','/api/signup',{alias:'httpseller'+randomBytes(3).toString('hex'),passphrase:'http-integration-passphrase'});assert.equal(sellerResponse.status,200);
      const sellerCookie=sellerResponse.headers.get('set-cookie')!.split(';')[0]!;
      const buyerResponse=await http('POST','/api/signup',{alias:'httpbuyer'+randomBytes(3).toString('hex'),passphrase:'http-integration-passphrase'});assert.equal(buyerResponse.status,200);
      const buyerCookie=buyerResponse.headers.get('set-cookie')!.split(';')[0]!;
      assert.equal((await http('PUT','/api/me/payout',{address:'utest1mockpayout1234567890'},sellerCookie)).status,200);
      const asset=await http('POST','/api/assets/private',original,sellerCookie);assert.equal(asset.status,200);const key=(await asset.json() as {key:string}).key;
      const created=await http('POST','/api/listings',{title:'HTTP acceptance product',fileKey:key,priceUsdCents:500},sellerCookie);assert.equal(created.status,200);const id=(await created.json() as {listingId:string}).listingId;
      const offered=await http('POST',`/api/listings/${id}/offers`,{amountUsdCents:400},buyerCookie);assert.equal(offered.status,200);const offerId=(await offered.json() as {offerId:string}).offerId;
      assert.equal((await http('POST',`/api/offers/${offerId}/action`,{action:'accept'},sellerCookie)).status,200);
      const reserved=await http('POST',`/api/listings/${id}/checkout`,{offerId},buyerCookie);assert.equal(reserved.status,200);const order=await reserved.json() as any;
      assert.equal((await fetch(`http://127.0.0.1:${port}/dev/pay`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})})).status,401);
      const accepted=await fetch(`http://127.0.0.1:${port}/dev/pay`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${simulatorToken}`},body:JSON.stringify({address:order.payment.address,zat:order.payment.amountZat,memo:order.payment.memo})});assert.equal(accepted.status,200);
      child.kill('SIGKILL');await exited(child);child=start('worker');
      await wait(async()=> (await status(order.orderId)).status==='funded');
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM payouts WHERE ref_id=$1 AND kind='seller_sale'",[order.orderId])).rows[0].n,0);
      const inspected=await http('POST',`/api/files/${id}`,{receiptCode:order.receiptCode},buyerCookie);assert.equal(inspected.status,200);assert.equal(await inspected.text(),original.toString());
      assert.equal((await http('POST',`/api/orders/${order.orderId}/confirm-delivery`,{receiptCode:order.receiptCode,assetSha256:createHash('sha256').update(original).digest('hex')},buyerCookie)).status,200);
      await wait(async()=> (await pool.query("SELECT status FROM payouts WHERE ref_id=$1 AND kind='seller_sale'",[order.orderId])).rows[0]?.status==='sent');
      const receipt=await http('POST',`/api/orders/${order.orderId}/receipt`,{},buyerCookie);assert.equal(receipt.status,200);const issued=await receipt.json() as {receiptCode:string};
      const delivered=await http('POST',`/api/files/${id}`,{receiptCode:issued.receiptCode},buyerCookie);assert.equal(delivered.status,200);assert.equal(await delivered.text(),original.toString());
      assert.equal((await fetch(base+'/api/ready')).status,200);
      const demo=spawn(process.execPath,['--import','tsx','scripts/demo-mock.ts'],{env:{...process.env,PUBLIC_ORIGIN:base,WORKER_PORT:String(port),MOCK_SIMULATOR_TOKEN:simulatorToken},stdio:['ignore','pipe','pipe']});
      const demoOutput:string[]=[];demo.stdout!.on('data',b=>demoOutput.push(b.toString()));demo.stderr!.on('data',b=>demoOutput.push(b.toString()));children.push(demo);
      await exited(demo);assert.equal(demo.exitCode,0,demoOutput.join(''));assert.equal(JSON.parse(demoOutput.join('')).proofVerified,true);
      assert.equal(demoOutput.join('').includes(simulatorToken),false);
      const capsuleJourney=spawn(process.execPath,['--import','tsx','scripts/journey-capsule.ts'],{env:{...process.env,PUBLIC_ORIGIN:base,WORKER_PORT:String(port),MOCK_SIMULATOR_TOKEN:simulatorToken},stdio:['ignore','pipe','pipe']});
      const capsuleOutput:string[]=[];capsuleJourney.stdout!.on('data',b=>capsuleOutput.push(b.toString()));capsuleJourney.stderr!.on('data',b=>capsuleOutput.push(b.toString()));children.push(capsuleJourney);
      await exited(capsuleJourney);assert.equal(capsuleJourney.exitCode,0,capsuleOutput.join(''));assert.equal(JSON.parse(capsuleOutput.join('')).clientDecryption,true);assert.equal(JSON.parse(capsuleOutput.join('')).passportVerified,true);assert.equal(capsuleOutput.join('').includes(simulatorToken),false);
      child.kill('SIGTERM');await exited(child);assert.equal(child.exitCode,0);assert.equal((await fetch(base+'/api/ready')).status,503);
      api.kill('SIGTERM');await exited(api);assert.equal(api.exitCode,0);
      assert.equal(logs.join('').includes(simulatorToken),false);assert.equal(logs.join('').includes(order.payment.memo),false);assert.equal(logs.join('').includes(buyerCookie),false);
    }finally{for(const child of children)if(child.exitCode===null&&!child.signalCode){child.kill('SIGTERM');await exited(child);}}
  });
});
