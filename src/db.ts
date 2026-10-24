import pg from 'pg';
import {log} from './lib/log.ts';
import { config } from './config.ts';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20,connectionTimeoutMillis:5000,statement_timeout:15000 });
pool.on('error',()=>log('database_connection_error',{level:'error'}));
export type Db = pg.PoolClient | pg.Pool;

/** Run fn inside a transaction. Retries on serialization failures / deadlocks. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const out = await fn(c);
      await c.query('COMMIT');
      return out;
    } catch (e: any) {
      await c.query('ROLLBACK').catch(() => {});
      if ((e.code === '40001' || e.code === '40P01') && i < attempts) continue;
      throw e;
    } finally {
      c.release();
    }
  }
}

export async function setting<T = number>(key:string,db:Db=pool):Promise<T>{
  const {rows}=await db.query('SELECT value FROM settings WHERE key=$1',[key]);
  if(!rows[0])throw new Error('Unknown setting');return rows[0].value as T;
}
