import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {Resolver} from 'node:dns/promises';
import {domainToASCII} from 'node:url';
import {getAddress,verifyMessage} from 'ethers';
import {fetch,EnvHttpProxyAgent} from 'undici';
import {pool,tx} from '../db.ts';
import {config} from '../config.ts';
import {bad,conflict,notFound,HttpError} from '../lib/errors.ts';
type Kind='dns'|'github'|'evm';
export function controlSubject(kind:Kind,input:string,chainId=1){
 if(kind==='dns'){
  const domain=domainToASCII(input.toLowerCase().replace(/\.$/,''));const labels=domain.split('.');
  if(domain.length>253||labels.length<2||labels.some(l=>! /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))||/(?:^|\.)(localhost|local|internal)$/.test(domain)||/^\d+(?:\.\d+){3}$/.test(domain))throw bad('A public DNS domain is required');return domain;
 }
 if(kind==='github'){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]{1,100}$/.test(input)||['.','..'].includes(input.split('/')[1]!))throw bad('Use owner/repository');return input.toLowerCase();
 }
 if(![1,137,42161,8453].includes(chainId)||!/^0x[a-fA-F0-9]{40}$/.test(input))throw bad('Supported EVM chain/address required');
 try{return `${chainId}:${getAddress(input)}`;}catch{throw bad('Invalid EVM address');}
}
export async function createControlChallenge(accountId:string,kind:Kind,subject:string,chainId=1){
 const normalized=controlSubject(kind,subject,chainId),id=randomUUID(),expiresAt=(await pool.query("SELECT clock_timestamp()+interval '10 minutes' AS time")).rows[0].time.toISOString();
 const statement=['Gallery Arcana asset-control/v1 — control only; no transfer authorization',`Origin: ${config.publicOrigin}`,`Account: ${accountId}`,`Kind: ${kind}`,`Subject: ${normalized}`,`Challenge: ${id}`,`Nonce: ${randomBytes(32).toString('base64url')}`,`Expires: ${expiresAt}`].join('\n');
 const marker='arcana-control-v1='+createHash('sha256').update(statement).digest('hex');
 await pool.query('INSERT INTO asset_control_challenges(id,account_id,kind,subject,statement,expected_marker,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,accountId,kind,normalized,statement,marker,expiresAt]);
 return {challengeId:id,kind,subject:normalized,statement,expiresAt,...(kind==='dns'?{record:`_arcana-control.${normalized}`,value:marker}:kind==='github'?{path:'.well-known/arcana-control.txt',branch:'main',value:marker}:{signatureStandard:'EIP-191 personal_sign'})};
}
export type ControlNetwork={txt:(name:string)=>Promise<string[][]>;github:(repo:string)=>Promise<string>};
const dispatcher=new EnvHttpProxyAgent();
const network:ControlNetwork={
 txt:async name=>new Resolver({timeout:3000,tries:1}).resolveTxt(name),
 github:async repo=>{
  const [owner,name]=repo.split('/');const response=await fetch(`https://raw.githubusercontent.com/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}/refs/heads/main/.well-known/arcana-control.txt`,{dispatcher,redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok){await response.body?.cancel();throw new Error('Unavailable challenge');}
  const reader=response.body?.getReader();if(!reader)throw new Error('Missing response');const chunks:Buffer[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();throw new Error('Challenge too large');}chunks.push(Buffer.from(value));}}finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
 }
};
export async function verifyControl(accountId:string,id:string,signature?:string,transport:ControlNetwork=network){
 const record=(await pool.query('UPDATE asset_control_challenges SET attempts=attempts+1 WHERE id=$1 AND account_id=$2 AND expires_at>now() AND consumed_at IS NULL AND attempts<5 RETURNING *',[id,accountId])).rows[0];if(!record)throw notFound();
 let matches=false;
 if(record.kind==='evm'){
  try{matches=!!signature&&/^0x[a-fA-F0-9]{130}$/.test(signature)&&verifyMessage(record.statement,signature)===record.subject.split(':')[1];}catch{}
 }else{
  try{matches=record.kind==='dns'?(await transport.txt('_arcana-control.'+record.subject)).slice(0,100).some(row=>row.join('')===record.expected_marker):(await transport.github(record.subject)).trim()===record.expected_marker;}
  catch{throw new HttpError(503,'Control observation unavailable');}
 }
 if(!matches)throw conflict('Control challenge not demonstrated');
 return tx(async c=>{
  const consumed=await c.query('UPDATE asset_control_challenges SET consumed_at=clock_timestamp() WHERE id=$1 AND account_id=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp() RETURNING id',[id,accountId]);if(!consumed.rowCount)throw conflict('Challenge expired or consumed');
  const row=(await c.query(`INSERT INTO asset_control_verifications(challenge_id,account_id,kind,subject,evidence_hash,expires_at)
   VALUES($1,$2,$3,$4,$5,clock_timestamp()+interval '24 hours') RETURNING id,kind,subject,verified_at,expires_at`,[id,accountId,record.kind,record.subject,createHash('sha256').update(record.statement).digest('hex')])).rows[0];return {...row,scope:'control-at-observation-time',legalOwnership:false};
 });
}
export async function controlVerifications(accountId:string){return (await pool.query('SELECT id,kind,subject,verified_at,expires_at FROM asset_control_verifications WHERE account_id=$1 ORDER BY verified_at DESC LIMIT 100',[accountId])).rows;}
