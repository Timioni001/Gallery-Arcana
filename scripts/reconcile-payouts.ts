import {log,errorCode} from '../src/lib/log.ts';
import {pool} from '../src/db.ts';
import {getWallet} from '../src/wallet/index.ts';
import {reconcilePayouts} from '../src/jobs/payouts.ts';
try{
  const wallet=getWallet();if(!(await wallet.syncStatus()).ready)throw new Error('Wallet is not ready');
  await reconcilePayouts(wallet);
  const rows=(await pool.query("SELECT id,kind,status,attempts,failure_code FROM payouts WHERE status IN ('sending','failed') ORDER BY created_at")).rows;
  console.log(JSON.stringify({mode:'mock',unresolved:rows}));
}catch(error){log('reconciliation_failed',{code:errorCode(error),level:'error'});process.exitCode=1;}finally{await pool.end();}
