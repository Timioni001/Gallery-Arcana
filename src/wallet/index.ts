import {config} from '../config.ts';
import {DatabaseMockWallet} from './databaseMock.ts';
import type {WalletAdapter} from './types.ts';
import {ZalletWallet} from './zalletWallet.ts';
let wallet:WalletAdapter|null=null;
/** Spending access is instantiated only by the worker. */
export function getWallet():WalletAdapter{
  if(config.walletDriver==='zallet')return wallet??=ZalletWallet.fromEnv(process.env,config.minConfirmations);
  return wallet??=new DatabaseMockWallet();
}
export {MockWallet} from './mock.ts';
