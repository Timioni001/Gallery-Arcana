import {test} from 'node:test';
import assert from 'node:assert/strict';
import {usdCentsToZat,zatToZecString,splitSale,zip321} from '../src/lib/money.ts';
import {hashPassphrase,verifyPassphrase,newCode,hashCode} from '../src/lib/crypto.ts';

test('Zcash amount conversion rounds up at a fixed rate',()=>{
  assert.equal(usdCentsToZat(100,40_000_000n),2_500_000n);
  assert.equal(zatToZecString(2_500_000n),'0.025');
  assert.equal(zatToZecString(100_000_000n),'1');
});
test('payment requests encode ZEC amount and memo',()=>{
  assert.equal(zip321([{address:'utest1mock',zat:150_000_000n,memo:'GA-HELLO'}]),
    'zcash:utest1mock?amount=1.5&memo=R0EtSEVMTE8');
});
test('zero platform fee forwards the full received amount',()=>{
  assert.deepEqual(splitSale(2500,0),{artist:2500,gallery:0});
  assert.deepEqual(splitSale(2500,500),{artist:2375,gallery:125});
});
test('passphrases are salted and never saved as plaintext',async()=>{
  const p='a-long-unique-private-passphrase';
  const h=await hashPassphrase(p),h2=await hashPassphrase(p);
  assert.notEqual(h,h2);
  assert.equal(await verifyPassphrase(p,h),true);
  assert.equal(await verifyPassphrase('wrong-'+p,h),false);
});
test('private receipt is hard to guess and normalizes safely',()=>{
  const a=newCode('RCT',16),b=newCode('RCT',16);
  assert.notEqual(a,b);
  assert.equal(hashCode(a).equals(hashCode(a.toLowerCase())),true);
  assert.ok(a.length>=26);
});

test('private product is AES-GCM encrypted on disk and round-trips using only the secret', async()=>{
  const {randomBytes}=await import('node:crypto');
  const {unlinkSync,readFileSync}=await import('node:fs');
  const {resolve}=await import('node:path');
  process.env.ASSET_ENCRYPTION_KEY=randomBytes(32).toString('hex');
  const {storeAsset,privateBytes}=await import('../src/services/storage.ts');
  const content=Buffer.from('confidential digital item content');
  const {key}=storeAsset('private',content,'application/octet-stream');
  const path=resolve(process.env.STORAGE_DIR??'./storage','private',key);
  try{
    const disk=readFileSync(path);
    assert.equal(disk.includes(content),false);
    assert.deepEqual(privateBytes(key),content);
    process.env.ASSET_ENCRYPTION_KEY=randomBytes(32).toString('hex');
    assert.throws(()=>privateBytes(key));
  } finally {unlinkSync(path);}
});

import {detectPreviewMime} from '../src/lib/assetValidation.ts';
test('preview MIME comes from magic bytes, never the provided header',()=>{
  const png=Buffer.from('89504e470d0a1a0a001122','hex');
  assert.equal(detectPreviewMime(png),'image/png');
  const webp=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WEBP'),Buffer.alloc(4)]);
  assert.equal(detectPreviewMime(webp),'image/webp');
  assert.throws(()=>detectPreviewMime(Buffer.from('<script>test</script>')));
});
