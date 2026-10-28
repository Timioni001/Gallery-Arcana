import {z} from 'zod';
import {pool} from '../db.ts';
import {conflict,notFound,bad} from '../lib/errors.ts';

const encoded=z.string().min(16).max(500_000).regex(/^[A-Za-z0-9_-]+$/);
const encrypted=z.object({iv:z.string().length(16).regex(/^[A-Za-z0-9_-]+$/),ciphertext:encoded}).strict();
export const backupWrite=z.object({expectedRevision:z.number().int().min(0).max(2147483646),backup:z.object({
  kind:z.literal('arcana-vault-backup/v1'),accountId:z.string().uuid(),alias:z.string().min(3).max(24),createdAt:z.iso.datetime(),
  identity:encrypted.extend({v:z.literal(1)}).strict(),capsules:encrypted,
}).strict()}).strict();
export async function readBackup(accountId:string){
  const row=(await pool.query('SELECT backup,revision,updated_at FROM account_vault_backups WHERE account_id=$1',[accountId])).rows[0];
  return row??{backup:null,revision:0,updated_at:null};
}
export async function writeBackup(accountId:string,input:unknown){
  const {backup,expectedRevision}=backupWrite.parse(input);
  if(backup.accountId!==accountId)throw bad('Backup belongs to another account');
  if(Buffer.byteLength(JSON.stringify(backup))>512*1024)throw bad('Backup is too large');
  const result=expectedRevision===0
    ?await pool.query('INSERT INTO account_vault_backups(account_id,revision,backup) VALUES($1,1,$2) ON CONFLICT DO NOTHING RETURNING revision',[accountId,backup])
    :await pool.query('UPDATE account_vault_backups SET backup=$2,revision=revision+1,updated_at=now() WHERE account_id=$1 AND revision=$3 RETURNING revision',[accountId,backup,expectedRevision]);
  if(!result.rowCount)throw conflict('Backup changed. Reload before replacing it.');
  return {revision:result.rows[0].revision};
}
export async function deleteBackup(accountId:string,revision:number){
  const result=await pool.query('DELETE FROM account_vault_backups WHERE account_id=$1 AND revision=$2',[accountId,revision]);
  if(!result.rowCount)throw notFound('Backup no longer exists at this revision');
  return {ok:true};
}
