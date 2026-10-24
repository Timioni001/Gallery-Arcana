import {config} from '../config.ts';
import {pool,tx} from '../db.ts';
import {settle} from '../services/settlement.ts';
import type {WalletAdapter} from '../wallet/types.ts';

export async function scanOnce(wallet:WalletAdapter){
  const {rows}=await pool.query(`SELECT id,address,expected_zat FROM payments
    WHERE status='pending' OR (status='expired' AND created_at>now()-interval '7 days')
    ORDER BY created_at LIMIT 500`);
  for (const p of rows) {
    try {
      // The wallet adapter is only usable once its per-invoice attribution contract is
      // verified. Even in mock mode, reject notes without this order's unique memo.
      const payment = (await pool.query('SELECT memo_code FROM payments WHERE id=$1',[p.id])).rows[0];
      if (!payment) continue;
      const confirmed=(await wallet.received(p.address)).filter(n=>
        n.memo===payment.memo_code && n.confirmations>=config.minConfirmations);
      if(!confirmed.length) continue;
      const total=confirmed.reduce((sum,n)=>sum+n.zat,0n);
      if(total<BigInt(p.expected_zat)) {
        await pool.query('UPDATE payments SET received_zat=$2 WHERE id=$1',[p.id,total.toString()]);
        continue;
      }
      await tx(async c=>{
        const {rows:current}=await c.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[p.id]);
        const payment=current[0];
        if(!payment || !['pending','expired'].includes(payment.status)) return;
        const late=payment.status==='expired';
        await c.query(`UPDATE payments SET status='confirmed',received_zat=$2,txid=$3,
          confirmations=$4,confirmed_at=now() WHERE id=$1`,
          [p.id,total.toString(),confirmed[0].txid,Math.min(...confirmed.map(n=>n.confirmations))]);
        await settle(c,{...payment,received_zat:total.toString()},late);
      });
    } catch(e) { console.error('[watcher] failed processing payment',p.id,(e as Error).message); }
  }
}
export async function topUpAddressPool(wallet:WalletAdapter){
  const {rows}=await pool.query('SELECT count(*)::int AS n FROM address_pool WHERE NOT claimed');
  for(let i=rows[0].n;i<config.addressPoolTarget;i++){
    const address=await wallet.newAddress();
    await pool.query('INSERT INTO address_pool(address) VALUES($1) ON CONFLICT DO NOTHING',[address]);
  }
}
