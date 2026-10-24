import { z } from 'zod';
import { pool, tx } from '../db.ts';
import type { Db } from '../db.ts';
import { bad, unauthorized } from '../lib/errors.ts';
import { hashPassphrase, randomToken, sha256, verifyPassphrase } from '../lib/crypto.ts';
import { config } from '../config.ts';

export const signupSchema = z.object({
  alias: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{2,23}$/),
  passphrase: z.string().min(12).max(200),
});

export async function createSession(db: Db, accountId: string) {
  const token = randomToken();
  await db.query('INSERT INTO sessions(token_hash, account_id, expires_at) VALUES ($1,$2,now()+make_interval(days=>$3))',
    [sha256(token), accountId, config.sessionDays]);
  return token;
}

export async function signup(alias: string, passphrase: string) {
  const parsed = signupSchema.safeParse({ alias, passphrase });
  if (!parsed.success) throw bad('Alias must be 3-24 letters/numbers; passphrase at least 12 characters');
  const hash = await hashPassphrase(parsed.data.passphrase);
  return tx(async c => {
    const existing = await c.query('SELECT 1 FROM accounts WHERE alias = $1', [parsed.data.alias]);
    if (existing.rows[0]) throw bad('Alias already in use');
    const { rows } = await c.query('INSERT INTO accounts(alias,pass_hash) VALUES ($1,$2) RETURNING id,alias', [parsed.data.alias,hash]);
    return { account: rows[0], sessionToken: await createSession(c,rows[0].id) };
  });
}

const DUMMY = await hashPassphrase('timing-equivalent-dummy-passphrase');
export async function login(alias: string, passphrase: string) {
  const { rows } = await pool.query('SELECT id,alias,pass_hash FROM accounts WHERE alias=$1', [alias.trim().toLowerCase()]);
  const ok = await verifyPassphrase(passphrase, rows[0]?.pass_hash ?? DUMMY);
  if (!rows[0] || !ok) throw unauthorized('Incorrect account details');
  return { account: { id: rows[0].id, alias: rows[0].alias }, sessionToken: await createSession(pool, rows[0].id) };
}

export async function loadSession(token: string) {
  const { rows } = await pool.query(`UPDATE sessions s
    SET expires_at=now()+make_interval(days=>$2)
    FROM accounts a WHERE s.account_id=a.id AND s.token_hash=$1 AND s.expires_at>now()
    RETURNING a.id, a.alias, a.payout_address`, [sha256(token),config.sessionDays]);
  return rows[0] ? { id: rows[0].id as string, alias: rows[0].alias as string, hasPayout: !!rows[0].payout_address } : null;
}

export async function logout(token: string) {
  await pool.query('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
}

export function looksShielded(addr: string) {
  // Shape check only. Wallet/network validation must be added before real funds.
  return /^(utest1|u1)[a-z0-9]{15,}$/i.test(addr) && addr.length < 350;
}

export async function updatePayout(accountId: string, address: string) {
  if (!looksShielded(address)) throw bad('Use a shielded-capable Zcash unified address for the selected network');
  await pool.query('UPDATE accounts SET payout_address=$2 WHERE id=$1', [accountId, address]);
  return { saved: true };
}
