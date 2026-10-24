import {randomBytes,createHash} from 'node:crypto';
import {config} from '../src/config.ts';
import {verifyTransfer} from '../src/lib/acquisition.ts';

/** Explicit local demo only; never prints account, invoice, receipt or simulator secrets. */
try{
  const base=config.publicOrigin,url=new URL(base),simulator=process.env.MOCK_SIMULATOR_TOKEN;
  if(!['localhost','127.0.0.1'].includes(url.hostname)||!simulator||simulator.length<32)throw new Error('Local simulator configuration required');
  const request=async(method:string,path:string,body?:object|Buffer,cookie?:string)=>{
    const response=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{'x-arcana-action':'1',
      ...(cookie?{cookie}:{}),...(body?{'content-type':Buffer.isBuffer(body)?'application/octet-stream':'application/json'}:{})},
      body:body===undefined?undefined:Buffer.isBuffer(body)?body as unknown as BodyInit:JSON.stringify(body)});
    if(!response.ok)throw new Error('Demo request failed');return response;
  };
  const health=await (await request('GET','/api/health')).json() as any;
  if(health.mode!=='mock'||health.network!=='test')throw new Error('Mock/test services required');
  const signup=async(prefix:string)=>{
    const response=await request('POST','/api/signup',{alias:prefix+randomBytes(5).toString('hex'),passphrase:randomBytes(32).toString('base64url')});
    const cookie=response.headers.get('set-cookie')?.split(';')[0];if(!cookie)throw new Error('Session required');return cookie;
  };
  const seller=await signup('demo_s_'),buyer=await signup('demo_b_');
  await request('PUT','/api/me/payout',{address:'utest1mockdemopayout1234567890'},seller);
  const bytes=Buffer.from('Gallery Arcana private acquisitions — deterministic mock demo original');
  const asset=await (await request('POST','/api/assets/private',bytes,seller)).json() as any;
  const listing=await (await request('POST','/api/listings',{title:'Private acquisition demo',visibility:'unlisted',fileKey:asset.key,priceUsdCents:500},seller)).json() as any;
  const offer=await (await request('POST',`/api/listings/${listing.listingId}/offers`,{amountUsdCents:400},buyer)).json() as any;
  await request('POST',`/api/offers/${offer.offerId}/action`,{action:'accept'},seller);
  const order=await (await request('POST',`/api/listings/${listing.listingId}/checkout`,{offerId:offer.offerId},buyer)).json() as any;
  const simulated=await fetch(`http://127.0.0.1:${config.workerPort}/dev/pay`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'content-type':'application/json',authorization:`Bearer ${simulator}`},body:JSON.stringify({address:order.payment.address,zat:order.payment.amountZat,memo:order.payment.memo})});
  if(!simulated.ok||(await simulated.json() as any).mode!=='mock')throw new Error('Mock simulator failed');
  let funded=false;
  for(let i=0;i<120;i++){
    const state=await (await request('GET',`/api/orders/${order.orderId}`,undefined,buyer)).json() as any;
    if(state.status==='funded'){funded=true;break;}
    if(state.status!=='awaiting_payment')throw new Error('Unexpected acquisition state');
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!funded)throw new Error('Mock funding deadline exceeded');
  const downloaded=await request('POST',`/api/files/${listing.listingId}`,{receiptCode:order.receiptCode},buyer);
  const received=Buffer.from(await downloaded.arrayBuffer()),digest=createHash('sha256').update(received).digest('hex');
  if(!received.equals(bytes)||digest!==asset.sha256||digest!==downloaded.headers.get('x-arcana-asset-sha256'))throw new Error('Asset integrity failed');
  const confirmed=await (await request('POST',`/api/orders/${order.orderId}/confirm-delivery`,{receiptCode:order.receiptCode,assetSha256:digest},buyer)).json() as any;
  const proof=await (await request('POST',`/api/orders/${order.orderId}/proof`,{receiptCode:order.receiptCode},buyer)).json();
  const key=await (await request('GET','/api/proofs/public-key')).json() as any;
  if(confirmed.status!=='paid'||!verifyTransfer(proof,key.publicKey))throw new Error('Attestation verification failed');
  console.log(JSON.stringify({mode:'mock',status:'complete',buyerAccepted:true,assetVerified:true,proofVerified:true,sellerReleaseAuthorized:true}));
}catch{console.log(JSON.stringify({mode:'mock',status:'failed',help:'Check local API/worker readiness and the worker simulator credential; see docs/OPERATIONS.md'}));process.exitCode=1;}
