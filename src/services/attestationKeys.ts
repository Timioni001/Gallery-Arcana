import {openSync,closeSync,fstatSync,readFileSync,constants} from 'node:fs';
import {createPrivateKey,createPublicKey} from 'node:crypto';

function keyFile(path:string|undefined,secret:boolean){
  if(!path)throw new Error('Attestation key configuration required');
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const info=fstatSync(fd);
    if(!info.isFile()||info.size>16384||(secret&&(info.mode&0o077)!==0))throw new Error('Unsafe attestation key file');
    return readFileSync(fd,'utf8');
  }finally{closeSync(fd);}
}
export function attestationKeys(){
  const privatePem=keyFile(process.env.ATTESTATION_SIGNING_KEY_FILE,true),publicPem=publicVerificationKey();
  const privateKey=createPrivateKey(privatePem),publicKey=createPublicKey(publicPem);
  if(privateKey.asymmetricKeyType!=='ed25519'||publicKey.asymmetricKeyType!=='ed25519'||
    !createPublicKey(privateKey).export({type:'spki',format:'der'}).equals(publicKey.export({type:'spki',format:'der'})))throw new Error('Attestation key mismatch');
  return {privatePem,publicPem:publicKey.export({type:'spki',format:'pem'}).toString()};
}
export function publicVerificationKey(){
  const pem=keyFile(process.env.ATTESTATION_VERIFY_KEY_FILE,false);
  if(!pem.startsWith('-----BEGIN PUBLIC KEY-----')||pem.includes('PRIVATE KEY'))throw new Error('Public verification key required');
  const key=createPublicKey(pem);if(key.asymmetricKeyType!=='ed25519')throw new Error('Ed25519 key required');
  return key.export({type:'spki',format:'pem'}).toString();
}
