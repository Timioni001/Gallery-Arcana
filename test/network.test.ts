import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shieldedDestination,unifiedPattern} from '../src/lib/network.ts';
import {parseConfig} from '../src/config.ts';
import {ZalletWallet} from '../src/wallet/zalletWallet.ts';

const ua=(hrp:string)=>`${hrp}1${'q'.repeat(40)}`;
test('address prefixes are network-specific and mainnet is never accepted',()=>{
  assert.ok(unifiedPattern('test').test(ua('utest')));assert.ok(!unifiedPattern('test').test(ua('uregtest')));
  assert.ok(unifiedPattern('regtest').test(ua('uregtest')));assert.ok(!unifiedPattern('regtest').test(ua('utest')));
  for(const n of ['test','regtest'] as const){assert.ok(!shieldedDestination(n).test(ua('u')),'mainnet UA');assert.ok(!shieldedDestination(n).test('tmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),'transparent');}
  assert.ok(shieldedDestination('regtest').test(`zregtestsapling1${'q'.repeat(70)}`));
});
test('regtest is reserved for verifying the Zallet adapter; testnet live mode still needs market prices',()=>{
  const base={...process.env,ZALLET_TESTNET_ACK:'unverified-testnet-only'};
  assert.throws(()=>parseConfig({...base,ZCASH_NETWORK:'regtest',WALLET_DRIVER:'mock'}),/regtest is only/);
  assert.equal(parseConfig({...base,ZCASH_NETWORK:'regtest',WALLET_DRIVER:'zallet',PRICE_SOURCE:'fixed'}).network,'regtest');
  assert.throws(()=>parseConfig({...base,ZCASH_NETWORK:'test',WALLET_DRIVER:'zallet',PRICE_SOURCE:'fixed'}),/PRICE_SOURCE=market/);
  assert.throws(()=>parseConfig({...base,ZCASH_NETWORK:'main',WALLET_DRIVER:'zallet',PRICE_SOURCE:'market'}));
});
test('the adapter binding must match its network',()=>{
  const rpc={call:async()=>null};const accountId='3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
  assert.throws(()=>new ZalletWallet(rpc,{accountId,fundingAddress:ua('utest'),minConfirmations:2,network:'regtest'}),/Invalid Zallet binding/);
  assert.doesNotThrow(()=>new ZalletWallet(rpc,{accountId,fundingAddress:ua('uregtest'),minConfirmations:2,network:'regtest'}));
});
