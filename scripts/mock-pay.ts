// Local development only: pays a pending mock order through the worker's
// loopback simulator. Usage: npm run mock:pay -- <memo shown on the order page>
import {config} from '../src/config.ts';
import {pool} from '../src/db.ts';

const memo=process.argv[2]?.trim();
if(!memo){console.error('Usage: npm run mock:pay -- <memo>');process.exit(1);}
if(!config.simulatorToken){console.error('MOCK_SIMULATOR_TOKEN is not set in .env.worker');process.exit(1);}
try{
  const p=(await pool.query("SELECT address,expected_zat::text AS zat FROM payments WHERE memo_code=$1 AND status='pending'",[memo])).rows[0];
  if(!p)throw new Error('No pending payment with that memo');
  const res=await fetch(`http://127.0.0.1:${config.workerPort}/dev/pay`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'content-type':'application/json',authorization:`Bearer ${config.simulatorToken}`},body:JSON.stringify({address:p.address,zat:p.zat,memo})});
  if(!res.ok)throw new Error(`Simulator returned ${res.status}; is the worker running?`);
  console.log(`Simulated ${Number(p.zat)/1e8} testnet ZEC to ${p.address}. The order page updates once confirmations arrive.`);
}catch(e){console.error((e as Error).message);process.exitCode=1;}
finally{await pool.end();}
