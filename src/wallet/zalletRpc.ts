import {randomUUID} from 'node:crypto';
import {z} from 'zod';

export type RpcFailure='CONFIGURATION'|'UNAVAILABLE'|'PROTOCOL'|'RESPONSE_LIMIT'|'RPC_REJECTED'|'CONTRACT'|'CHAIN_CHANGED';
export class ZalletRpcError extends Error{
  constructor(readonly code:RpcFailure,readonly rpcCode?:number){super(`Zallet RPC failed: ${code}`);}
}
const rpcConfig=z.object({
  url:z.string().url(),user:z.string().max(256).default(''),password:z.string().max(4096).default(''),
  timeoutMs:z.number().int().min(10).max(120000).default(5000),
  maxBytes:z.number().int().min(256).max(16_777_216).default(1_048_576),
});
export type ZalletRpcOptions=z.input<typeof rpcConfig>;

/** A JSON number written verbatim, so ZEC amounts never pass through floating point. */
export class RawNumber{
  constructor(readonly literal:string){if(!/^(0|[1-9][0-9]{0,7})(\.[0-9]{1,8})?$/.test(literal))throw new ZalletRpcError('CONFIGURATION');}
}
function encode(body:unknown){
  const raws:string[]=[];
  const json=JSON.stringify(body,(_k,v)=>{if(v instanceof RawNumber){raws.push(v.literal);return `__raw_${raws.length-1}__`;}return v;});
  return json.replace(/"__raw_(\d+)__"/g,(_m,i)=>raws[Number(i)]!);
}

/**
 * Loopback-only JSON-RPC transport with an explicit method allowlist, bounded
 * responses, request-id matching and no redirects or retries. Callers decide
 * what an ambiguous outcome means; the transport never resends.
 */
export class ZalletRpc{
  private readonly options:z.infer<typeof rpcConfig>;
  constructor(options:ZalletRpcOptions,private readonly allowed:readonly string[],private readonly fail:(code:RpcFailure,rpcCode?:number)=>Error=(c,r)=>new ZalletRpcError(c,r)){
    const parsed=rpcConfig.safeParse(options);
    if(!parsed.success)throw this.fail('CONFIGURATION');
    const url=new URL(parsed.data.url);
    if(!['http:','https:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.search||url.hash)
      throw this.fail('CONFIGURATION');
    if(!!parsed.data.user!==!!parsed.data.password)throw this.fail('CONFIGURATION');
    this.options=parsed.data;
  }
  /** UNAVAILABLE: no response, the request may or may not have been processed. RPC_REJECTED: the server answered with an error. */
  async call(method:string,params:unknown[]=[],timeoutMs=this.options.timeoutMs):Promise<unknown>{
    if(!this.allowed.includes(method))throw this.fail('CONFIGURATION');
    const id=randomUUID();let response:Response;
    try{
      response=await fetch(this.options.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
        headers:{'content-type':'application/json',...(this.options.user?{authorization:`Basic ${Buffer.from(`${this.options.user}:${this.options.password}`).toString('base64')}`}:{})},
        body:encode({jsonrpc:'2.0',id,method,params})});
    }catch{throw this.fail('UNAVAILABLE');}
    const reader=response.body?.getReader();if(!reader)throw this.fail('PROTOCOL');
    const chunks:Uint8Array[]=[];let size=0;
    try{
      for(;;){const {done,value}=await reader.read();if(done)break;
        size+=value.byteLength;
        if(size>this.options.maxBytes){await reader.cancel();throw this.fail('RESPONSE_LIMIT');}
        chunks.push(value);
      }
    }catch(error){if(error instanceof Error&&error.message.includes('RESPONSE_LIMIT'))throw error;throw this.fail('UNAVAILABLE');}
    finally{reader.releaseLock();}
    let result:any;
    try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw this.fail(response.ok?'PROTOCOL':'RPC_REJECTED');}
    if(!result||typeof result!=='object'||Array.isArray(result)||result.jsonrpc!=='2.0'||result.id!==id)throw this.fail(response.ok?'PROTOCOL':'RPC_REJECTED');
    if(Object.hasOwn(result,'error')&&result.error!==null)throw this.fail('RPC_REJECTED',typeof result.error?.code==='number'?result.error.code:undefined);
    if(!response.ok)throw this.fail('RPC_REJECTED');
    if(!Object.hasOwn(result,'result'))throw this.fail('PROTOCOL');
    return result.result;
  }
}
