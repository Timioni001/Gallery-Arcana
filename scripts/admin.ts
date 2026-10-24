// Operator console for the loopback-only admin API. Usage:
//   npm run admin -- disputes
//   npm run admin -- assign <orderId> <reviewerAlias>
//   npm run admin -- resolve <orderId> release|refund [refundAddress]
//   npm run admin -- stuck-payouts
import {config} from '../src/config.ts';
import {pool} from '../src/db.ts';

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
 else{console.error('Usage: npm run admin -- disputes | assign <orderId> <reviewerAlias> [--replace] | resolve <orderId> release|refund [refundAddress] | stuck-payouts');process.exitCode=1;}
}catch(e){console.error((e as Error).message);process.exitCode=1;}
finally{await pool.end();}
