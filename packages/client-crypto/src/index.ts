import {CipherSuite,DhkemP256HkdfSha256,HkdfSha256,Aes256Gcm} from '@hpke/core';
const suite=new CipherSuite({kem:new DhkemP256HkdfSha256(),kdf:new HkdfSha256(),aead:new Aes256Gcm()});
const te=new TextEncoder(),td=new TextDecoder('utf-8',{fatal:true});
const ab=(v:Uint8Array)=>v.slice().buffer as ArrayBuffer;
export const encode=(v:unknown)=>te.encode(JSON.stringify(v));
export const decode=(v:Uint8Array)=>JSON.parse(td.decode(v));
export function b64(v:Uint8Array){let s='';for(const n of v)s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export function unb64(s:string){if(!/^[A-Za-z0-9_-]+$/.test(s))throw new Error('Invalid base64url');const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/'));const out=Uint8Array.from(raw,c=>c.charCodeAt(0));if(b64(out)!==s)throw new Error('Noncanonical base64url');return out;}
export async function digest(v:Uint8Array){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',ab(v)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export type PublicIdentity={v:1;keyId:string;accountId:string;origin:string;encryptionKey:string;signingKey:string;fingerprint:string};
export type Identity={public:PublicIdentity;encryption:CryptoKeyPair;signing:CryptoKeyPair};
export function identityBytes(p:Omit<PublicIdentity,'fingerprint'>|PublicIdentity){return encode(['arcana-identity/v1',p.keyId,p.accountId,p.origin,p.encryptionKey,p.signingKey]);}
export async function validatePublicIdentity(p:PublicIdentity){
 if(p.v!==1||!uuid(p.keyId)||!uuid(p.accountId)||new URL(p.origin).origin!==p.origin||unb64(p.encryptionKey).length!==65||unb64(p.signingKey).length!==65||await digest(identityBytes(p))!==p.fingerprint)throw new Error('Invalid identity');
 await suite.kem.deserializePublicKey(ab(unb64(p.encryptionKey)));await signingPublic(p);
}
export async function generateIdentity(accountId:string,origin:string):Promise<Identity>{
 const encryption=await suite.kem.generateKeyPair(),signing=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const p={v:1 as const,keyId:crypto.randomUUID(),accountId,origin,encryptionKey:b64(new Uint8Array(await suite.kem.serializePublicKey(encryption.publicKey))),signingKey:b64(new Uint8Array(await crypto.subtle.exportKey('raw',signing.publicKey)))};
 const identity={public:{...p,fingerprint:await digest(identityBytes(p))},encryption,signing};await validatePublicIdentity(identity.public);return identity;
}
async function signingPublic(p:PublicIdentity){return crypto.subtle.importKey('raw',ab(unb64(p.signingKey)),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);}
export async function signStatement(identity:Identity,statement:string){return b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.signing.privateKey,ab(te.encode(statement)))));}
export async function verifyStatement(p:PublicIdentity,statement:string,signature:string){try{return unb64(signature).length===64&&await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await signingPublic(p),ab(unb64(signature)),ab(te.encode(statement)));}catch{return false;}}
export async function sealChallenge(recipient:PublicIdentity,secret:Uint8Array,info:string){await validatePublicIdentity(recipient);const sealed=await suite.seal({recipientPublicKey:await suite.kem.deserializePublicKey(ab(unb64(recipient.encryptionKey))),info:ab(te.encode(info))},ab(secret));return {enc:b64(new Uint8Array(sealed.enc)),ciphertext:b64(new Uint8Array(sealed.ct))};}
export async function openChallenge(identity:Identity,sealed:{enc:string;ciphertext:string},info:string){return new Uint8Array(await suite.open({recipientKey:identity.encryption.privateKey,enc:ab(unb64(sealed.enc)),info:ab(te.encode(info))},ab(unb64(sealed.ciphertext))));}
export function registrationStatement(statement:string,secret:string){return JSON.stringify(['arcana-registration/v1',statement,secret]);}
export async function answerRegistration(identity:Identity,challenge:{statement:string;sealed:{enc:string;ciphertext:string}},previous?:Identity){
 const binding=JSON.parse(challenge.statement);if(binding[0]!=='arcana-registration-challenge/v1'||binding[2]!==identity.public.accountId||binding[3]!==identity.public.origin||binding[4]!==identity.public.fingerprint)throw new Error('Identity binding mismatch');
 const secret=b64(await openChallenge(identity,challenge.sealed,challenge.statement)),statement=registrationStatement(challenge.statement,secret);
 return {secret,signature:await signStatement(identity,statement),previousSignature:previous?await signStatement(previous,statement):undefined};
}
export type Context={origin:string;purpose:'capsule-key'|'message'|'evidence';resourceId:string;nonce:string;senderAccountId:string;recipientAccountId:string;expiresAt:string};
export type Envelope={v:1;senderKeyId:string;recipientKeyId:string;context:Context;enc:string;ciphertext:string;signature:string};
function uuid(s:string){return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);}
export function envelopeInfo(e:Pick<Envelope,'v'|'senderKeyId'|'recipientKeyId'|'context'>){const c=e.context;
 if(new URL(c.origin).origin!==c.origin||e.v!==1||!['capsule-key','message','evidence'].includes(c.purpose)||![e.senderKeyId,e.recipientKeyId,c.resourceId,c.nonce,c.senderAccountId,c.recipientAccountId].every(uuid)||!Number.isFinite(Date.parse(c.expiresAt)))throw new Error('Invalid envelope context');
 return JSON.stringify(['arcana-envelope/v1',c.origin,e.senderKeyId,e.recipientKeyId,c.purpose,c.resourceId,c.nonce,c.senderAccountId,c.recipientAccountId,c.expiresAt]);}
export function envelopeStatement(e:Envelope){return JSON.stringify([envelopeInfo(e),e.enc,e.ciphertext]);}
export async function sealEnvelope(sender:Identity,recipient:PublicIdentity,pinnedFingerprint:string,context:Context,plaintext:Uint8Array):Promise<Envelope>{
 await validatePublicIdentity(recipient);if(recipient.fingerprint!==pinnedFingerprint||context.origin!==sender.public.origin||context.senderAccountId!==sender.public.accountId||context.recipientAccountId!==recipient.accountId||sender.public.origin!==recipient.origin||plaintext.length>65536)throw new Error('Envelope binding mismatch');
 const header={v:1 as const,senderKeyId:sender.public.keyId,recipientKeyId:recipient.keyId,context};const sealed=await sealChallenge(recipient,plaintext,envelopeInfo(header));
 const envelope={...header,...sealed,signature:''};envelope.signature=await signStatement(sender,envelopeStatement(envelope));return envelope;
}
export async function verifyEnvelope(e:Envelope,sender:PublicIdentity,recipient:PublicIdentity){try{
 await validatePublicIdentity(sender);await validatePublicIdentity(recipient);
 return e.context.origin===sender.origin&&e.v===1&&e.senderKeyId===sender.keyId&&e.recipientKeyId===recipient.keyId&&e.context.senderAccountId===sender.accountId&&e.context.recipientAccountId===recipient.accountId&&sender.origin===recipient.origin&&unb64(e.enc).length===65&&unb64(e.ciphertext).length<=65552&&await verifyStatement(sender,envelopeStatement(e),e.signature);
 }catch{return false;}}
export async function openEnvelope(recipient:Identity,sender:PublicIdentity,pinnedFingerprint:string,e:Envelope,expected:Pick<Context,'purpose'|'resourceId'>&{allowExpired?:boolean}){
 if(sender.fingerprint!==pinnedFingerprint||!await verifyEnvelope(e,sender,recipient.public)||e.context.purpose!==expected.purpose||e.context.resourceId!==expected.resourceId||(!expected.allowExpired&&Date.parse(e.context.expiresAt)<=Date.now()))throw new Error('Envelope rejected');
 return openChallenge(recipient,e,envelopeInfo(e));
}
export type Capsule={v:1;id:string;chunkSize:number;size:number;prefix:string;metadata:string;chunks:string[]};
function capsuleAAD(c:Capsule,index:number){return encode(['arcana-capsule/v1',c.id,c.chunkSize,c.size,c.prefix,c.chunks.length,index]);}
function nonce(c:Capsule,index:number){const n=new Uint8Array(12);n.set(unb64(c.prefix));new DataView(n.buffer).setUint32(8,index);return n;}
export function validateCapsule(c:Capsule){
 if(c.v!==1||!uuid(c.id)||!Number.isSafeInteger(c.chunkSize)||c.chunkSize<65536||c.chunkSize>1048576||!Number.isSafeInteger(c.size)||c.size<1||c.size>16*1024*1024||unb64(c.prefix).length!==8||c.chunks.length!==Math.ceil(c.size/c.chunkSize)||unb64(c.metadata).length>8192)throw new Error('Invalid capsule');
 for(let i=0;i<c.chunks.length;i++)if(unb64(c.chunks[i]!).length!==Math.min(c.chunkSize,c.size-i*c.chunkSize)+16)throw new Error('Invalid capsule chunk');
}
export async function encryptCapsule(bytes:Uint8Array,metadata:{name:string;mime:string},chunkSize=262144){
 if(metadata.name.length>200||metadata.mime.length>100)throw new Error('Metadata too large');
 const contentKey=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',ab(contentKey),'AES-GCM',false,['encrypt']);
 const capsule:Capsule={v:1,id:crypto.randomUUID(),chunkSize,size:bytes.length,prefix:b64(crypto.getRandomValues(new Uint8Array(8))),metadata:'',chunks:Array.from({length:Math.ceil(bytes.length/chunkSize)},()=> '')};
 if(!Number.isInteger(chunkSize)||chunkSize<65536||chunkSize>1048576||bytes.length<1||bytes.length>16*1024*1024)throw new Error('Capsule bounds');
 const encrypt=async(data:Uint8Array,index:number)=>b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:ab(nonce(capsule,index)),additionalData:ab(capsuleAAD(capsule,index))},key,ab(data))));
 capsule.metadata=await encrypt(encode({...metadata,sha256:await digest(bytes)}),0);
 for(let i=0;i<capsule.chunks.length;i++)capsule.chunks[i]=await encrypt(bytes.subarray(i*chunkSize,(i+1)*chunkSize),i+1);
 validateCapsule(capsule);return {capsule,contentKey};
}
export async function decryptCapsule(capsule:Capsule,contentKey:Uint8Array){
 validateCapsule(capsule);if(contentKey.length!==32)throw new Error('Invalid content key');
 const key=await crypto.subtle.importKey('raw',ab(contentKey),'AES-GCM',false,['decrypt']);
 const decrypt=async(value:string,index:number)=>new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:ab(nonce(capsule,index)),additionalData:ab(capsuleAAD(capsule,index))},key,ab(unb64(value))));
 const metadata=decode(await decrypt(capsule.metadata,0));const bytes=new Uint8Array(capsule.size);for(let i=0;i<capsule.chunks.length;i++)bytes.set(await decrypt(capsule.chunks[i]!,i+1),i*capsule.chunkSize);
 if(metadata.sha256!==await digest(bytes))throw new Error('Plaintext integrity failed');return {bytes,metadata};
}
export async function capsuleKeyEnvelope(sender:Identity,buyer:PublicIdentity,pin:string,listingId:string,capsule:Capsule,contentKey:Uint8Array,expiresAt:string){
 return sealEnvelope(sender,buyer,pin,{origin:sender.public.origin,purpose:'capsule-key',resourceId:listingId,nonce:crypto.randomUUID(),senderAccountId:sender.public.accountId,recipientAccountId:buyer.accountId,expiresAt},encode({capsuleId:capsule.id,ciphertextSha256:await digest(encode(capsule)),contentKey:b64(contentKey)}));
}
export async function openCapsule(recipient:Identity,sender:PublicIdentity,pin:string,listingId:string,capsule:Capsule,envelope:Envelope){
 const payload=decode(await openEnvelope(recipient,sender,pin,envelope,{purpose:'capsule-key',resourceId:listingId,allowExpired:true}));
 if(payload.capsuleId!==capsule.id||payload.ciphertextSha256!==await digest(encode(capsule)))throw new Error('Capsule key binding mismatch');
 return decryptCapsule(capsule,unb64(payload.contentKey));
}
export async function encryptConversation(sender:Identity,buyer:PublicIdentity,seller:PublicIdentity,pins:{buyer:string;seller:string},conversationId:string,payload:{text:string;attachments?:{name:string;bytes:string;sha256:string}[]},expiresAt:string){
 const id=crypto.randomUUID(),plaintext=encode(payload);
 const copy=(recipient:PublicIdentity,pin:string)=>sealEnvelope(sender,recipient,pin,{origin:sender.public.origin,purpose:'message',resourceId:conversationId,nonce:id,senderAccountId:sender.public.accountId,recipientAccountId:recipient.accountId,expiresAt},plaintext);
 return {id,buyer:await copy(buyer,pins.buyer),seller:await copy(seller,pins.seller)};
}
/** Recovery key is random 256-bit material kept offline, never a user password. */
export async function backupIdentity(identity:Identity,recoveryKey:Uint8Array){
 if(recoveryKey.length!==32)throw new Error('256-bit recovery key required');const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=encode({public:identity.public,encryption:await crypto.subtle.exportKey('jwk',identity.encryption.privateKey),signing:await crypto.subtle.exportKey('jwk',identity.signing.privateKey)});
 const key=await crypto.subtle.importKey('raw',ab(recoveryKey),'AES-GCM',false,['encrypt']);return {v:1,iv:b64(iv),ciphertext:b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:ab(iv),additionalData:ab(encode(['arcana-identity-backup/v1']))},key,ab(data))))};
}
export async function restoreIdentity(backup:{v:number;iv:string;ciphertext:string},recoveryKey:Uint8Array):Promise<Identity>{
 if(backup.v!==1||recoveryKey.length!==32||unb64(backup.iv).length!==12)throw new Error('Invalid backup');
 const key=await crypto.subtle.importKey('raw',ab(recoveryKey),'AES-GCM',false,['decrypt']);const data=decode(new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:ab(unb64(backup.iv)),additionalData:ab(encode(['arcana-identity-backup/v1']))},key,ab(unb64(backup.ciphertext)))));
 const encryption={privateKey:await crypto.subtle.importKey('jwk',data.encryption,{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']),publicKey:await suite.kem.deserializePublicKey(ab(unb64(data.public.encryptionKey)))};
 const signing={privateKey:await crypto.subtle.importKey('jwk',data.signing,{name:'ECDSA',namedCurve:'P-256'},true,['sign']),publicKey:await signingPublic(data.public)};
 const identity={public:data.public,encryption,signing};await validatePublicIdentity(data.public);
 if(!await verifyStatement(data.public,'arcana-backup-check',await signStatement(identity,'arcana-backup-check')))throw new Error('Invalid signing backup');
 const probe=await sealChallenge(data.public,te.encode('arcana-backup-check'),'arcana-backup-check');if(td.decode(await openChallenge(identity,probe,'arcana-backup-check'))!=='arcana-backup-check')throw new Error('Invalid encryption backup');return identity;
}

export async function verifyIdentityBinding(identity:PublicIdentity,binding:{statement:string;secret:string;signature:string;previousSignature?:string;previousKeyId?:string},previous?:PublicIdentity){
 try{await validatePublicIdentity(identity);const data=JSON.parse(binding.statement);if(data[0]!=='arcana-registration-challenge/v1'||data[2]!==identity.accountId||data[3]!==identity.origin||data[4]!==identity.fingerprint||data[5]!== (binding.previousKeyId??null))return false;
 const statement=registrationStatement(binding.statement,binding.secret);if(!await verifyStatement(identity,statement,binding.signature))return false;
 if(binding.previousKeyId)return !!previous&&previous.keyId===binding.previousKeyId&&previous.accountId===identity.accountId&&previous.origin===identity.origin&&await verifyStatement(previous,statement,binding.previousSignature??'');
 return data[6]===0; // Reset epochs need a new out-of-band fingerprint decision.
 }catch{return false;}
}

export async function attachment(name:string,bytes:Uint8Array){if(name.length>200||bytes.length>32768)throw new Error('Attachment bounds');return {name,bytes:b64(bytes),sha256:await digest(bytes)};}
export async function openConversation(recipient:Identity,sender:PublicIdentity,pin:string,conversationId:string,envelope:Envelope){
 const payload=decode(await openEnvelope(recipient,sender,pin,envelope,{purpose:'message',resourceId:conversationId}));
 if(typeof payload.text!=='string'||payload.text.length>20000||payload.attachments&&(!Array.isArray(payload.attachments)||payload.attachments.length>8))throw new Error('Invalid message payload');
 for(const a of payload.attachments??[])if(typeof a.name!=='string'||a.name.length>200||typeof a.bytes!=='string'||a.sha256!==await digest(unb64(a.bytes)))throw new Error('Attachment integrity failed');return payload;
}
export async function passportPresentation(identity:Identity,passport:{claim:{id:string;audience:string;holderFingerprint:string}},verifierNonce:string){
 if(!/^[A-Za-z0-9_-]{43,128}$/.test(verifierNonce)||passport.claim.holderFingerprint!==identity.public.fingerprint)throw new Error('Invalid holder challenge');
 const statement=JSON.stringify(['arcana-passport-presentation/v1',passport.claim.id,passport.claim.audience,verifierNonce]);return {identity:identity.public,nonce:verifierNonce,signature:await signStatement(identity,statement)};
}
/** Verify the issuer signature/expiry/revocation separately. The relying party must
 * generate, expire and consume its own nonce; an issuer proof is not holder possession. */
export async function verifyPassportPresentation(passport:{claim:{id:string;audience:string;holderFingerprint:string}},expectedNonce:string,presentation:{identity:PublicIdentity;nonce:string;signature:string}){
 try{await validatePublicIdentity(presentation.identity);return expectedNonce===presentation.nonce&&/^[A-Za-z0-9_-]{43,128}$/.test(expectedNonce)&&passport.claim.holderFingerprint===presentation.identity.fingerprint&&await verifyStatement(presentation.identity,JSON.stringify(['arcana-passport-presentation/v1',passport.claim.id,passport.claim.audience,expectedNonce]),presentation.signature);}catch{return false;}
}

export type TradeClaim={version:2;id:string;keyId:string;kind:'completed_acquisition'|'seller_deliveries';issuedAt:string;expiresAt:string;audience:string;holderFingerprint:string;minimum:number;disclosedCount?:number};
export function passportSignatureBytes(c:TradeClaim){return encode(['arcana-trade-passport/v2',c.version,c.id,c.keyId,c.kind,c.issuedAt,c.expiresAt,c.audience,c.holderFingerprint,c.minimum,c.disclosedCount??null]);}
/** Offline signature, key-ID, audience and time validation only. A true result
 * does not check registry revocation or prove the presenter holds the subject key. */
export async function verifyPassportSignature(raw:unknown,publicPem:string,audience:string,now=Date.now()){
 try{
  const p=raw as {algorithm:string;claim:TradeClaim;signature:string},c=p.claim;
  if(!p||Object.keys(p).some(k=>!['algorithm','claim','signature'].includes(k))||p.algorithm!=='Ed25519'||!c||Object.keys(c).some(k=>!['version','id','keyId','kind','issuedAt','expiresAt','audience','holderFingerprint','minimum','disclosedCount'].includes(k))||c.version!==2||!uuid(c.id)||!['completed_acquisition','seller_deliveries'].includes(c.kind)||!/^[a-f0-9]{64}$/.test(c.keyId)||!/^[a-f0-9]{64}$/.test(c.holderFingerprint)||c.audience!==audience||!Number.isSafeInteger(c.minimum)||c.minimum<1||c.minimum>1000000||c.disclosedCount!==undefined&&(!Number.isSafeInteger(c.disclosedCount)||c.disclosedCount<c.minimum)||!Number.isFinite(Date.parse(c.issuedAt))||!Number.isFinite(Date.parse(c.expiresAt))||Date.parse(c.issuedAt)>now+60000||Date.parse(c.expiresAt)<=now||Date.parse(c.expiresAt)<=Date.parse(c.issuedAt)||unb64(p.signature).length!==64||!publicPem.startsWith('-----BEGIN PUBLIC KEY-----')||publicPem.includes('PRIVATE KEY'))return false;
  const body=publicPem.replace('-----BEGIN PUBLIC KEY-----','').replace('-----END PUBLIC KEY-----','').replace(/\s/g,'');const der=Uint8Array.from(atob(body),c=>c.charCodeAt(0));
  if(await digest(der)!==c.keyId)return false;const key=await crypto.subtle.importKey('spki',ab(der),{name:'Ed25519'},false,['verify']);return await crypto.subtle.verify('Ed25519',key,ab(unb64(p.signature)),ab(passportSignatureBytes(c)));
 }catch{return false;}
}
