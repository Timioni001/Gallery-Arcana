import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {parseZalletTransaction} from './zalletNotes.ts';

const methods=z.enum(['getwalletstatus','z_getaccount','z_listunifiedreceivers','z_listtransactions','z_viewtransaction']);
type ReadMethod=z.infer<typeof methods>;
type Failure='CONFIGURATION'|'UNAVAILABLE'|'PROTOCOL'|'RESPONSE_LIMIT'|'RPC_REJECTED'|'CONTRACT'|'CHAIN_CHANGED';
export class ZalletProbeError extends Error{
  constructor(readonly code:Failure){super(`Read-only Zallet probe failed: ${code}`);}
}
const rpcConfig=z.object({
  url:z.string().url(),user:z.string().max(256).default(''),password:z.string().max(4096).default(''),
  timeoutMs:z.number().int().min(10).max(30000).default(5000),
  maxBytes:z.number().int().min(256).max(4_194_304).default(1_048_576),
});

/** Diagnostic transport only. No spend, address generation, account creation or retries. */
export class ZalletReadOnlyRpc{
  private readonly options:z.infer<typeof rpcConfig>;
  constructor(options:z.input<typeof rpcConfig>){
    const parsed=rpcConfig.safeParse(options);
    if(!parsed.success)throw new ZalletProbeError('CONFIGURATION');
    const url=new URL(parsed.data.url);
    if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)
      throw new ZalletProbeError('CONFIGURATION');
    if(!!parsed.data.user!==!!parsed.data.password)throw new ZalletProbeError('CONFIGURATION');
    this.options=parsed.data;
  }
  async call(method:ReadMethod,params:unknown[]=[]):Promise<unknown>{
    if(!methods.safeParse(method).success)throw new ZalletProbeError('CONFIGURATION');
    const id=randomUUID();let response:Response;
    try{
      response=await fetch(this.options.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(this.options.timeoutMs),
        headers:{'content-type':'application/json',...(this.options.user?{authorization:`Basic ${Buffer.from(`${this.options.user}:${this.options.password}`).toString('base64')}`}:{})},
        body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
    }catch{throw new ZalletProbeError('UNAVAILABLE');}
    if(!response.ok){await response.body?.cancel();throw new ZalletProbeError('RPC_REJECTED');}
    const reader=response.body?.getReader();if(!reader)throw new ZalletProbeError('PROTOCOL');
    const chunks:Uint8Array[]=[];let size=0;
    try{
      for(;;){const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>this.options.maxBytes){await reader.cancel();throw new ZalletProbeError('RESPONSE_LIMIT');}
        chunks.push(value);
      }
    }catch(error){if(error instanceof ZalletProbeError)throw error;throw new ZalletProbeError('UNAVAILABLE');}
    finally{reader.releaseLock();}
    let result:any;
    try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ZalletProbeError('PROTOCOL');}
    if(!result||typeof result!=='object'||Array.isArray(result)||result.jsonrpc!=='2.0'||result.id!==id)throw new ZalletProbeError('PROTOCOL');
    if(Object.hasOwn(result,'error'))throw new ZalletProbeError('RPC_REJECTED');
    if(!Object.hasOwn(result,'result'))throw new ZalletProbeError('PROTOCOL');
    return result.result;
  }
}

const height=z.number().int().min(0).max(4_294_967_295),hash=z.string().regex(/^[a-f0-9]{64}$/);
const tip=z.object({height,blockhash:hash});
const status=z.object({node_tip:tip,wallet_tip:tip.optional(),fully_synced_height:height.optional(),locked:z.boolean(),
  sync_work_remaining:z.object({unscanned_blocks:height,progress:z.object({numerator:z.number().int().nonnegative(),denominator:z.number().int().nonnegative()})}).optional()});
function synced(s:z.infer<typeof status>){
  return !s.locked&&!s.sync_work_remaining&&s.wallet_tip?.height===s.node_tip.height&&s.wallet_tip?.blockhash===s.node_tip.blockhash&&s.fully_synced_height===s.node_tip.height;
}
function contract<T>(fn:()=>T):T{try{return fn();}catch(error){if(error instanceof ZalletProbeError)throw error;throw new ZalletProbeError('CONTRACT');}}

/** Samples supported read contracts; never produces notes for the settlement worker.
 * Matching tips do not prove a complete/snapshot-consistent history or binary identity.
 */
export async function probeZallet(rpc:Pick<ZalletReadOnlyRpc,'call'>,binding?:{accountId:string;address:string}){
  if(binding&&!z.object({accountId:z.string().uuid(),address:z.string().regex(/^utest1[a-z0-9]{15,349}$/)}).safeParse(binding).success)
    throw new ZalletProbeError('CONFIGURATION');
  const firstRaw=await rpc.call('getwalletstatus');
  const first=contract(()=>status.parse(firstRaw));
  const report={readOnly:true,livePaymentsEnabled:false,binaryVersionVerified:false,networkIndependentlyVerified:false,
    synchronized:synced(first),binding:'missing' as 'missing'|'unchecked'|'matched',transactionsSampled:0,historyComplete:false};
  if(!binding)return report;
  report.binding='unchecked';if(!report.synchronized)return report;
  const accountRaw=await rpc.call('z_getaccount',[binding.accountId]);
  const account=contract(()=>z.object({account_uuid:z.string().uuid(),addresses:z.array(z.object({ua:z.string().optional()})).max(10000)}).parse(accountRaw));
  if(account.account_uuid!==binding.accountId||!account.addresses.some(a=>a.ua===binding.address))throw new ZalletProbeError('CONTRACT');
  const receiverRaw=await rpc.call('z_listunifiedreceivers',[binding.address]);
  const receiver=contract(()=>z.object({orchard:z.string()}).strict().parse(receiverRaw));
  // The pinned RPC re-encodes the Orchard receiver as a single-receiver UA.
  if(receiver.orchard!==binding.address)throw new ZalletProbeError('CONTRACT');
  const historyRaw=await rpc.call('z_listtransactions',[binding.accountId,null,null,0,5]);
  const history=contract(()=>z.array(z.object({account_uuid:z.string().uuid(),txid:hash,mined_height:height.nullable(),expired_unmined:z.boolean()})).max(5).parse(historyRaw));
  const seen=new Set<string>();
  for(const item of history){
    if(item.account_uuid!==binding.accountId||seen.has(item.txid))throw new ZalletProbeError('CONTRACT');seen.add(item.txid);
    const raw=await rpc.call('z_viewtransaction',[item.txid]);
    const transaction=contract(()=>parseZalletTransaction(raw));
    if(transaction.txid!==item.txid)throw new ZalletProbeError('CONTRACT');
  }
  const lastRaw=await rpc.call('getwalletstatus');const last=contract(()=>status.parse(lastRaw));
  if(!synced(last)||last.node_tip.height!==first.node_tip.height||last.node_tip.blockhash!==first.node_tip.blockhash)throw new ZalletProbeError('CHAIN_CHANGED');
  report.binding='matched';report.transactionsSampled=history.length;return report;
}
