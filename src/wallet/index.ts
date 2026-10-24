import {config} from '../config.ts';
import {DatabaseMockWallet} from './databaseMock.ts';
import type {WalletAdapter} from './types.ts';
let wallet:WalletAdapter|null=null;
/** Spending access is instantiated only by the worker. */
export function getWallet():WalletAdapter{
  if(config.walletDriver!=='mock')throw new Error('Real wallet disabled; see docs/ZALLET_GAP.md');
  return wallet??=new DatabaseMockWallet();
}
export {MockWallet} from './mock.ts';
