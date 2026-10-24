import {randomBytes} from 'node:crypto';
import {config} from '../src/config.ts';
import * as sdk from '../packages/client-crypto/src/index.ts';
try{
 const base=config.publicOrigin,token=process.env.MOCK_SIMULATOR_TOKEN;if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)||!token||token.length<32)throw new Error('Local mock simulator required');
 const request=async(method:string,path:string,body?:object|Uint8Array,cookie?:string)=>{
  const response=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{'x-arcana-action':'1',...(cookie?{cookie}:{}),...(body?{'content-type':body instanceof Uint8Array?'application/octet-stream':'application/json'}:{})},body:body===undefined?undefined:body instanceof Uint8Array?Buffer.from(body):JSON.stringify(body)});
  if(!response.ok)throw new Error('Journey request failed');return response;
 };
 const health=await (await request('GET','/api/health')).json() as any;if(health.mode!=='mock'||health.network!=='test')throw new Error('Mock-only verification');
 const signup=async(prefix:string)=>{
  const response=await request('POST','/api/signup',{alias:prefix+randomBytes(4).toString('hex'),passphrase:randomBytes(32).toString('base64url')}),account=await response.json() as any,cookie=response.headers.get('set-cookie')!.split(';')[0]!;
  const identity=await sdk.generateIdentity(account.account.id,base),challenge=await (await request('POST','/api/encryption/challenges',identity.public,cookie)).json() as any;
  await request('POST',`/api/encryption/challenges/${challenge.challengeId}/complete`,await sdk.answerRegistration(identity,challenge),cookie);return {identity,cookie};
 };
 const seller=await signup('caps_s_'),buyer=await signup('caps_b_');await request('PUT','/api/me/payout',{address:'utest1mockcapsulepayout1234567890'},seller.cookie);
 const bytes=sdk.encode({private:'Local encrypted commerce journey original'}),product=await sdk.encryptCapsule(bytes,{name:'private-source.json',mime:'application/json'});
 const asset=await (await request('POST','/api/capsules',sdk.encode(product.capsule),seller.cookie)).json() as any;
 const listing=await (await request('POST','/api/listings',{title:'Encrypted local journey',visibility:'unlisted',fileKey:asset.key,priceUsdCents:500},seller.cookie)).json() as any;
 const conv=await (await request('POST','/api/conversations',{listingId:listing.listingId},buyer.cookie)).json() as any;
 const message=await sdk.encryptConversation(buyer.identity,buyer.identity.public,seller.identity.public,{buyer:buyer.identity.public.fingerprint,seller:seller.identity.public.fingerprint},conv.id,{text:'Selected private product terms'},conv.expires_at);
 await request('POST',`/api/conversations/${conv.id}/messages`,message,buyer.cookie);
 const messages=await (await request('GET',`/api/conversations/${conv.id}/messages`,undefined,seller.cookie)).json() as any;
 if((await sdk.openConversation(seller.identity,buyer.identity.public,buyer.identity.public.fingerprint,conv.id,messages[0].envelope)).text!=='Selected private product terms')throw new Error('Conversation mismatch');
 const offer=await (await request('POST',`/api/listings/${listing.listingId}/offers`,{amountUsdCents:400},buyer.cookie)).json() as any;await request('POST',`/api/offers/${offer.offerId}/action`,{action:'accept'},seller.cookie);
 const envelope=await sdk.capsuleKeyEnvelope(seller.identity,buyer.identity.public,buyer.identity.public.fingerprint,listing.listingId,product.capsule,product.contentKey,new Date(Date.now()+7*86400000).toISOString());
 await request('POST',`/api/listings/${listing.listingId}/capsule-envelope`,{buyerId:buyer.identity.public.accountId,envelope},seller.cookie);
 const order=await (await request('POST',`/api/listings/${listing.listingId}/checkout`,{offerId:offer.offerId},buyer.cookie)).json() as any;
 const simulated=await fetch(`http://127.0.0.1:${config.workerPort}/dev/pay`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({address:order.payment.address,zat:order.payment.amountZat,memo:order.payment.memo})});if(!simulated.ok||(await simulated.json() as any).mode!=='mock')throw new Error('Simulation failed');
 let funded=false;for(let i=0;i<120;i++){const state=await (await request('GET',`/api/orders/${order.orderId}`,undefined,buyer.cookie)).json() as any;if(state.status==='funded'){funded=true;break;}if(state.status!=='awaiting_payment')throw new Error('Funding state mismatch');await new Promise(r=>setTimeout(r,250));}if(!funded)throw new Error('Funding unavailable');
 const keyEnvelope=await (await request('POST',`/api/orders/${order.orderId}/key-envelope`,{receiptCode:order.receiptCode},buyer.cookie)).json() as any;
 const file=await request('POST',`/api/files/${listing.listingId}`,{receiptCode:order.receiptCode},buyer.cookie),encoded=new Uint8Array(await file.arrayBuffer());if(await sdk.digest(encoded)!==asset.sha256)throw new Error('Ciphertext digest mismatch');
 const opened=await sdk.openCapsule(buyer.identity,seller.identity.public,seller.identity.public.fingerprint,listing.listingId,sdk.decode(encoded),keyEnvelope.envelope);if(await sdk.digest(opened.bytes)!==await sdk.digest(bytes))throw new Error('Plaintext mismatch');
 await request('POST',`/api/orders/${order.orderId}/confirm-delivery`,{receiptCode:order.receiptCode,assetSha256:asset.sha256},buyer.cookie);
 const passport=await (await request('POST','/api/passports',{kind:'completed_acquisition',orderId:order.orderId,audience:'local-capsule-journey'},buyer.cookie)).json() as any;
 if(!(await (await request('POST','/api/passports/verify',{proof:passport,audience:'local-capsule-journey'})).json() as any).valid)throw new Error('Trade attestation failed');
 const nonce=sdk.b64(crypto.getRandomValues(new Uint8Array(32))),presentation=await sdk.passportPresentation(buyer.identity,passport,nonce);if(!await sdk.verifyPassportPresentation(passport,nonce,presentation))throw new Error('Holder verification failed');
 console.log(JSON.stringify({mode:'mock',status:'complete',encryptedNegotiation:true,clientDecryption:true,assetVerified:true,buyerAccepted:true,passportVerified:true,holderVerified:true,sellerReleaseAuthorized:true}));
}catch{console.log(JSON.stringify({mode:'mock',status:'failed',help:'Check local API/worker readiness and simulator configuration; see docs/CRYPTO_PROTOCOL.md'}));process.exitCode=1;}
