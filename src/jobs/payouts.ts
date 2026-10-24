import {pool} from '../db.ts';
import type {WalletAdapter} from '../wallet/types.ts';
/** Unknown RPC outcomes are never retried automatically: replay can double-pay. */
export async function runPayouts(wallet:WalletAdapter,batch=10){
  const claimed=await pool.query(`UPDATE payouts SET status='sending',attempts=attempts+1
    WHERE id IN (SELECT id FROM payouts WHERE status='queued' ORDER BY created_at
      FOR UPDATE SKIP LOCKED LIMIT $1)
    RETURNING id,to_address,zat`,[batch]);
  for(const p of claimed.rows){
    try {
      const txid=await wallet.send(p.to_address,BigInt(p.zat));
      await pool.query(`UPDATE payouts SET status='sent',txid=$2 WHERE id=$1`,[p.id,txid]);
    }catch(e){
      // Sending may have succeeded before the network response failed.
      // Leave it in 'sending'; operations must reconcile wallet tx history manually.
      console.error('[payout] needs manual reconciliation',p.id,(e as Error).message);
    }
  }
}
