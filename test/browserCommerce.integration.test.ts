import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {pool} from '../src/db.ts';
import {buildServer} from '../src/http/server.ts';
import {DatabaseMockWallet} from '../src/wallet/databaseMock.ts';
import {topUpAddressPool} from '../src/jobs/watcher.ts';
import * as sdk from '../packages/client-crypto/src/index.ts';
const enabled=process.env.RUN_DB_TESTS==='1'&&process.env.ARCANA_ISOLATED_TEST_DB==='1';
// Contracts the browser client relies on: identity origin discovery, seller-side
// buyer resolution for capsule key sealing, and participant conversation listing.
test('browser commerce support endpoints',{skip:!enabled},async t=>{
 const app=buildServer();await app.ready();t.after(async()=>{await app.close();await pool.end();});
 const wallet=new DatabaseMockWallet();let ip=40;
 type Client={id:string;alias:string;cookie:string;ip:string;identity:sdk.Identity};
 const call=(method:any,url:string,body?:any,client?:Client,extra:Record<string,string>={})=>app.inject({method,url,payload:body,remoteAddress:client?.ip??'127.0.0.1',headers:{'x-arcana-action':'1',...(client?{cookie:client.cookie}:{}),...extra}});
 const health=(await call('GET','/api/health')).json();assert.equal(health.origin,'http://localhost:8080');
 const signup=async(prefix:string):Promise<Client>=>{
  const address=`127.0.0.${ip++}`,alias=prefix+randomBytes(4).toString('hex');
  const res=await app.inject({method:'POST',url:'/api/signup',remoteAddress:address,headers:{'x-arcana-action':'1'},payload:{alias,passphrase:'browser-commerce-passphrase'}});assert.equal(res.statusCode,200,res.body);
  const client={id:res.json().account.id,alias,cookie:String(res.headers['set-cookie']).split(';')[0]!,ip:address} as Client;
  client.identity=await sdk.generateIdentity(client.id,health.origin);
  const challenge=await call('POST','/api/encryption/challenges',client.identity.public,client);assert.equal(challenge.statusCode,200,challenge.body);
  assert.equal((await call('POST',`/api/encryption/challenges/${challenge.json().challengeId}/complete`,await sdk.answerRegistration(client.identity,challenge.json()),client)).statusCode,200);
  return client;
 };
 const seller=await signup('sel'),buyer=await signup('buy'),outsider=await signup('out');
 assert.equal((await call('PUT','/api/me/payout',{address:'utest1mockpayout1234567890'},seller)).statusCode,200);
 const product=await sdk.encryptCapsule(sdk.encode({secret:'browser capsule'}),{name:'secret.json',mime:'application/json'});
 const upload=await call('POST','/api/capsules',Buffer.from(sdk.encode(product.capsule)),seller,{'content-type':'application/octet-stream'});assert.equal(upload.statusCode,200,upload.body);
 assert.equal(upload.json().sha256,await sdk.digest(sdk.encode(product.capsule)),'browser computes the same ciphertext digest the server stores');
 await topUpAddressPool(wallet);
 const listingId=(await call('POST','/api/listings',{title:'Browser capsule',fileKey:upload.json().key,priceUsdCents:900},seller)).json().listingId as string;

 await t.test('offers give only the seller the buyer id/alias and report capsule readiness',async()=>{
  const offerId=(await call('POST',`/api/listings/${listingId}/offers`,{amountUsdCents:900},buyer)).json().offerId;
  const sellerView=(await call('GET','/api/offers',undefined,seller)).json().find((o:any)=>o.id===offerId);
  assert.equal(sellerView.buyer_id,buyer.id);assert.equal(sellerView.buyer_alias,buyer.alias);assert.equal(sellerView.crypto_mode,'capsule-v1');assert.equal(sellerView.capsule_ready,false);
  const buyerView=(await call('GET','/api/offers',undefined,buyer)).json().find((o:any)=>o.id===offerId);
  assert.equal(buyerView.buyer_id,null);assert.equal(buyerView.buyer_alias,null);
  assert.equal((await call('GET','/api/offers',undefined,outsider)).json().some((o:any)=>o.id===offerId),false);
  // Seal exactly as the browser does: payload bound to capsule id and ciphertext digest.
  const envelope=await sdk.sealEnvelope(seller.identity,buyer.identity.public,buyer.identity.public.fingerprint,{origin:health.origin,purpose:'capsule-key',resourceId:listingId,nonce:crypto.randomUUID(),senderAccountId:seller.id,recipientAccountId:buyer.id,expiresAt:new Date(Date.now()+30*86400000).toISOString()},
   sdk.encode({capsuleId:product.capsule.id,ciphertextSha256:upload.json().sha256,contentKey:sdk.b64(product.contentKey)}));
  assert.equal((await call('POST',`/api/listings/${listingId}/capsule-envelope`,{buyerId:buyer.id,envelope},seller)).statusCode,200);
  assert.equal((await call('GET','/api/offers',undefined,seller)).json().find((o:any)=>o.id===offerId).capsule_ready,true);
  assert.equal((await call('GET','/api/offers',undefined,buyer)).json().find((o:any)=>o.id===offerId).capsule_ready,true);
  // A buyer key reset makes the sealed envelope stale, and readiness must say so.
  const fresh=await sdk.generateIdentity(buyer.id,health.origin);
  await call('POST','/api/encryption/reset',{passphrase:'browser-commerce-passphrase',acknowledgeKeyLoss:true},buyer);
  const ch=await call('POST','/api/encryption/challenges',fresh.public,buyer);await call('POST',`/api/encryption/challenges/${ch.json().challengeId}/complete`,await sdk.answerRegistration(fresh,ch.json()),buyer);
  assert.equal((await call('GET','/api/offers',undefined,seller)).json().find((o:any)=>o.id===offerId).capsule_ready,false);
  buyer.identity=fresh;
 });

 await t.test('conversation listing is participant-only and shows the counterpart by alias',async()=>{
  const conv=(await call('POST','/api/conversations',{listingId},buyer)).json();
  const mine=(await call('GET','/api/conversations',undefined,buyer)).json();
  assert.equal(mine.length,1);assert.equal(mine[0].id,conv.id);assert.equal(mine[0].am_buyer,true);assert.equal(mine[0].counterpart_alias,seller.alias);
  const theirs=(await call('GET','/api/conversations',undefined,seller)).json();
  assert.equal(theirs[0].id,conv.id);assert.equal(theirs[0].am_buyer,false);assert.equal(theirs[0].counterpart_alias,buyer.alias);
  assert.deepEqual((await call('GET','/api/conversations',undefined,outsider)).json(),[]);
  assert.equal((await call('GET','/api/conversations')).statusCode,401);
  assert.equal((await call('DELETE',`/api/conversations/${conv.id}`,undefined,buyer)).statusCode,200);
  assert.deepEqual((await call('GET','/api/conversations',undefined,seller)).json(),[]);
 });
});
