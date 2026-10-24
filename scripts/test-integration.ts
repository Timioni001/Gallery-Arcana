import pg from 'pg';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate} from '../src/migrations.ts';
import {config} from '../src/config.ts';
const source=new URL(process.env.TEST_DATABASE_ADMIN_URL??config.databaseUrl);source.pathname='/postgres';
const admin=new pg.Pool({connectionString:source.toString(),connectionTimeoutMillis:5000});
const files=readdirSync('test').filter(n=>n.endsWith('integration.test.ts')).sort((a,b)=>a==='integration.test.ts'?-1:b==='integration.test.ts'?1:a.localeCompare(b));
try{
  for(const file of files){
    const databaseName=`arcana_test_${randomBytes(8).toString('hex')}`;
    const storage=mkdtempSync(join(tmpdir(),'arcana-tests-'));
    let database:pg.Pool|undefined,created=false;
    try{
      await admin.query(`CREATE DATABASE ${databaseName}`);created=true;
      const target=new URL(source);target.pathname=`/${databaseName}`;
      database=new pg.Pool({connectionString:target.toString()});await migrate(database);await migrate(database);await database.end();database=undefined;
      const child=spawn(process.execPath,['--import','tsx','--test',`test/${file}`],{stdio:'inherit',env:{...process.env,
        DATABASE_URL:target.toString(),RUN_DB_TESTS:'1',ARCANA_ISOLATED_TEST_DB:'1',NODE_ENV:'test',
        STORAGE_DIR:storage,ASSET_ENCRYPTION_KEY:randomBytes(32).toString('hex'),MIN_CONFIRMATIONS:'2',
        PUBLIC_ORIGIN:'http://localhost:8080',ADMIN_TOKEN:'',WALLET_DRIVER:'mock',ZCASH_NETWORK:'test'}});
      const result=await new Promise<number>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?1:code??1));});
      if(result)process.exitCode=result;
    }finally{await database?.end();if(created)await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);rmSync(storage,{recursive:true,force:true});}
  }
}finally{await admin.end();}
