import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O, U

export function base32(buf: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Human-friendly random code, e.g. ARC-7K2M-Q9XD-4HTP. 10 bytes = 80 bits by default. */
export function newCode(prefix: string, bytes = 10): string {
  const s = base32(randomBytes(bytes));
  return `${prefix}-${s.match(/.{1,4}/g)!.join('-')}`;
}

export const normalizeCode = (s: string) => s.trim().toUpperCase().replace(/[\s]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
export const sha256 = (s: string | Uint8Array) => createHash('sha256').update(s).digest();
export const hashCode = (s: string) => sha256(normalizeCode(s));
export const randomToken = () => randomBytes(32).toString('base64url');

// ---- passphrases: scrypt, per-user salt, constant-time compare ----
const N = 1 << 15, R = 8, P = 1;
function scryptAsync(pw: string, salt: Buffer, len: number): Promise<Buffer> {
  return new Promise((res, rej) =>
    _scrypt(pw, salt, len, { N, r: R, p: P, maxmem: 128 * N * R * 2 }, (e, k) => (e ? rej(e) : res(k))));
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(passphrase.normalize('NFKC'), salt, 32);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const [alg, , , , salt, key] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scryptAsync(passphrase.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}
