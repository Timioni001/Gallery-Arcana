import {pool} from '../src/db.ts';
import {migrate} from '../src/migrations.ts';
import {log,errorCode} from '../src/lib/log.ts';
try{await migrate(pool);console.log('Migrations applied; schema is current');}
catch(error){log('migration_failed',{level:'error',code:errorCode(error)});process.exitCode=1;}
finally{await pool.end();}
