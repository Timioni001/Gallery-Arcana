import { randomBytes } from 'node:crypto';
import type { ReceivedNote, WalletAdapter } from './types.ts';

/** In-memory wallet for demos and tests. `simulatePayment` stands in for a buyer's wallet. */
export class MockWallet implements WalletAdapter {
  private notes = new Map<string, ReceivedNote[]>();
  private funds = 10_000_000_000n;
  sent: { to: string; zat: bigint; memo?: string; txid: string }[] = [];

  async newAddress() {
    const a = `utest1mock${randomBytes(12).toString('hex')}`;
    this.notes.set(a, []);
    return a;
  }
  async received(address: string) {
    return this.notes.get(address) ?? [];
  }
  async send(to: string, zat: bigint, memo?: string) {
    if (zat > this.funds) throw new Error('insufficient funds');
    this.funds -= zat;
    const txid = randomBytes(16).toString('hex');
    this.sent.push({ to, zat, memo, txid });
    return txid;
  }
  async balance() { return this.funds; }

  simulatePayment(address: string, zat: bigint, memo: string | null, confirmations = 1) {
    const list = this.notes.get(address);
    if (!list) throw new Error('unknown address');
    list.push({ txid: randomBytes(16).toString('hex'), zat, memo, confirmations });
  }
}
