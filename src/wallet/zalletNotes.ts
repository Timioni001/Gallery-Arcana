import {z} from 'zod';
import type {ReceivedNote} from './types.ts';
const pool=z.enum(['orchard','sapling','transparent','ironwood']);
const value=z.union([z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),z.string().regex(/^[0-9]+$/)])
  .transform(v=>BigInt(v)).refine(v=>v>0n&&v<=2_100_000_000_000_000n);
const transaction=z.object({
  txid:z.string().regex(/^[a-f0-9]{64}$/),status:z.enum(['mined','waiting','expiringsoon','expired']),
  confirmations:z.number().int().min(-1),blockhash:z.string().regex(/^[a-f0-9]{64}$/).optional(),
  spends:z.array(z.object({pool})),
  outputs:z.array(z.object({pool,action:z.number().int().nonnegative().optional(),output:z.number().int().nonnegative().optional(),
    account_uuid:z.string().optional(),address:z.string().optional(),outgoing:z.boolean().nullable().optional(),walletInternal:z.boolean(),
    valueZat:value,memo:z.string().optional(),memoStr:z.string().optional()})),
});
export function textMemo(hex:string){
  if(!/^[a-fA-F0-9]{1024}$/.test(hex))throw new Error('Invalid memo encoding');
  const bytes=Buffer.from(hex,'hex');
  let end=bytes.length;while(end>0&&bytes[end-1]===0)end--;
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,end));
}
export function parseZalletTransaction(raw:unknown){return transaction.parse(raw);}
/** Offline response-contract normalizer for supported z_viewtransaction, NOT a live scanner.
 * A live integration must also prove network, account/receiver validation, full history,
 * raw-transaction privacy, synchronization and stable chain snapshots. It remains disabled.
 */
export function matchZalletTransaction(raw:unknown,invoice:{accountId:string;address:string;memo:string}):ReceivedNote[]{
  const tx=parseZalletTransaction(raw);
  // Conservative Orchard-only contract. Viewing data alone is not a full privacy proof.
  if(tx.spends.some(n=>n.pool!=='orchard')||tx.outputs.some(n=>n.pool!=='orchard'))return [];
  if(tx.status==='mined'&&(!tx.blockhash||tx.confirmations<1))throw new Error('Inconsistent mined transaction');
  if(tx.status!=='mined'&&tx.confirmations>0)throw new Error('Inconsistent confirmations');
  const notes:ReceivedNote[]=[];
  const seen=new Set<string>();
  for(const output of tx.outputs){
    if(output.account_uuid!==invoice.accountId||output.address!==invoice.address||output.walletInternal||output.outgoing!==false)continue;
    if(output.action===undefined||!output.memo)continue;
    const memo=textMemo(output.memo);
    if(output.memoStr!==undefined&&output.memoStr!==memo)throw new Error('Inconsistent memo fields');
    if(memo!==invoice.memo)continue;
    const outputId=`${tx.txid}:orchard:${output.action}`;
    if(seen.has(outputId))throw new Error('Duplicate output index');seen.add(outputId);
    notes.push({outputId,txid:tx.txid,address:invoice.address,zat:output.valueZat,memo,
      confirmations:Math.max(0,tx.confirmations),canonical:tx.status!=='expired',shielded:true});
  }
  return notes;
}

/** Memo text for attribution, or null for empty (0xF6), binary or malformed memos.
 * Never throws: a payer-controlled memo must not be able to halt scanning. */
export function memoOrNull(hex:string|undefined):string|null{
  if(!hex||/^f6/i.test(hex))return null;
  try{const text=textMemo(hex);return text||null;}catch{return null;}
}
