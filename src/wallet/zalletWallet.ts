import {z} from 'zod';
import {pool,tx} from '../db.ts';
import {zatToZecString} from '../lib/money.ts';
import {log} from '../lib/log.ts';
import {PayoutNotSubmittedError,type ReceivedNote,type SendLookup,type WalletAdapter} from './types.ts';
import {RawNumber,ZalletRpc,ZalletRpcError,type ZalletRpcOptions} from './zalletRpc.ts';
import {memoOrNull,parseZalletTransaction} from './zalletNotes.ts';
import {shieldedDestination,unifiedPattern,type Network} from '../lib/network.ts';

export const ZALLET_METHODS=['getwalletstatus','z_getaddressforaccount','z_listtransactions','z_viewtransaction','z_sendmany','z_getoperationstatus','z_getbalanceforaccount'] as const;
type Rpc=Pick<ZalletRpc,'call'>;

const height=z.number().int().min(0).max(4_294_967_295),hash=z.string().regex(/^[a-f0-9]{64}$/);
const tip=z.object({height,blockhash:hash});
const walletStatus=z.object({node_tip:tip,wallet_tip:tip.optional(),fully_synced_height:height.optional(),locked:z.boolean(),sync_work_remaining:z.unknown().optional()});
type Status=z.infer<typeof walletStatus>;
const listed=z.array(z.object({account_uuid:z.string().uuid(),txid:hash,mined_height:height.nullable(),expired_unmined:z.boolean()}).passthrough());
const operation=z.object({id:z.string(),status:z.enum(['queued','executing','cancelled','failed','success']),
  result:z.object({txid:hash.optional(),txids:z.array(hash).min(1).max(16),broadcast:z.boolean()}).optional(),error:z.object({code:z.number()}).passthrough().optional()}).passthrough();
const derived=z.object({address:z.string(),receiver_types:z.array(z.string())}).passthrough();

export type ZalletBinding={accountId:string;fundingAddress:string;minConfirmations:number;network?:Network;reorgDepth?:number;pageSize?:number;maxTransactions?:number;sendTimeoutMs?:number};
const synced=(s:Status)=>!s.sync_work_remaining&&s.wallet_tip?.height===s.node_tip.height&&s.wallet_tip?.blockhash===s.node_tip.blockhash&&s.fully_synced_height===s.node_tip.height;
const sameTip=(a:Status,b:Status)=>a.node_tip.height===b.node_tip.height&&a.node_tip.blockhash===b.node_tip.blockhash;

/**
 * Zcash testnet adapter for the pinned Zallet RPC contract (docs/ZALLET_GAP.md).
 *
 * Receiving: each scan takes one chain snapshot. It lists the account's
 * transactions, re-views every unmined or shallow one so reorgs and expiry are
 * observed, and commits only if the chain tip did not move during the scan.
 * Transactions that disappear from the wallet's history become non-canonical.
 *
 * Sending: a submission row is committed before z_sendmany is called. An RPC
 * rejection is the only outcome treated as "not submitted"; every other
 * failure, lost response or unbroadcast result is left for reconciliation
 * and is never resubmitted.
 */
export class ZalletWallet implements WalletAdapter{
  readonly flagsUnattributed=true;
  private lastScan:{height:number;hash:string;at:number}|null=null;
  private readonly b:Required<ZalletBinding>;
  constructor(private readonly rpc:Rpc,binding:ZalletBinding){
    this.b={network:'test',reorgDepth:100,pageSize:100,maxTransactions:20000,sendTimeoutMs:180000,...binding};
    if(!z.string().uuid().safeParse(binding.accountId).success||!unifiedPattern(this.b.network).test(binding.fundingAddress))throw new Error('Invalid Zallet binding');
  }
  static fromEnv(env:NodeJS.ProcessEnv,minConfirmations:number,network:Network='test'){
    const options:ZalletRpcOptions={url:env.ZALLET_RPC_URL??'',user:env.ZALLET_RPC_USER??'',password:env.ZALLET_RPC_PASS??'',timeoutMs:15000,maxBytes:8_388_608};
    return new ZalletWallet(new ZalletRpc(options,ZALLET_METHODS),{accountId:env.ZALLET_ACCOUNT_ID??'',fundingAddress:env.ZALLET_RECEIVE_ADDRESS??'',minConfirmations,network});
  }
  private async status(){
    try{return walletStatus.parse(await this.rpc.call('getwalletstatus'));}catch(e){if(e instanceof ZalletRpcError)throw e;throw new ZalletRpcError('CONTRACT');}
  }

  async syncStatus(){
    const first=await this.status();
    if(!synced(first))return {ready:false};
    const last=this.lastScan;
    if(last&&last.height===first.node_tip.height&&last.hash===first.node_tip.blockhash&&Date.now()-last.at<10_000)return {ready:true};
    return {ready:await this.scan(first)};
  }

  /** Returns false (and commits nothing) if the chain moved while scanning. */
  private async scan(first:Status){
    const history=new Map<string,z.infer<typeof listed>[number]>();
    for(let offset=0;;offset+=this.b.pageSize){
      const page=listed.parse(await this.rpc.call('z_listtransactions',[this.b.accountId,null,null,offset,this.b.pageSize]));
      for(const item of page){if(item.account_uuid!==this.b.accountId)throw new ZalletRpcError('CONTRACT');history.set(item.txid,item);}
      if(page.length<this.b.pageSize)break;
      if(offset+this.b.pageSize>=this.b.maxTransactions)throw new ZalletRpcError('RESPONSE_LIMIT');
    }
    const known=new Map((await pool.query('SELECT txid,status,confirmations,present FROM zallet_transactions')).rows.map(r=>[r.txid as string,r]));
    const views:ReturnType<typeof parseZalletTransaction>[]=[];
    for(const txid of history.keys()){
      const k=known.get(txid);
      if(k&&k.present&&k.status==='mined'&&k.confirmations>=this.b.reorgDepth)continue;
      const view=parseZalletTransaction(await this.rpc.call('z_viewtransaction',[txid]));
      if(view.txid!==txid)throw new ZalletRpcError('CONTRACT');
      if(view.status==='mined'&&(!view.blockhash||view.confirmations<1))throw new ZalletRpcError('CONTRACT');
      views.push(view);
    }
    const end=await this.status();
    if(!synced(end)||!sameTip(first,end)){log('zallet_scan_discarded',{level:'warn'});return false;}
    await tx(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(174428,6)');
      for(const v of views){
        await c.query(`INSERT INTO zallet_transactions(txid,status,confirmations,blockhash,present,viewed_at) VALUES($1,$2,$3,$4,true,now())
          ON CONFLICT(txid) DO UPDATE SET status=EXCLUDED.status,confirmations=EXCLUDED.confirmations,blockhash=EXCLUDED.blockhash,present=true,viewed_at=now()`,
          [v.txid,v.status,v.confirmations,v.blockhash??null]);
        const fullyOrchard=v.spends.every(s=>s.pool==='orchard')&&v.outputs.every(o=>o.pool==='orchard');
        for(const o of v.outputs){
          if(o.account_uuid!==this.b.accountId||o.walletInternal||o.outgoing!==false||!o.address)continue;
          const index=o.action??o.output;if(index===undefined)continue;
          const outputId=`${v.txid}:${o.pool}:${index}`;
          const row=(await c.query(`INSERT INTO zallet_observations(output_id,txid,address,memo,zat,shielded) VALUES($1,$2,$3,$4,$5,$6)
            ON CONFLICT(output_id) DO UPDATE SET observed_at=now() WHERE zallet_observations.txid=EXCLUDED.txid AND zallet_observations.address=EXCLUDED.address
              AND zallet_observations.zat=EXCLUDED.zat AND zallet_observations.memo IS NOT DISTINCT FROM EXCLUDED.memo RETURNING output_id`,
            [outputId,v.txid,o.address,memoOrNull(o.memo),o.valueZat.toString(),fullyOrchard&&o.pool==='orchard'])).rowCount;
          if(!row)throw new ZalletRpcError('CONTRACT');
        }
      }
      await c.query('UPDATE zallet_transactions SET present=false WHERE present AND NOT (txid=ANY($1::text[]))',[[...history.keys()]]);
      await c.query(`INSERT INTO zallet_scan_state(id,tip_height,tip_hash) VALUES(true,$1,$2)
        ON CONFLICT(id) DO UPDATE SET tip_height=EXCLUDED.tip_height,tip_hash=EXCLUDED.tip_hash,scanned_at=now()`,[end.node_tip.height,end.node_tip.blockhash]);
    });
    this.lastScan={height:end.node_tip.height,hash:end.node_tip.blockhash,at:Date.now()};
    return true;
  }

  async received(address:string):Promise<ReceivedNote[]>{
    const {rows}=await pool.query(`SELECT o.*,t.status,t.confirmations,t.present FROM zallet_observations o JOIN zallet_transactions t USING(txid) WHERE o.address=$1`,[address]);
    return rows.map(r=>({outputId:r.output_id,txid:r.txid,address:r.address,zat:BigInt(r.zat),memo:r.memo,confirmations:Math.max(0,r.confirmations),
      shielded:r.shielded,canonical:r.present&&r.status!=='expired'}));
  }

  /** Fresh Orchard-only unified address per invoice; never creates accounts. */
  async newAddress(){
    const d=derived.parse(await this.rpc.call('z_getaddressforaccount',[this.b.accountId,['orchard']]));
    if(d.receiver_types.length!==1||d.receiver_types[0]!=='orchard'||!unifiedPattern(this.b.network).test(d.address))throw new ZalletRpcError('CONTRACT');
    return d.address;
  }

  async balance(){
    const raw=await this.rpc.call('z_getbalanceforaccount',[this.b.accountId,this.b.minConfirmations]);
    const parsed=z.object({pools:z.object({orchard:z.object({valueZat:z.number().int().nonnegative()}).optional()}).passthrough()}).passthrough().parse(raw);
    return BigInt(parsed.pools.orchard?.valueZat??0);
  }

  async send(to:string,zat:bigint,memo?:string,key?:string){
    if(!key)throw new PayoutNotSubmittedError('NO_IDEMPOTENCY_KEY');
    if(memo!==undefined)throw new PayoutNotSubmittedError('MEMO_UNSUPPORTED');
    if(!shieldedDestination(this.b.network).test(to))throw new PayoutNotSubmittedError('UNSUPPORTED_DESTINATION');
    if(zat<=0n||zat>2_100_000_000_000_000n)throw new PayoutNotSubmittedError('INVALID_AMOUNT');
    const prior=(await pool.query('SELECT * FROM zallet_submissions WHERE idempotency_key=$1',[key])).rows[0];
    if(prior){
      const found=await this.lookupSend(key);
      if(found.state==='found')return found.txid;
      if(prior.state==='rejected'){await pool.query('DELETE FROM zallet_submissions WHERE idempotency_key=$1 AND state=$2',[key,'rejected']);}
      else throw new Error('PRIOR_SUBMISSION_UNRESOLVED');
    }
    const s=await this.status();
    if(!synced(s))throw new PayoutNotSubmittedError('NOT_SYNCED');
    if(s.locked)throw new PayoutNotSubmittedError('WALLET_LOCKED');
    const inserted=await pool.query(`INSERT INTO zallet_submissions(idempotency_key,to_address,zat,state) VALUES($1,$2,$3,'submitting') ON CONFLICT DO NOTHING`,[key,to,zat.toString()]);
    if(!inserted.rowCount)throw new Error('PRIOR_SUBMISSION_UNRESOLVED');
    let opid:unknown;
    try{opid=await this.rpc.call('z_sendmany',[this.b.fundingAddress,[{address:to,amount:new RawNumber(zatToZecString(zat))}],this.b.minConfirmations,null,'FullPrivacy'],60_000);}
    catch(e){
      if(e instanceof ZalletRpcError&&e.code==='RPC_REJECTED'){
        await pool.query("UPDATE zallet_submissions SET state='rejected',error_code=$2,updated_at=now() WHERE idempotency_key=$1",[key,`RPC_${e.rpcCode??'ERROR'}`]);
        throw new PayoutNotSubmittedError('REJECTED');
      }
      await pool.query("UPDATE zallet_submissions SET error_code='AMBIGUOUS_SUBMISSION',updated_at=now() WHERE idempotency_key=$1",[key]);
      throw new Error('AMBIGUOUS_SUBMISSION');
    }
    if(typeof opid!=='string'||!/^opid-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(opid)){
      await pool.query("UPDATE zallet_submissions SET error_code='INVALID_OPERATION_ID',updated_at=now() WHERE idempotency_key=$1",[key]);
      throw new Error('INVALID_OPERATION_ID');
    }
    await pool.query("UPDATE zallet_submissions SET state='submitted',operation_id=$2,updated_at=now() WHERE idempotency_key=$1",[key,opid]);
    const deadline=Date.now()+this.b.sendTimeoutMs;
    for(let wait=500;;wait=Math.min(wait*2,5000)){
      const r=await this.lookupSend(key);
      if(r.state==='found')return r.txid;
      const row=(await pool.query('SELECT state FROM zallet_submissions WHERE idempotency_key=$1',[key])).rows[0];
      if(row.state!=='submitted'||Date.now()+wait>deadline)throw new Error(row.state==='submitted'?'OPERATION_PENDING':`OPERATION_${String(row.state).toUpperCase()}`);
      await new Promise(resolve=>setTimeout(resolve,wait));
    }
  }

  /** Reconciles a submission by its durable key. Only a verified broadcast counts as sent. */
  async lookupSend(key:string):Promise<SendLookup>{
    const row=(await pool.query('SELECT * FROM zallet_submissions WHERE idempotency_key=$1',[key])).rows[0];
    if(!row||row.state==='rejected')return {state:'not_found'};
    if(row.state==='sent')return {state:'found',txid:row.txids.join(','),to:row.to_address,zat:BigInt(row.zat)};
    if(row.state!=='submitted'||!row.operation_id)return {state:'unknown'};
    const ops=z.array(operation).parse(await this.rpc.call('z_getoperationstatus',[[row.operation_id]]));
    const op=ops.find(o=>o.id===row.operation_id);
    if(!op||op.status==='queued'||op.status==='executing')return {state:'unknown'};
    const mark=(state:string,code:string)=>pool.query('UPDATE zallet_submissions SET state=$2,error_code=$3,updated_at=now() WHERE idempotency_key=$1',[key,state,code]);
    if(op.status!=='success'||!op.result){await mark('failed',`OPERATION_${op.status.toUpperCase()}`);return {state:'unknown'};}
    if(!op.result.broadcast){await mark('unbroadcast','NOT_BROADCAST');return {state:'unknown'};}
    let paid=0n;
    for(const txid of op.result.txids){
      const view=parseZalletTransaction(await this.rpc.call('z_viewtransaction',[txid]));
      if(view.txid!==txid)throw new ZalletRpcError('CONTRACT');
      for(const o of view.outputs)if(o.outgoing===true&&!o.walletInternal&&o.address===row.to_address)paid+=o.valueZat;
    }
    if(paid!==BigInt(row.zat)){await mark('failed','VERIFY_MISMATCH');return {state:'unknown'};}
    await pool.query("UPDATE zallet_submissions SET state='sent',txids=$2,updated_at=now() WHERE idempotency_key=$1",[key,op.result.txids]);
    return {state:'found',txid:op.result.txids.join(','),to:row.to_address,zat:BigInt(row.zat)};
  }
}
