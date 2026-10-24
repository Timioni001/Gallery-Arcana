import {createHash} from 'node:crypto';
import {pool,tx} from '../src/db.ts';
import {privateBytes,validateAssetKey} from '../src/services/storage.ts';
import {log,errorCode} from '../src/lib/log.ts';
try{
  validateAssetKey();let updated=0;
  const rows=(await pool.query("SELECT key FROM uploaded_assets WHERE kind='private' AND file_sha256 IS NULL ORDER BY key")).rows;
  for(const asset of rows){
    const bytes=privateBytes(asset.key);if(!bytes)throw new Error('Missing original');
    const digest=createHash('sha256').update(bytes).digest('hex');
    await tx(async c=>{
      await c.query("UPDATE uploaded_assets SET file_sha256=$2 WHERE key=$1 AND kind='private' AND file_sha256 IS NULL",[asset.key,digest]);
      await c.query('UPDATE listings SET file_sha256=$2 WHERE file_key=$1 AND file_sha256 IS NULL',[asset.key,digest]);
    });updated++;
  }
  console.log(JSON.stringify({updated}));
}catch(error){log('asset_backfill_failed',{level:'error',code:errorCode(error)});process.exitCode=1;}
finally{await pool.end();}
