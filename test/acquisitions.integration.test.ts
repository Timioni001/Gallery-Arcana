import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {chmodSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {pool} from '../src/db.ts';
import {config} from '../src/config.ts';
import {buildServer} from '../src/http/server.ts';
import {DatabaseMockWallet} from '../src/wallet/databaseMock.ts';
import {topUpAddressPool,scanOnce} from '../src/jobs/watcher.ts';
import {runPayouts} from '../src/jobs/payouts.ts';
import {scrubOrders} from '../src/jobs/privacy.ts';
import {verifyTransfer} from '../src/lib/acquisition.ts';
import {attestationKeys} from '../src/services/attestationKeys.ts';

const enabled=process.env.RUN_DB_TESTS==='1'&&process.env.ARCANA_ISOLATED_TEST_DB==='1';
test('isolated PostgreSQL private acquisitions, custody holds and signed attestations',{skip:!enabled},async t=>{
  assert.match(new URL(config.databaseUrl).pathname,/^\/arcana_test_[a-f0-9]{16}$/);
  const app=buildServer();await app.ready();t.after(async()=>{await app.close();await pool.end();});
  const wallet=new DatabaseMockWallet(),content=Buffer.from('private acquisition original bytes'),digest=createHash('sha256').update(content).digest('hex');
  type Client={id:string;cookie:string};
  const request=(method:any,url:string,body?:any,client?:Client,headers:Record<string,string>={},ip='127.0.0.1')=>
    app.inject({method,url,payload:body,remoteAddress:ip,headers:{'x-arcana-action':'1',...(client?{cookie:client.cookie}:{}),...headers}});
  const signup=async(prefix:string)=>{
    const response=await request('POST','/api/signup',{alias:prefix+randomBytes(4).toString('hex'),passphrase:'private-acquisition-passphrase'});
    assert.equal(response.statusCode,200,response.body);return {id:response.json().account.id,cookie:String(response.headers['set-cookie']).split(';')[0]!};
  };
  const seller=await signup('seller'),buyer=await signup('buyer'),other=await signup('other');
  assert.equal((await request('PUT','/api/me/payout',{address:'utest1mockpayout1234567890'},seller)).statusCode,200);
  const uploaded=await request('POST','/api/assets/private',content,seller,{'content-type':'application/octet-stream'});
  assert.equal(uploaded.statusCode,200);assert.equal(uploaded.json().sha256,digest);const fileKey=uploaded.json().key;
  const row=async(id:string)=>(await pool.query('SELECT * FROM orders WHERE id=$1',[id])).rows[0];
  const payouts=async(id:string)=>(await pool.query('SELECT * FROM payouts WHERE ref_id=$1 ORDER BY kind',[id])).rows;
  const purchase=async(extra=0n)=>{
    await topUpAddressPool(wallet);
    const listing=await request('POST','/api/listings',{title:'Private acquisition '+randomBytes(3).toString('hex'),fileKey,priceUsdCents:500,visibility:'unlisted'},seller);
    assert.equal(listing.statusCode,200,listing.body);const listingId=listing.json().listingId;
    const response=await request('POST',`/api/listings/${listingId}/checkout`,{},buyer);assert.equal(response.statusCode,200,response.body);
    const order=response.json();const note=await wallet.simulatePayment(order.payment.address,BigInt(order.payment.amountZat)+extra,order.payment.memo,config.minConfirmations);
    await scanOnce(wallet);assert.equal((await row(order.orderId)).status,'funded');return {...order,listingId,note};
  };
  const download=(order:any,client:Client|undefined=buyer)=>request('POST',`/api/files/${order.listingId}`,{receiptCode:order.receiptCode},client);
  const accept=(order:any,client=buyer,sha=digest)=>request('POST',`/api/orders/${order.orderId}/confirm-delivery`,{receiptCode:order.receiptCode,assetSha256:sha},client);
  const dispute=(order:any,client=buyer)=>request('POST',`/api/orders/${order.orderId}/dispute`,{reason:'Private dispute reason: incorrect licensing'},client);
  const resolve=(order:any,decision='release',headers={'x-admin-token':config.adminToken!},ip='127.0.0.1')=>request('POST',`/api/admin/orders/${order.orderId}/resolve`,{decision,...(decision==='refund'?{refundAddress:'utest1mockrefund1234567890'}:{})},undefined,headers,ip);

  await t.test('funding holds all seller funds; buyer inspection, exact fingerprint and explicit acceptance issue one private proof',async()=>{
    const order=await purchase();await runPayouts(wallet);assert.equal((await payouts(order.orderId)).length,0);
    assert.equal((await accept(order)).statusCode,409);assert.equal((await accept(order,other)).statusCode,404);
    assert.equal((await download(order,other)).statusCode,404);
    assert.equal((await request('POST',`/api/files/${order.listingId}`,{receiptCode:order.receiptCode})).statusCode,404);
    const received=await download(order);assert.equal(received.statusCode,200);assert.equal(received.headers['x-arcana-asset-sha256'],digest);assert.deepEqual(received.rawPayload,content);
    assert.equal((await accept(order,buyer,'0'.repeat(64))).statusCode,400);
    const confirmed=await accept(order);assert.equal(confirmed.statusCode,200,confirmed.body);const proof=confirmed.json().proof;
    assert.equal(proof.claim.paymentMode,'mock');assert.equal(proof.claim.assetSha256,digest);
    const key=(await request('GET','/api/proofs/public-key')).json().publicKey;assert.equal(verifyTransfer(proof,key),true);
    assert.equal((await request('POST','/api/proofs/verify',{proof})).json().valid,true);
    assert.equal((await request('POST','/api/proofs/verify',{proof:{...proof,claim:{...proof.claim,legalOwnership:true}}})).json().valid,false);
    const stored=await request('POST',`/api/orders/${order.orderId}/proof`,{receiptCode:order.receiptCode});assert.deepEqual(stored.json(),proof);
    assert.equal((await request('POST',`/api/orders/${order.orderId}/proof`,{receiptCode:'invalid-receipt-code'})).statusCode,404);
    assert.equal((await accept(order)).statusCode,409);assert.equal((await payouts(order.orderId)).length,1);
    const publicListing=(await request('GET',`/api/listings/${order.listingId}`)).json();
    for(const field of ['file_sha256','file_key','buyer_id','proof','dispute_reason'])assert.equal(field in publicListing,false);
  });
  await t.test('concurrent acceptance queues one payout and one event; receipt rotation revokes old download and proof access',async()=>{
    const order=await purchase();await download(order);
    const rotated=await request('POST',`/api/orders/${order.orderId}/receipt`,{},buyer);assert.equal(rotated.statusCode,200);
    assert.equal((await download(order)).statusCode,404);order.receiptCode=rotated.json().receiptCode;
    const results=await Promise.all([accept(order),accept(order)]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
    assert.equal((await payouts(order.orderId)).length,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM acquisition_events WHERE order_id=$1 AND kind='buyer_accepted'",[order.orderId])).rows[0].n,1);
  });
  await t.test('private disputes freeze release; authenticated loopback operator refunds the full amount including excess exactly once',async()=>{
    const order=await purchase(123n);assert.equal((await dispute(order,other)).statusCode,404);assert.equal((await dispute(order)).statusCode,200);
    await runPayouts(wallet);assert.equal((await payouts(order.orderId)).length,0);assert.equal((await accept(order)).statusCode,409);
    assert.equal((await download(order)).statusCode,200);
    assert.equal((await request('GET','/api/admin/disputes')).statusCode,404);
    assert.equal((await resolve(order,'refund',{'x-admin-token':'wrong'})).statusCode,404);
    assert.equal((await resolve(order,'refund',{'x-admin-token':config.adminToken!},'127.0.0.99')).statusCode,404);
    const list=await request('GET','/api/admin/disputes',undefined,undefined,{'x-admin-token':config.adminToken!});assert.equal(list.statusCode,200);
    assert.ok(list.json().some((d:any)=>d.id===order.orderId&&d.dispute_reason.includes('Private dispute')));
    const refunded=await resolve(order,'refund');assert.equal(refunded.statusCode,200,refunded.body);
    const refund=(await payouts(order.orderId))[0];assert.equal(refund.kind,'buyer_refund');assert.equal(refund.zat,(BigInt(order.payment.amountZat)+123n).toString());
    assert.equal((await resolve(order,'release')).statusCode,409);assert.equal((await download(order)).statusCode,404);
    await runPayouts(wallet);assert.equal((await row(order.orderId)).refund_status,'sent');
    assert.equal((await request('POST','/api/refunds/late',{receiptCode:order.receiptCode,address:'utest1mockrefund1234567890'})).statusCode,409);
    await pool.query("UPDATE orders SET resolved_at=now()-interval '31 days' WHERE id=$1",[order.orderId]);await scrubOrders();
    const scrubbed=await row(order.orderId);assert.equal(scrubbed.buyer_id,null);assert.equal(scrubbed.dispute_reason,null);assert.ok(scrubbed.scrubbed_at);
  });
  await t.test('missing signing keys roll back operator release; restored keys sign the snapshot and pay only invoice terms',async()=>{
    const order=await purchase(456n);await dispute(order);
    const previous=process.env.ATTESTATION_SIGNING_KEY_FILE;process.env.ATTESTATION_SIGNING_KEY_FILE='/nonexistent/attestation-fixture';
    try{assert.equal((await resolve(order)).statusCode,500);}finally{process.env.ATTESTATION_SIGNING_KEY_FILE=previous;}
    assert.equal((await row(order.orderId)).status,'disputed');assert.equal((await payouts(order.orderId)).length,0);
    await pool.query('UPDATE listings SET file_sha256=$2 WHERE id=$1',[order.listingId,'a'.repeat(64)]);
    await pool.query("UPDATE settings SET value='10000'::jsonb WHERE key='platform_cut_bps'");
    let released;try{released=await resolve(order);}finally{await pool.query("UPDATE settings SET value='0'::jsonb WHERE key='platform_cut_bps'");}
    assert.equal(released.statusCode,200,released.body);assert.equal(released.json().proof.claim.outcome,'operator_release');assert.equal(released.json().proof.claim.assetSha256,digest);
    const payout=(await payouts(order.orderId))[0];assert.equal(payout.zat,order.payment.amountZat);assert.equal((await row(order.orderId)).refund_zat,'456');
    assert.equal((await request('POST','/api/refunds/late',{receiptCode:order.receiptCode,address:'utest1mockrefund1234567890'})).statusCode,200);
  });
  await t.test('concurrent refund/release and acceptance/dispute cannot create conflicting dispositions',async()=>{
    const order=await purchase();await dispute(order);
    const results=await Promise.all([resolve(order,'release'),resolve(order,'refund')]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);assert.equal((await payouts(order.orderId)).length,1);
    const second=await purchase();await download(second);
    const raced=await Promise.all([accept(second),dispute(second)]);assert.deepEqual(raced.map(r=>r.statusCode).sort(),[200,409]);
    const state=(await row(second.orderId)).status;assert.ok(['paid','disputed'].includes(state));assert.equal((await payouts(second.orderId)).length,state==='paid'?1:0);
  });
  await t.test('reorganizations freeze funded and disputed acquisitions before acceptance or operator action',async()=>{
    for(const disputed of [false,true]){
      const order=await purchase();if(disputed)await dispute(order);
      await pool.query('UPDATE mock_notes SET canonical=false WHERE output_id=$1',[order.note]);await scanOnce(wallet);
      assert.equal((await row(order.orderId)).status,'payment_review');assert.equal((await download(order)).statusCode,404);
      assert.equal((await accept(order)).statusCode,409);assert.equal((await resolve(order)).statusCode,409);assert.equal((await payouts(order.orderId)).length,0);
    }
  });
  await t.test('fingerprint corruption prevents inspection and confirmation; unresolved holds survive retention',async()=>{
    const order=await purchase();await pool.query('UPDATE orders SET file_sha256=$2 WHERE id=$1',[order.orderId,'0'.repeat(64)]);
    assert.equal((await download(order)).statusCode,409);assert.equal((await row(order.orderId)).file_first_accessed_at,null);assert.equal((await accept(order)).statusCode,409);
    await assert.rejects(pool.query('UPDATE orders SET file_sha256=NULL WHERE id=$1',[order.orderId]),{code:'23514'});
    await pool.query("UPDATE orders SET funded_at=now()-interval '100 days' WHERE id=$1",[order.orderId]);await scrubOrders();assert.equal((await row(order.orderId)).buyer_id,buyer.id);
  });
  await t.test('pre-upgrade orders keep legacy settlement and bearer delivery without fabricated attestations',async()=>{
    await topUpAddressPool(wallet);
    const listed=await request('POST','/api/listings',{title:'Legacy order fixture',fileKey,priceUsdCents:500},seller),listingId=listed.json().listingId;
    const response=await request('POST',`/api/listings/${listingId}/checkout`,{},buyer),order=response.json();
    await pool.query('UPDATE orders SET acquisition_version=0,file_sha256=NULL WHERE id=$1',[order.orderId]);
    await wallet.simulatePayment(order.payment.address,BigInt(order.payment.amountZat),order.payment.memo,config.minConfirmations);await scanOnce(wallet);
    assert.equal((await row(order.orderId)).status,'paid');assert.equal((await row(order.orderId)).proof,null);
    assert.equal((await request('POST',`/api/files/${listingId}`,{receiptCode:order.receiptCode})).statusCode,200);assert.equal((await payouts(order.orderId)).length,1);
  });
  await t.test('signing key permissions and mismatched key pairs fail closed',()=>{
    const path=process.env.ATTESTATION_SIGNING_KEY_FILE!,publicPath=process.env.ATTESTATION_VERIFY_KEY_FILE!;
    assert.ok(readFileSync(publicPath,'utf8').includes('PUBLIC KEY'));chmodSync(path,0o644);
    try{assert.throws(()=>attestationKeys(),/Unsafe/);}finally{chmodSync(path,0o600);}
    process.env.ATTESTATION_VERIFY_KEY_FILE=path;try{assert.throws(()=>attestationKeys());}finally{process.env.ATTESTATION_VERIFY_KEY_FILE=publicPath;}
    assert.ok(attestationKeys().publicPem);
  });
  await t.test('legacy originals require safe fingerprint backfill; repeated backfill is idempotent',async()=>{
    const upload=await request('POST','/api/assets/private',Buffer.from('legacy private original'),seller,{'content-type':'application/octet-stream'});
    assert.equal(upload.statusCode,200);const key=upload.json().key;
    const listing=await request('POST','/api/listings',{title:'Legacy hash backfill fixture',fileKey:key,priceUsdCents:500},seller);assert.equal(listing.statusCode,200);
    const id=listing.json().listingId;await pool.query('UPDATE uploaded_assets SET file_sha256=NULL WHERE key=$1',[key]);await pool.query('UPDATE listings SET file_sha256=NULL WHERE id=$1',[id]);
    assert.equal((await request('POST',`/api/listings/${id}/checkout`,{},buyer)).statusCode,409);
    for(const expected of [1,0]){
      const result=spawnSync(process.execPath,['--import','tsx','scripts/backfill-asset-digests.ts'],{env:process.env,encoding:'utf8'});
      assert.equal(result.status,0,result.stdout+result.stderr);assert.equal(JSON.parse(result.stdout).updated,expected);
    }
    assert.equal((await pool.query('SELECT file_sha256 FROM listings WHERE id=$1',[id])).rows[0].file_sha256,upload.json().sha256);
    assert.equal((await request('POST',`/api/listings/${id}/checkout`,{},buyer)).statusCode,200);
  });
});
