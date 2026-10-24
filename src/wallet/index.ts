import { config } from '../config.ts';
import { MockWallet } from './mock.ts';
import type { WalletAdapter } from './types.ts';

let wallet: WalletAdapter | null = null;
/** Worker-only. Importing this from the API process is a bug. */
export function getWallet(): WalletAdapter {
  if (config.walletDriver !== 'mock') throw new Error('Real Zallet wallet integration is NOT verified. Do not accept funds until the adapter has passed live testnet integration tests. See docs/ZALLET_GAP.md.');
  if (!wallet) wallet = new MockWallet();
  return wallet;
}
export { MockWallet };
