import {createReadStream,existsSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {resolve,sep} from 'node:path';
import {config} from '../config.ts';
import {bad} from '../lib/errors.ts';
import {detectPreviewMime} from '../lib/assetValidation.ts';
const root=resolve(config.storageDir);
function safe(kind:'previews'|'private',key:string){
  const base=resolve(root,kind),result=resolve(base,key);
  if(!result.startsWith(base+sep)) throw bad('Invalid storage key');
  return result;
}
function assetKey(){
  const hex=process.env.ASSET_ENCRYPTION_KEY??'';
  if(!/^[a-f0-9]{64}$/i.test(hex))throw new Error('ASSET_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
  return Buffer.from(hex,'hex');
}
/** Encrypt private uploads on disk (AES-256-GCM); server still has the decryption key. */
export function storeAsset(kind:'previews'|'private',content:Buffer,contentType:string){
  if(!content.length)throw bad('File is empty');
  if(kind==='previews'&&content.length>5*1024*1024)throw bad('Preview exceeds 5 MB');
  if(kind==='private'&&content.length>25*1024*1024)throw bad('Digital file exceeds 25 MB');
  const detected=kind==='previews'?detectPreviewMime(content):null;
  if(kind==='previews' && detected!==contentType) throw bad('Image type does not match the uploaded file');
  const ext=kind==='private'?'bin':detected==='image/png'?'png':detected==='image/jpeg'?'jpg':'webp';
  const key=`${randomBytes(16).toString('hex')}.${ext}`;
  mkdirSync(resolve(root,kind),{recursive:true,mode:0o700});
  let data=content;
  if(kind==='private') {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',assetKey(),iv);
    const encrypted=Buffer.concat([cipher.update(content),cipher.final()]);
    data=Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
  }
  writeFileSync(safe(kind,key),data,{flag:'wx',mode:0o600});
  return {key};
}
export function previewStream(key:string){const file=safe('previews',key);return existsSync(file)?createReadStream(file):null;}
export function privateBytes(key:string){
  const file=safe('private',key);if(!existsSync(file))return null;
  const raw=readFileSync(file);if(raw.length<28)throw new Error('Corrupt encrypted file');
  const decipher=createDecipheriv('aes-256-gcm',assetKey(),raw.subarray(0,12));
  decipher.setAuthTag(raw.subarray(12,28));
  return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]);
}
