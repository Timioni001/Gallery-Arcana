import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseConfig} from '../src/config.ts';
import {matchZalletTransaction} from '../src/wallet/zalletNotes.ts';
import {verifyPassphrase} from '../src/lib/crypto.ts';
import {log} from '../src/lib/log.ts';

test('configuration fails closed for unsafe or malformed modes and parses decimal prices exactly',()=>{
  for(const env of [{WALLET_DRIVER:'zallet'},{ZCASH_NETWORK:'main'},{NODE_ENV:'production'},{MIN_CONFIRMATIONS:'0'},{MIN_CONFIRMATIONS:'1.2'},{ZEC_USD_FIXED:'NaN'},{PORT:'0'},{PUBLIC_ORIGIN:'http://example.com'},{PUBLIC_ORIGIN:'https://example.com/path'},{DATABASE_URL:'https://example.com'}])assert.throws(()=>parseConfig(env));
  assert.equal(parseConfig({ZEC_USD_FIXED:'40.123456'}).rateMicroUsd,40_123_456n);
  assert.equal(parseConfig({ADMIN_TOKEN:'replace-with-a-strong-secret'}).adminToken,null);
});
test('malformed or incompatible stored passphrase hashes fail closed',async()=>{
  for(const hash of ['x','scrypt$1$8$1$AAAA$AAAA','scrypt$32768$8$1$$'])assert.equal(await verifyPassphrase('secret',hash),false);
});
test('operational logger serializes only allowlisted metadata',()=>{
  const entries:string[]=[];const original=console.log;console.log=(line:string)=>{entries.push(line);};
  try{log('failure',{code:'BAD_CODE',id:'a-session-token',level:'error'});}finally{console.log=original;}
  assert.equal(entries.length,1);assert.equal(entries[0]!.includes('a-session-token'),false);assert.equal(JSON.parse(entries[0]!).code,'BAD_CODE');
});
const invoice={accountId:'test-account-uuid',address:'utest1contractfixtureonly',memo:'GA-INVOICE-TOKEN'};
const memo=Buffer.alloc(512);memo.write(invoice.memo);
const transaction=()=>({txid:'a'.repeat(64),status:'mined',confirmations:3,blockhash:'b'.repeat(64),spends:[{pool:'orchard'}],
  outputs:[{pool:'orchard',action:0,account_uuid:invoice.accountId,address:invoice.address,outgoing:false,walletInternal:false,valueZat:123456789,memo:memo.toString('hex'),memoStr:invoice.memo}]});
test('supported Zallet response contract matches exact account, receiver, memo and integer value',()=>{
  const notes=matchZalletTransaction(transaction(),invoice);assert.equal(notes.length,1);assert.equal(notes[0]!.zat,123456789n);assert.equal(notes[0]!.outputId,`${'a'.repeat(64)}:orchard:0`);
  for(const patch of [{address:'utest1differentreceiver'},{accountId:'other-account'},{memo:'other-memo'}])assert.deepEqual(matchZalletTransaction(transaction(),{...invoice,...patch}),[]);
});
test('Zallet fixtures reject transparent/mixed pools, internal outputs and malformed amounts/memos',()=>{
  for(const patch of [{walletInternal:true},{outgoing:true},{pool:'transparent'}]){const tx=transaction();Object.assign(tx.outputs[0]!,patch);assert.deepEqual(matchZalletTransaction(tx,invoice),[]);}
  for(const patch of [{valueZat:0.1},{valueZat:Number.MAX_SAFE_INTEGER+1},{memo:'00'},{memoStr:'spoofed'}]){const tx=transaction();Object.assign(tx.outputs[0]!,patch);assert.throws(()=>matchZalletTransaction(tx,invoice));}
  const tx=transaction();tx.outputs.push({...tx.outputs[0]!});assert.throws(()=>matchZalletTransaction(tx,invoice));
});
test('Zallet fixtures represent unmined/reorganized notes without inventing confirmations',()=>{
  const tx=transaction();tx.status='waiting';tx.confirmations=0;
  assert.equal(matchZalletTransaction(tx,invoice)[0]!.confirmations,0);
  tx.status='expired';tx.confirmations=-1;assert.equal(matchZalletTransaction(tx,invoice)[0]!.canonical,false);
});
