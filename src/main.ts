import {config} from './config.ts';
import {buildServer} from './http/server.ts';
import {pool} from './db.ts';
import {validateAssetKey} from './services/storage.ts';
import {attestationKeys} from './services/attestationKeys.ts';
import {log,errorCode} from './lib/log.ts';
const app=buildServer();
let stopping=false;
async function stop(){
  if(stopping)return;stopping=true;
  const deadline=setTimeout(()=>process.exit(1),10000).unref();
  await app.close();await pool.end();clearTimeout(deadline);
}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
try{
  if(['ZALLET_RPC_PASS','ZCASH_SPENDING_KEY','WALLET_SEED'].some(name=>!!process.env[name]))throw new Error('Spending credentials must not be present in the API environment');
  validateAssetKey();attestationKeys();
  if(!(await pool.query("SELECT 1 FROM schema_migrations WHERE version='007_acquisition_payout_terms.sql'")).rowCount)throw new Error('Migrations required');
  await app.listen({port:config.port,host:config.host});log('api_started');
}catch(error){log('api_start_failed',{code:errorCode(error),level:'error'});await stop();process.exitCode=1;}
