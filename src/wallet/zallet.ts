import { config } from '../config.ts';
import type { ReceivedNote, WalletAdapter } from './types.ts';

/**
 * Zallet JSON-RPC driver (Zebrad + Zallet; zcashd reached end-of-life on 2026-07-18).
 * Zallet is alpha software and its RPC surface is a moving target, so every method name
 * below is isolated in METHODS. Verify each against the Zallet release you pin
 * and the zcashd-compatibility table before relying on it.\n * This driver is NOT enabled: z_listreceivedbyaddress is not in the current Zallet RPC catalogue.\n * Do not enable without replacing this method and verifying receiver attribution.
 */
const METHODS = {
  newAccount: 'z_getnewaccount',
  addressForAccount: 'z_getaddressforaccount',   // returns a fresh diversified unified address
  listReceived: 'z_listreceivedbyaddress',       // CONFIRM Zallet supports this for unified addresses
  sendMany: 'z_sendmany',
  opStatus: 'z_getoperationresult',
  balance: 'z_getbalanceforaccount',
} as const;

export class ZalletWallet implements WalletAdapter {
  private account: number | null = null;
  private id = 0;
  constructor(private accountName = 'arcana') {}

  private async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (config.zalletUser) {
      headers.authorization = 'Basic ' + Buffer.from(`${config.zalletUser}:${config.zalletPass}`).toString('base64');
    }
    const res = await fetch(config.zalletUrl, {
      method: 'POST', headers,
      body: JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json()) as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`zallet ${method}: ${body.error.message}`);
    return body.result as T;
  }

  private async acct(): Promise<number> {
    if (this.account === null) {
      const r = await this.rpc<{ account: number }>(METHODS.newAccount, [this.accountName]);
      this.account = r.account;
    }
    return this.account;
  }

  async newAddress() {
    const r = await this.rpc<{ address: string }>(METHODS.addressForAccount, [await this.acct()]);
    return r.address;
  }

  async received(address: string): Promise<ReceivedNote[]> {
    const rows = await this.rpc<any[]>(METHODS.listReceived, [address, 0]);
    return rows.map((r) => ({
      txid: r.txid,
      zat: BigInt(Math.round(Number(r.amount) * 1e8)),
      memo: r.memoStr ?? decodeMemoHex(r.memo),
      confirmations: Number(r.confirmations ?? 0),
    }));
  }

  async send(to: string, zat: bigint, memo?: string) {
    const amount = Number(zat) / 1e8; // fine below 2^53 zat (~90M ZEC)
    const recipient: Record<string, unknown> = { address: to, amount };
    if (memo) recipient.memo = Buffer.from(memo, 'utf8').toString('hex');
    const opid = await this.rpc<string>(METHODS.sendMany, [await this.fromAddress(), [recipient]]);
    for (let i = 0; i < 60; i++) {
      const res = await this.rpc<any[]>(METHODS.opStatus, [[opid]]);
      if (res.length) {
        if (res[0].status !== 'success') throw new Error(`send failed: ${JSON.stringify(res[0].error)}`);
        return res[0].result.txid as string;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error('send timed out');
  }

  private async fromAddress(): Promise<string> {
    // TODO: confirm how Zallet expects the "from" parameter (account UUID vs address) at your pinned version.
    return this.newAddress();
  }

  async balance() {
    const r = await this.rpc<any>(METHODS.balance, [await this.acct(), 1]);
    return BigInt(Math.round(Number(r?.pools?.orchard?.valueZat ?? r?.valueZat ?? 0)));
  }
}

function decodeMemoHex(hex?: string): string | null {
  if (!hex || hex.startsWith('f6')) return null; // f6... = "no memo" marker
  const raw = Buffer.from(hex, 'hex');
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString('utf8') || null;
}
