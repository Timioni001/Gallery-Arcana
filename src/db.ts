import pg from 'pg';
import { config } from './config.ts';

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });
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

const settingsCache = new Map<string, { v: unknown; at: number }>();
export async function setting<T = number>(key: string, db: Db = pool): Promise<T> {
  const hit = settingsCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.v as T;
  const { rows } = await db.query('SELECT value FROM settings WHERE key = $1', [key]);
  if (!rows[0]) throw new Error(`Unknown setting ${key}`);
  settingsCache.set(key, { v: rows[0].value, at: Date.now() });
  return rows[0].value as T;
}
