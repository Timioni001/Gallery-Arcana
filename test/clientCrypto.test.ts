import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as sdk from '../packages/client-crypto/src/index.ts';
const origin='http://localhost:8080';
test('capsules authenticate chunks, metadata, ordering, length, final integrity and distinct fresh keys',async()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(60000));const input=new Uint8Array(150000);input.set(bytes);input.set(bytes,60000);
 const product=await sdk.encryptCapsule(input,{name:'secret-contract.txt',mime:'application/octet-stream'},65536);
 assert.deepEqual((await sdk.decryptCapsule(product.capsule,product.contentKey)).bytes,input);
 assert.equal(JSON.stringify(product.capsule).includes('secret-contract'),false);
 for(const change of [(c:sdk.Capsule)=>c.chunks.reverse(),(c:sdk.Capsule)=>c.chunks.pop(),(c:sdk.Capsule)=>{c.size--;},(c:sdk.Capsule)=>{c.metadata=(c.metadata[0]==='A'?'B':'A')+c.metadata.slice(1);},(c:sdk.Capsule)=>{c.prefix='AAAAAAAAAAA';}]){
  const bad=structuredClone(product.capsule);change(bad);await assert.rejects(sdk.decryptCapsule(bad,product.contentKey));
 }
 const other=await sdk.encryptCapsule(input,{name:'secret-contract.txt',mime:'application/octet-stream'},65536);assert.notDeepEqual(other.contentKey,product.contentKey);await assert.rejects(sdk.decryptCapsule(product.capsule,other.contentKey));
});
test('HPKE envelopes require recipient keys, pinned sender identities, context, signature and untampered ciphertext',async()=>{
 const seller=await sdk.generateIdentity(crypto.randomUUID(),origin),buyer=await sdk.generateIdentity(crypto.randomUUID(),origin),attacker=await sdk.generateIdentity(crypto.randomUUID(),origin);
 const resourceId=crypto.randomUUID(),context={origin,purpose:'evidence' as const,resourceId,nonce:crypto.randomUUID(),senderAccountId:seller.public.accountId,recipientAccountId:buyer.public.accountId,expiresAt:new Date(Date.now()+3600000).toISOString()};
 const envelope=await sdk.sealEnvelope(seller,buyer.public,buyer.public.fingerprint,context,sdk.encode({text:'confidential attached document'}));
 assert.equal(sdk.decode(await sdk.openEnvelope(buyer,seller.public,seller.public.fingerprint,envelope,{purpose:'evidence',resourceId})).text,'confidential attached document');
 await assert.rejects(sdk.openEnvelope(attacker,seller.public,seller.public.fingerprint,envelope,{purpose:'evidence',resourceId}));
 await assert.rejects(sdk.openEnvelope(buyer,seller.public,attacker.public.fingerprint,envelope,{purpose:'evidence',resourceId}));
 await assert.rejects(sdk.openEnvelope(buyer,seller.public,seller.public.fingerprint,{...envelope,context:{...context,resourceId:crypto.randomUUID()}},{purpose:'evidence',resourceId}));
 const bad=structuredClone(envelope);bad.ciphertext=(bad.ciphertext[0]==='A'?'B':'A')+bad.ciphertext.slice(1);await assert.rejects(sdk.openEnvelope(buyer,seller.public,seller.public.fingerprint,bad,{purpose:'evidence',resourceId}));
});
test('encrypted recovery backups restore both identity keys and reject wrong keys or altered contents',async()=>{
 const identity=await sdk.generateIdentity(crypto.randomUUID(),origin),key=crypto.getRandomValues(new Uint8Array(32));const backup=await sdk.backupIdentity(identity,key),restored=await sdk.restoreIdentity(backup,key);
 assert.deepEqual(restored.public,identity.public);assert.equal(JSON.stringify(backup).includes(identity.public.encryptionKey),false);
 assert.equal(await sdk.verifyStatement(identity.public,'test',await sdk.signStatement(restored,'test')),true);await assert.rejects(sdk.restoreIdentity(backup,crypto.getRandomValues(new Uint8Array(32))));
});

test('signed conversations validate attachment hashes and reject expired or cross-origin envelopes',async()=>{
 const a=await sdk.generateIdentity(crypto.randomUUID(),origin),b=await sdk.generateIdentity(crypto.randomUUID(),origin),resourceId=crypto.randomUUID();
 const expiresAt=new Date(Date.now()+3600000).toISOString(),item=await sdk.attachment('proof.txt',sdk.encode('selected attachment'));
 const context={origin,purpose:'message' as const,resourceId,nonce:crypto.randomUUID(),senderAccountId:a.public.accountId,recipientAccountId:b.public.accountId,expiresAt};
 const envelope=await sdk.sealEnvelope(a,b.public,b.public.fingerprint,context,sdk.encode({text:'selected',attachments:[item]}));assert.equal((await sdk.openConversation(b,a.public,a.public.fingerprint,resourceId,envelope)).attachments[0].sha256,item.sha256);
 const inconsistent=await sdk.sealEnvelope(a,b.public,b.public.fingerprint,{...context,nonce:crypto.randomUUID()},sdk.encode({text:'selected',attachments:[{...item,sha256:'0'.repeat(64)}]}));await assert.rejects(sdk.openConversation(b,a.public,a.public.fingerprint,resourceId,inconsistent));
 const expired=await sdk.sealEnvelope(a,b.public,b.public.fingerprint,{...context,nonce:crypto.randomUUID(),expiresAt:new Date(Date.now()-1000).toISOString()},sdk.encode({text:'expired'}));await assert.rejects(sdk.openConversation(b,a.public,a.public.fingerprint,resourceId,expired));
 const crossOrigin={...a.public,origin:'https://different-origin.example'};crossOrigin.fingerprint=await sdk.digest(sdk.identityBytes(crossOrigin));assert.equal(await sdk.verifyEnvelope(envelope,crossOrigin,b.public),false);
});
