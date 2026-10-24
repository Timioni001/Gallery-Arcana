import {pool} from '../db.ts';
import {sha256} from './crypto.ts';
/** Atomic fixed windows shared by all API instances. Only hashes of bucket keys are retained. */
export async function allow(key:string,max:number,windowMs:number):Promise<boolean>{
  const {rows}=await pool.query(`INSERT INTO rate_limits(key_hash,hits,reset_at)
    VALUES($1,1,clock_timestamp()+$3*interval '1 millisecond')
    ON CONFLICT(key_hash) DO UPDATE SET
      hits=CASE WHEN rate_limits.reset_at<=clock_timestamp() THEN 1 ELSE rate_limits.hits+1 END,
      reset_at=CASE WHEN rate_limits.reset_at<=clock_timestamp() THEN clock_timestamp()+$3*interval '1 millisecond' ELSE rate_limits.reset_at END
    RETURNING hits<=$2 AS allowed`,[sha256(key),max,windowMs]);
  return rows[0].allowed;
}
