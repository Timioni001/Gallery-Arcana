// Operator console for the loopback-only admin API. Usage:
//   npm run admin -- disputes
//   npm run admin -- assign <orderId> <reviewerAlias>
//   npm run admin -- resolve <orderId> release|refund [refundAddress]
//   npm run admin -- stuck-payouts
//   npm run admin -- set-fee <basisPoints>             (0-1500; applies to new checkouts only, publicly logged)
//   npm run admin -- submissions                       (live wallet submissions not yet verified as sent)
//   npm run admin -- requeue <payoutId> --confirmed-not-sent   (only after checking the wallet/chain yourself)
import {config} from '../src/config.ts';
import {pool,tx} from '../src/db.ts';

const [cmd,...args]=process.argv.slice(2);
if(!config.adminToken){console.error('Set a strong ADMIN_TOKEN (32+ chars) in .env and restart the API.');process.exit(1);}
const call=async(method:string,path:string,body?:object)=>{
 const res=await fetch(`http://127.0.0.1:${config.port}${path}`,{method,redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{'x-admin-token':config.adminToken!,'x-arcana-action':'1',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const text=await res.text();if(!res.ok)throw new Error(`${res.status} ${text}`);return JSON.parse(text);
};
try{
 if(cmd==='disputes')console.table(await call('GET','/api/admin/disputes'));
 else if(cmd==='stuck-payouts')console.table(await call('GET','/api/admin/payouts/stuck'));
 else if(cmd==='assign'&&args[0]&&args[1]){
  const reviewer=(await pool.query('SELECT id FROM accounts WHERE alias=$1',[args[1].toLowerCase()])).rows[0];if(!reviewer)throw new Error('No account with that alias');
  const r=await call('POST',`/api/admin/orders/${args[0]}/reviewer`,{reviewerId:reviewer.id,replaceAssignment:args[2]==='--replace'});
  console.log(`Assigned @${args[1]} (key ${r.reviewerIdentity.fingerprint.slice(0,24)}…). They open /review/${args[0]} in the web app.`);
 }else if(cmd==='resolve'&&args[0]&&['release','refund'].includes(args[1]!))console.log(await call('POST',`/api/admin/orders/${args[0]}/resolve`,{decision:args[1],...(args[2]?{refundAddress:args[2]}:{})}));
 else if(cmd==='set-fee'&&args[0]!==undefined){
  const bps=Number(args[0]);if(!Number.isInteger(bps)||bps<0||bps>1500)throw new Error('Fee must be an integer from 0 to 1500 basis points (15%)');
  await tx(async c=>{await c.query("UPDATE settings SET value=$1::jsonb WHERE key='platform_cut_bps'",[JSON.stringify(bps)]);await c.query('INSERT INTO fee_history(fee_bps) VALUES($1)',[bps]);});
  console.log(`Platform fee set to ${bps/100}% for new checkouts. Existing orders keep the rate they were checked out under.`);
 }
 else if(cmd==='submissions')console.table((await pool.query("SELECT idempotency_key AS payout_id,state,operation_id,txids,error_code,updated_at FROM zallet_submissions WHERE state<>'sent' ORDER BY updated_at")).rows);
 else if(cmd==='requeue'&&args[0]&&args[1]==='--confirmed-not-sent'){
  // Clearing a submission is an operator assertion that no transaction for it exists on chain or in the wallet.
  const r=await pool.query("WITH s AS (DELETE FROM zallet_submissions WHERE idempotency_key=$1 AND state<>'sent' RETURNING 1) UPDATE payouts SET status='queued',failure_code='OPERATOR_REQUEUED',updated_at=now() WHERE id=$1::uuid AND status='sending' RETURNING id",[args[0]]);
  console.log(r.rowCount?'Requeued.':'Nothing to requeue (unknown id, already sent, or not in sending state).');
 }
 else{console.error('Usage: npm run admin -- disputes | assign <orderId> <reviewerAlias> [--replace] | resolve <orderId> release|refund [refundAddress] | stuck-payouts | set-fee <bps> | submissions | requeue <payoutId> --confirmed-not-sent');process.exitCode=1;}
}catch(e){console.error((e as Error).message);process.exitCode=1;}
finally{await pool.end();}
