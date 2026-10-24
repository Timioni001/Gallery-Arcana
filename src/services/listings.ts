import {z} from 'zod';
import {pool,tx} from '../db.ts';
import type {Db} from '../db.ts';
import {bad,conflict,forbidden,notFound} from '../lib/errors.ts';

const listingFields={
  title:z.string().trim().min(3).max(120),description:z.string().max(2500),
  category:z.enum(['digital','collectible','onchain','other']),
  visibility:z.enum(['public','unlisted']),
  delivery:z.enum(['download','manual','external']),
  previewKey:z.string().regex(/^[a-f0-9]{32}\.(png|jpg|webp)$/).optional(),
  fileKey:z.string().regex(/^[a-f0-9]{32}\.bin$/).optional(),
  assetReference:z.string().max(400).optional(),
  priceUsdCents:z.number().int().min(50).max(100_000_000),
};
export const listingSchema=z.object({...listingFields,description:listingFields.description.default(''),category:listingFields.category.default('digital'),visibility:listingFields.visibility.default('public'),delivery:listingFields.delivery.default('download')});
export const listingPatchSchema=z.object(listingFields).partial().extend({expectedRevision:z.number().int().positive()}).strict();
type ListingInput=z.infer<typeof listingSchema>;
async function assets(db:Db,sellerId:string,input:ListingInput){
  if(input.delivery==='download'&&!input.fileKey)throw bad('Upload a file before publishing a downloadable product');
  let fileName:string|null=null,fileSha256:string|null=null,cryptoMode='server',capsuleId:string|null=null;
  for(const [key,kind] of [[input.previewKey,'previews'],[input.fileKey,'private']]){
    if(!key)continue;
    const {rows}=await db.query('SELECT original_name,file_sha256,crypto_mode,capsule_id FROM uploaded_assets WHERE key=$1 AND owner_id=$2 AND kind=$3',[key,sellerId,kind]);
    if(!rows[0])throw forbidden('Upload this asset from your own account first');
    if(kind==='private'){fileName=rows[0].original_name;fileSha256=rows[0].file_sha256;cryptoMode=rows[0].crypto_mode;capsuleId=rows[0].capsule_id;}
  }
  return {fileName,fileSha256,cryptoMode,capsuleId};
}
export async function createListing(sellerId:string,input:ListingInput){
  return tx(async c=>{
    const {fileName,fileSha256,cryptoMode,capsuleId}=await assets(c,sellerId,input);
    if(!(await c.query('SELECT payout_address FROM accounts WHERE id=$1',[sellerId])).rows[0]?.payout_address)
      throw forbidden('Set your Zcash payout address before listing');
    const {rows}=await c.query(`INSERT INTO listings(seller_id,title,description,category,visibility,delivery,preview_key,file_key,file_name,asset_reference,price_usd_cents,file_sha256,crypto_mode,capsule_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,revision`,
      [sellerId,input.title,input.description,input.category,input.visibility,input.delivery,input.previewKey??null,input.fileKey??null,fileName,input.assetReference??null,input.priceUsdCents,fileSha256,cryptoMode,capsuleId]);
    return {listingId:rows[0].id,revision:rows[0].revision};
  });
}
export async function editListing(sellerId:string,id:string,patch:z.infer<typeof listingPatchSchema>){
  return tx(async c=>{
    const row=(await c.query('SELECT * FROM listings WHERE id=$1 AND seller_id=$2 FOR UPDATE',[id,sellerId])).rows[0];
    if(!row)throw notFound();
    if(!['live','paused'].includes(row.status))throw conflict('Reserved or sold listings cannot be edited');
    if(row.revision!==patch.expectedRevision)throw conflict('Listing changed; reload before editing');
    const input=listingSchema.parse({title:row.title,description:row.description,category:row.category,visibility:row.visibility,delivery:row.delivery,
      previewKey:row.preview_key??undefined,fileKey:row.file_key??undefined,assetReference:row.asset_reference??undefined,priceUsdCents:row.price_usd_cents,...patch});
    const {fileName,fileSha256,cryptoMode,capsuleId}=await assets(c,sellerId,input);
    const {rows}=await c.query(`UPDATE listings SET title=$2,description=$3,category=$4,visibility=$5,delivery=$6,preview_key=$7,
      file_key=$8,file_name=$9,asset_reference=$10,price_usd_cents=$11,file_sha256=$12,crypto_mode=$13,capsule_id=$14,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING id,revision`,
      [id,input.title,input.description,input.category,input.visibility,input.delivery,input.previewKey??null,input.fileKey??null,fileName,input.assetReference??null,input.priceUsdCents,fileSha256,cryptoMode,capsuleId]);
    await c.query("UPDATE offers SET status='declined',revision=revision+1,updated_at=now() WHERE listing_id=$1 AND status IN ('open','countered','accepted')",[id]);
    return rows[0];
  });
}
const publicFields=`l.id,l.title,l.description,l.category,l.visibility,l.delivery,l.preview_key,l.asset_reference,
  l.price_usd_cents,l.crypto_mode,l.status,l.created_at,l.revision,a.alias AS seller_alias`;
export async function browse(filters:{category?:string;query?:string;limit?:number;offset?:number}){
  return (await pool.query(`SELECT ${publicFields} FROM listings l JOIN accounts a ON a.id=l.seller_id
    WHERE l.status='live' AND l.visibility='public' AND NOT l.invitation_only AND ($1::text IS NULL OR l.category=$1)
    AND ($2::text IS NULL OR position(lower($2) in lower(l.title))>0)
    ORDER BY l.created_at DESC,l.id DESC LIMIT $3 OFFSET $4`,[filters.category??null,filters.query??null,filters.limit??40,filters.offset??0])).rows;
}
export async function getListing(id:string,accountId?:string){
  const row=(await pool.query(`SELECT ${publicFields},l.invitation_only,(l.seller_id=$2::uuid) AS is_seller FROM listings l JOIN accounts a ON a.id=l.seller_id WHERE l.id=$1`,[id,accountId??null])).rows[0];
  if(!row||((row.status==='paused'||row.invitation_only)&&!row.is_seller))throw notFound();
  const {invitation_only,...visible}=row;return visible;
}
export async function mine(accountId:string){
  return (await pool.query(`SELECT id,title,description,category,visibility,delivery,price_usd_cents,status,preview_key,created_at,revision
    FROM listings WHERE seller_id=$1 ORDER BY created_at DESC,id DESC LIMIT 80`,[accountId])).rows;
}
export async function setListingStatus(sellerId:string,id:string,status:'live'|'paused'){
  const {rows}=await pool.query(`UPDATE listings SET status=$3,updated_at=now() WHERE id=$1 AND seller_id=$2 AND status IN ('live','paused') RETURNING id,status`,[id,sellerId,status]);
  if(!rows[0])throw notFound('Listing not available for update');
  return rows[0];
}
