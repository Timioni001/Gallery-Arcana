import {test,type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type ServerResponse} from 'node:http';
import {ZalletReadOnlyRpc,ZalletProbeError,probeZallet} from '../src/wallet/zalletProbe.ts';

async function endpoint(t:TestContext,reply:(body:any,res:ServerResponse)=>void){
  const requests:any[]=[];
  const server=createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const parsed=JSON.parse(body);requests.push({...parsed,authorization:req.headers.authorization});reply(parsed,res);
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();}));
  return {url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,requests};
}
test('read-only RPC validates identities, authenticates and cannot invoke a spending method',async t=>{
  const service=await endpoint(t,(body,res)=>res.end(JSON.stringify({jsonrpc:'2.0',id:body.id,result:{ok:true}})));
  const rpc=new ZalletReadOnlyRpc({url:service.url,user:'probe',password:'dummy-credential'});
  assert.deepEqual(await rpc.call('getwalletstatus'),{ok:true});
  assert.equal(service.requests[0].authorization,`Basic ${Buffer.from('probe:dummy-credential').toString('base64')}`);
  await assert.rejects(rpc.call('z_sendmany' as never),{code:'CONFIGURATION'});assert.equal(service.requests.length,1);
});
test('RPC errors, malformed envelopes and mismatched request IDs fail without exposing remote content',async t=>{
  for(const response of [
    (id:string)=>({jsonrpc:'2.0',id:'other-request',result:{}}),
    (id:string)=>({jsonrpc:'1.0',id,result:{}}),
    (id:string)=>({jsonrpc:'2.0',id}),
    (id:string)=>({jsonrpc:'2.0',id,error:{code:-1,message:'PRIVATE-WALLET-DATA'}}),
  ]){
    const service=await endpoint(t,(body,res)=>res.end(JSON.stringify(response(body.id))));
    await assert.rejects(new ZalletReadOnlyRpc({url:service.url}).call('getwalletstatus'),error=>{
      assert.ok(error instanceof ZalletProbeError);assert.equal(error.message.includes('PRIVATE-WALLET-DATA'),false);return true;
    });
    assert.equal(service.requests.length,1);
  }
});
test('RPC response limits, timeouts and redirects are enforced without retries',async t=>{
  const large=await endpoint(t,(_body,res)=>{res.write(' '.repeat(600));res.end();});
  await assert.rejects(new ZalletReadOnlyRpc({url:large.url,maxBytes:256}).call('getwalletstatus'),{code:'RESPONSE_LIMIT'});
  const slow=await endpoint(t,()=>{});
  await assert.rejects(new ZalletReadOnlyRpc({url:slow.url,timeoutMs:50}).call('getwalletstatus'),{code:'UNAVAILABLE'});
  const redirect=await endpoint(t,(_body,res)=>res.writeHead(302,{location:large.url}).end());
  await assert.rejects(new ZalletReadOnlyRpc({url:redirect.url}).call('getwalletstatus'),{code:'UNAVAILABLE'});
  assert.equal(large.requests.length,1);assert.equal(slow.requests.length,1);assert.equal(redirect.requests.length,1);
});
test('probe transport rejects remote endpoints, embedded credentials and incomplete authentication',()=>{
  for(const options of [{url:'http://example.com'},{url:'https://example.com'},{url:'file:///tmp/wallet'},{url:'http://user:secret@localhost'},{url:'http://localhost/?secret=x'},{url:'http://localhost',user:'probe'}])
    assert.throws(()=>new ZalletReadOnlyRpc(options),{code:'CONFIGURATION'});
});

const binding={accountId:'12345678-1234-4234-8234-123456789abc',address:'utest1syntheticcontractfixtureonly'};
const txid='a'.repeat(64);
const synced=()=>({node_tip:{height:100,blockhash:'b'.repeat(64)},wallet_tip:{height:100,blockhash:'b'.repeat(64)},fully_synced_height:100,locked:false});
function fixture(patch:Record<string,unknown>={}){
  const calls:{method:string;params:unknown[]}[]=[];
  const responses:Record<string,unknown>={getwalletstatus:synced(),z_getaccount:{account_uuid:binding.accountId,addresses:[{ua:binding.address}]},
    z_listunifiedreceivers:{orchard:binding.address},z_listtransactions:[{account_uuid:binding.accountId,txid,mined_height:99,expired_unmined:false,account_balance_delta:999999999}],
    z_viewtransaction:{txid,status:'mined',confirmations:2,blockhash:'c'.repeat(64),spends:[],outputs:[]},...patch};
  return {calls,async call(method:any,params:unknown[]=[]){calls.push({method,params});return responses[method];}};
}
test('probe checks persistent account/Orchard receiver and samples supported historical transaction contracts',async()=>{
  const rpc=fixture();const report=await probeZallet(rpc,binding);
  assert.equal(report.binding,'matched');assert.equal(report.synchronized,true);assert.equal(report.transactionsSampled,1);
  assert.equal(report.livePaymentsEnabled,false);assert.equal(report.binaryVersionVerified,false);assert.equal(report.historyComplete,false);assert.equal(report.networkIndependentlyVerified,false);
  assert.deepEqual(rpc.calls.map(c=>c.method),['getwalletstatus','z_getaccount','z_listunifiedreceivers','z_listtransactions','z_viewtransaction','getwalletstatus']);
  assert.deepEqual(rpc.calls.find(c=>c.method==='z_listtransactions')!.params,[binding.accountId,null,null,0,5]);
  assert.equal(JSON.stringify(report).includes(binding.accountId),false);assert.equal(JSON.stringify(report).includes(binding.address),false);assert.equal(JSON.stringify(report).includes(txid),false);
});
test('probe stops at missing binding or incomplete synchronization',async()=>{
  const missing=fixture();assert.equal((await probeZallet(missing)).binding,'missing');assert.equal(missing.calls.length,1);
  for(const status of [{...synced(),locked:true},{...synced(),wallet_tip:undefined},{...synced(),fully_synced_height:99},{...synced(),wallet_tip:{height:100,blockhash:'c'.repeat(64)}},
    {...synced(),sync_work_remaining:{unscanned_blocks:1,progress:{numerator:99,denominator:100}}}]){
    const rpc=fixture({getwalletstatus:status});const report=await probeZallet(rpc,binding);assert.equal(report.synchronized,false);assert.equal(report.binding,'unchecked');assert.equal(rpc.calls.length,1);
  }
});
test('probe rejects incorrect account, unknown receiver types and unrelated history/view identities',async()=>{
  for(const patch of [
    {z_getaccount:{account_uuid:'00000000-0000-4000-8000-000000000000',addresses:[{ua:binding.address}]}},
    {z_getaccount:{account_uuid:binding.accountId,addresses:[]}},
    {z_listunifiedreceivers:{orchard:binding.address,p2pkh:'transparent-receiver'}},
    {z_listunifiedreceivers:{orchard:'utest1differentreceiver'}},
    {z_listtransactions:[{account_uuid:'00000000-0000-4000-8000-000000000000',txid,mined_height:99,expired_unmined:false}]},
    {z_viewtransaction:{txid:'d'.repeat(64),status:'waiting',confirmations:0,spends:[],outputs:[]}},
  ])await assert.rejects(probeZallet(fixture(patch),binding),{code:'CONTRACT'});
});
test('probe rejects a chain-tip change across its read-only sample',async()=>{
  const rpc=fixture();let count=0;const call=rpc.call.bind(rpc);
  rpc.call=async(method,params=[])=>method==='getwalletstatus'&&count++>0?{...synced(),node_tip:{height:100,blockhash:'c'.repeat(64)}}:call(method,params);
  await assert.rejects(probeZallet(rpc,binding),{code:'CHAIN_CHANGED'});
});
