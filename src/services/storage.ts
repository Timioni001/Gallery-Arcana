import {createReadStream,mkdirSync,writeFileSync,readFileSync,openSync,closeSync,fstatSync,realpathSync,constants,unlinkSync} from 'node:fs';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {resolve,sep} from 'node:path';
import sharp from 'sharp';
import {config} from '../config.ts';
import {bad} from '../lib/errors.ts';
import {detectPreviewMime} from '../lib/assetValidation.ts';
const root=resolve(config.storageDir);
function safe(kind:'previews'|'private',key:string){
  const pattern=kind==='private'?/^[a-f0-9]{32}\.bin$/:/^[a-f0-9]{32}\.(png|jpg|webp)$/;
  if(!pattern.test(key))throw bad('Invalid storage key');
  const base=resolve(root,kind),result=resolve(base,key);
  if(!result.startsWith(base+sep))throw bad('Invalid storage key');
  // Both directories must be real, dedicated directories; never traverse a symlink.
  if(realpathSync(root)!==root||realpathSync(base)!==base)throw bad('Invalid storage directory');
  return result;
}
export function validateAssetKey(){
  const hex=process.env.ASSET_ENCRYPTION_KEY??'';
  if(!/^[a-f0-9]{64}$/i.test(hex))throw new Error('ASSET_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
  return Buffer.from(hex,'hex');
}
/** Decode and re-encode previews: signatures alone cannot reject malformed/polyglot images or strip metadata. */
export async function sanitizePreview(content:Buffer,claimedType:string){
  if(!content.length||content.length>5*1024*1024)throw bad('Preview must be between 1 byte and 5 MB');
  const mime=detectPreviewMime(content);
  if(mime!==claimedType)throw bad('Image type does not match the uploaded file');
  try{
    const image=sharp(content,{limitInputPixels:25_000_000,failOn:'warning',animated:false});
    const metadata=await image.metadata();
    if(metadata.pages&&metadata.pages>1)throw new Error('Animation unsupported');
    const clean=await image.rotate().toFormat(mime==='image/png'?'png':mime==='image/jpeg'?'jpeg':'webp').toBuffer();
    if(clean.length>5*1024*1024)throw new Error('Image too large');
    return clean;
  }catch{throw bad('Preview must be a valid PNG, JPEG or WebP image');}
}
/** AES-GCM protects at rest; the operator still possesses the decryption key. */
export function storeAsset(kind:'previews'|'private',content:Buffer,contentType:string){
  if(!content.length)throw bad('File is empty');
  if(content.length>(kind==='previews'?5:25)*1024*1024)throw bad('File exceeds upload limit');
  const detected=kind==='previews'?detectPreviewMime(content):null;
  if(kind==='previews'&&detected!==contentType)throw bad('Image type does not match the uploaded file');
  const ext=kind==='private'?'bin':detected==='image/png'?'png':detected==='image/jpeg'?'jpg':'webp';
  const key=`${randomBytes(16).toString('hex')}.${ext}`;
  mkdirSync(resolve(root,kind),{recursive:true,mode:0o700});
  let data=content;
  if(kind==='private'){
    const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',validateAssetKey(),iv);
    cipher.setAAD(Buffer.from(key));
    const encrypted=Buffer.concat([cipher.update(content),cipher.final()]);
    data=Buffer.concat([Buffer.from('ARC1'),iv,cipher.getAuthTag(),encrypted]);
  }
  const path=safe(kind,key),fd=openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{writeFileSync(fd,data);}catch(error){unlinkSync(path);throw error;}finally{closeSync(fd);}
  return {key};
}
function descriptor(kind:'previews'|'private',key:string){
  let fd:number;
  try{fd=openSync(safe(kind,key),constants.O_RDONLY|constants.O_NOFOLLOW);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  if(!fstatSync(fd).isFile()){closeSync(fd);throw bad('Invalid asset');}return fd;
}
export function removeAsset(kind:'previews'|'private',key:string){unlinkSync(safe(kind,key));}
export function previewStream(key:string){const fd=descriptor('previews',key);return fd===null?null:createReadStream('',{fd,autoClose:true});}
export function privateBytes(key:string){
  const fd=descriptor('private',key);if(fd===null)return null;
  let raw:Buffer;try{raw=readFileSync(fd);}finally{closeSync(fd);}
  const v1=raw.subarray(0,4).equals(Buffer.from('ARC1'));if(v1)raw=raw.subarray(4);
  if(raw.length<28)throw new Error('Corrupt encrypted file');
  const decipher=createDecipheriv('aes-256-gcm',validateAssetKey(),raw.subarray(0,12));
  if(v1)decipher.setAAD(Buffer.from(key)); // Existing archive-format files remain decryptable.
  decipher.setAuthTag(raw.subarray(12,28));
  return Buffer.concat([decipher.update(raw.subarray(28)),decipher.final()]);
}
