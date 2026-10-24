export const ZAT_PER_ZEC = 100_000_000n;

/** rateMicroUsd = USD per 1 ZEC, multiplied by 1e6 (so $40.25 -> 40_250_000n). Rounds up. */
export function usdCentsToZat(cents: number, rateMicroUsd: bigint): bigint {
  if (rateMicroUsd <= 0n) throw new Error('bad rate');
  const num = BigInt(cents) * 10n ** 12n;
  return (num + rateMicroUsd - 1n) / rateMicroUsd;
}

export function zatToZecString(zat: bigint): string {
  const whole = zat / ZAT_PER_ZEC;
  const frac = (zat % ZAT_PER_ZEC).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Gallery cut in basis points, floored; the artist gets the remainder. */
export function splitSale(priceCents: number, cutBps: number) {
  const gallery = Math.floor((priceCents * cutBps) / 10_000);
  return { gallery, artist: priceCents - gallery };
}

/** Accept payments that are short by up to `bps` (price wobble, wallet rounding). */
export function acceptable(received: bigint, expected: bigint, bps = 100): boolean {
  return received * 10_000n >= expected * BigInt(10_000 - bps);
}

export type PayTo = { address: string; zat: bigint; memo?: string };

/** ZIP-321 payment request. Two or more recipients become one URI the buyer's wallet pays in one tx. */
export function zip321(payments: PayTo[]): string {
  const memoB64 = (m: string) => Buffer.from(m, 'utf8').toString('base64url');
  if (payments.length === 1) {
    const p = payments[0];
    return `zcash:${p.address}?amount=${zatToZecString(p.zat)}${p.memo ? `&memo=${memoB64(p.memo)}` : ''}`;
  }
  const parts = payments.map((p, i) => {
    const sfx = i === 0 ? '' : `.${i}`;
    return `address${sfx}=${p.address}&amount${sfx}=${zatToZecString(p.zat)}${p.memo ? `&memo${sfx}=${memoB64(p.memo)}` : ''}`;
  });
  return `zcash:?${parts.join('&')}`;
}
