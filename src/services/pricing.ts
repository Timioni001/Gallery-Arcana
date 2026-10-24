import { config } from '../config.ts';
import { pool } from '../db.ts';
import { HttpError } from '../lib/errors.ts';
/** USD/ZEC quote in integer microdollars. */
export interface PriceOracle { rateMicroUsd(): Promise<bigint>; }
/** Demo quote from ZEC_USD_FIXED. Mock settlement only; never for real funds. */
export const fixedOracle:PriceOracle={async rateMicroUsd(){return config.rateMicroUsd;}};
/** Latest worker-stored market quote; refuses rather than using a stale price. */
export const marketOracle:PriceOracle={async rateMicroUsd(){
  const row=(await pool.query(`SELECT rate_micro_usd FROM price_quotes WHERE fetched_at>clock_timestamp()-make_interval(secs=>$1) ORDER BY fetched_at DESC LIMIT 1`,[config.priceMaxAgeSeconds])).rows[0];
  if(!row)throw new HttpError(503,'A current ZEC price is unavailable. Try again shortly.');
  return BigInt(row.rate_micro_usd);
}};
let oracle:PriceOracle=config.priceSource==='market'?marketOracle:fixedOracle;
export const getOracle=()=>oracle;
export const setOracle=(value:PriceOracle)=>{oracle=value;};
