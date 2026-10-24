import {randomBytes} from 'node:crypto';
import {pool,tx} from '../db.ts';
import {config} from '../config.ts';
import type {WalletAdapter,ReceivedNote,SendLookup} from './types.ts';
/** Durable test simulator. SQL records are mock evidence, never blockchain confirmations. */
export class DatabaseMockWallet implements WalletAdapter{
  async syncStatus(){await pool.query('SELECT 1');return {ready:true};}
  async newAddress(){const address=`utest1mock${randomBytes(12).toString('hex')}`;await pool.query('INSERT INTO mock_addresses(address) VALUES($1)',[address]);return address;}
  async received(address:string):Promise<ReceivedNote[]>{
    return (await pool.query('SELECT * FROM mock_notes WHERE address=$1',[address])).rows.map(n=>({outputId:n.output_id,txid:n.txid,address:n.address,zat:BigInt(n.zat),memo:n.memo,confirmations:n.confirmations,shielded:true,canonical:n.canonical}));
  }
  async simulatePayment(address:string,zat:bigint,memo:string|null,confirmations=config.minConfirmations){
    if(zat<=0n||zat>2_100_000_000_000_000n||!Number.isSafeInteger(confirmations)||confirmations<0)throw new Error('Invalid mock amount');
    const txid=randomBytes(32).toString('hex'),outputId=`${txid}:orchard:0`;
    await pool.query('INSERT INTO mock_notes(output_id,txid,address,zat,memo,confirmations) VALUES($1,$2,$3,$4,$5,$6)',[outputId,txid,address,zat.toString(),memo,confirmations]);return outputId;
  }
  async lookupSend(key:string):Promise<SendLookup>{
    const row=(await pool.query('SELECT * FROM mock_sends WHERE idempotency_key=$1',[key])).rows[0];
    return row?{state:'found',txid:row.txid,to:row.to_address,zat:BigInt(row.zat)}:{state:'not_found'};
  }
  async send(to:string,zat:bigint,_memo?:string,key=randomBytes(16).toString('hex')){
    return tx(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(174428,2)');
      const prior=(await c.query('SELECT * FROM mock_sends WHERE idempotency_key=$1',[key])).rows[0];
      if(prior){if(prior.to_address!==to||BigInt(prior.zat)!==zat)throw new Error('Idempotency conflict');return prior.txid as string;}
      const used=BigInt((await c.query('SELECT COALESCE(sum(zat),0)::text AS used FROM mock_sends')).rows[0].used);
      if(zat<=0n||zat>1_000_000_000_000n-used)throw new Error('Insufficient mock funds');
      const txid=randomBytes(32).toString('hex');
      await c.query('INSERT INTO mock_sends(idempotency_key,txid,to_address,zat) VALUES($1,$2,$3,$4)',[key,txid,to,zat.toString()]);return txid;
    });
  }
  async balance(){return 1_000_000_000_000n-BigInt((await pool.query('SELECT COALESCE(sum(zat),0)::text AS used FROM mock_sends')).rows[0].used);}
}
