import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {canDownload,canBuyerConfirm,equalDigest,signTransfer,verifyTransfer,type TransferClaim} from '../src/lib/acquisition.ts';

test('no download before funded shielded payment is confirmed',()=>{
  assert.equal(canDownload('awaiting_payment'),false);
  assert.equal(canDownload('expired'),false);
  assert.equal(canDownload('refund_due'),false);
  assert.equal(canDownload('funded'),true);
  assert.equal(canDownload('disputed'),true);
  assert.equal(canDownload('paid'),true);
});
test('buyer cannot release seller payment before download and funding',()=>{
  assert.equal(canBuyerConfirm('awaiting_payment',true),false);
  assert.equal(canBuyerConfirm('funded',false),false);
  assert.equal(canBuyerConfirm('funded',true),true);
  assert.equal(canBuyerConfirm('disputed',true),false);
  assert.equal(canBuyerConfirm('paid',true),false);
});
test('file fingerprint must match exact acquisition bytes',()=>{
  const a=createHash('sha256').update('licensed artwork v1').digest('hex');
  const b=createHash('sha256').update('licensed artwork v2').digest('hex');
  assert.equal(equalDigest(a,a.toUpperCase()),true);
  assert.equal(equalDigest(a,b),false);
  assert.equal(equalDigest('garbage',a),false);
});
test('Ed25519 transfer proofs verify offline and cannot be modified',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const privatePem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
  const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
  const claim:TransferClaim={version:1,orderId:'7d32a9c1-3e4b-4908-9055-0112ac6bd091',
    listingId:'98fd0585-b920-4bc8-9696-c9ef15bc9cc6',
    assetSha256:createHash('sha256').update('verified file').digest('hex'),
    finalizedAt:'2026-10-24T00:00:00.000Z',outcome:'buyer_accepted',paymentMode:'mock'};
  const proof=signTransfer(claim,privatePem);
  assert.equal(verifyTransfer(proof,publicPem),true);
  assert.equal(verifyTransfer({...proof,claim:{...claim,outcome:'operator_release'}},publicPem),false);
  assert.equal(verifyTransfer({...proof,claim:{...claim,paymentMode:'testnet'}},publicPem),false);
  assert.equal(verifyTransfer({...proof,claim:{...claim,assetSha256:'0'.repeat(64)}},publicPem),false);
  const other=generateKeyPairSync('ed25519');
  assert.equal(verifyTransfer(proof,other.publicKey.export({type:'spki',format:'pem'}).toString()),false);
});
