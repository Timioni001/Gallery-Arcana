/** Tiny in-memory sliding window. Fine for one API process; move to Redis if you run several. */
const hits = new Map<string, number[]>();
export function allow(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  return true;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 3_600_000)) hits.delete(k); }, 600_000).unref();
