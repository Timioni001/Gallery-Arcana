import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

/** Transactional, checksummed migrations. The original schema remains the baseline. */
export async function migrate(database: Pool) {
  const client=await database.connect();
  try {
    await client.query("SELECT pg_advisory_lock(174428,1)");
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`);
    const baseline=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
    const migrations=[{name:'001_baseline.sql',sql:baseline},...readdirSync(new URL('../db/migrations/',import.meta.url)).filter(n=>/^\d+.*\.sql$/.test(n)).sort().map(name=>({name,sql:readFileSync(new URL(`../db/migrations/${name}`,import.meta.url),'utf8')}))];
    const applied=(await client.query('SELECT version,checksum FROM schema_migrations')).rows;
    for(const migration of migrations){
      const checksum=createHash('sha256').update(migration.sql).digest('hex');
      const existing=applied.find(row=>row.version===migration.name);
      if(existing){ if(existing.checksum!==checksum)throw new Error(`Migration checksum mismatch: ${migration.name}`); continue; }
      let adopt=false;
      if(migration.name==='001_baseline.sql'){
        const tables=['settings','accounts','sessions','uploaded_assets','listings','offers','address_pool','payments','orders','payouts'];
        const present=await client.query('SELECT tablename FROM pg_tables WHERE schemaname=current_schema() AND tablename=ANY($1)',[tables]);
        if(present.rowCount && present.rowCount!==tables.length)throw new Error('Incomplete pre-migration schema; restore or migrate explicitly');
        adopt=present.rowCount===tables.length;
      }
      if(!adopt)await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[migration.name,checksum]);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
  finally{await client.query('SELECT pg_advisory_unlock(174428,1)').catch(()=>{});client.release();}
}
