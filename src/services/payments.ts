import type { Db } from '../db.ts';
import { setting } from '../db.ts';
import { HttpError } from '../lib/errors.ts';
import { newCode } from '../lib/crypto.ts';
import { usdCentsToZat, zatToZecString, zip321 } from '../lib/money.ts';
import { getOracle } from './pricing.ts';

export async function createPayment(c: Db, p: { usdCents: number; refId: string; expiresAt: Date }) {
  const claimed = await c.query(`UPDATE address_pool SET claimed=true, claimed_at=now()
    WHERE address=(SELECT address FROM address_pool WHERE NOT claimed ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING address`);
  if (!claimed.rows[0]) throw new HttpError(503,'Payment service is warming up. Try again shortly.');
  const rate = await getOracle().rateMicroUsd();
  const zat = usdCentsToZat(p.usdCents,rate);
  const memo = newCode('GA',16);
  const { rows } = await c.query(`INSERT INTO payments(address,memo_code,usd_cents,rate_micro_usd,expected_zat,ref_id,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [claimed.rows[0].address,memo,p.usdCents,rate.toString(),zat.toString(),p.refId,p.expiresAt]);
  return { paymentId: rows[0].id as string,address: claimed.rows[0].address as string,memo,
    amountZat: zat.toString(),amountZec: zatToZecString(zat),
    usdCents: p.usdCents,uri: zip321([{address:claimed.rows[0].address,zat,memo}]),
    expiresAt:p.expiresAt.toISOString() };
}
