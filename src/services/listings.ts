import { z } from 'zod';
import { pool } from '../db.ts';
import { bad, forbidden, notFound } from '../lib/errors.ts';

export const listingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().max(2500).default(''),
  category: z.enum(['digital','collectible','onchain','other']).default('digital'),
  visibility: z.enum(['public','unlisted']).default('public'),
  delivery: z.enum(['download','manual','external']).default('download'),
  previewKey: z.string().regex(/^[a-f0-9]{32}\.(png|jpg|webp)$/).optional(),
  fileKey: z.string().regex(/^[a-f0-9]{32}\.bin$/).optional(),
  assetReference: z.string().max(400).optional(),
  priceUsdCents: z.number().int().min(50).max(100_000_000),
});

export async function createListing(sellerId: string, input: z.infer<typeof listingSchema>) {
  if (input.delivery === 'download' && !input.fileKey) throw bad('Upload a file before publishing a downloadable product');
  const keys: [string | undefined,string][] = [[input.previewKey,'previews'],[input.fileKey,'private']];
  for(const [key,kind] of keys){
    if(!key)continue;
    const uploaded=await pool.query('SELECT 1 FROM uploaded_assets WHERE key=$1 AND owner_id=$2 AND kind=$3',[key,sellerId,kind]);
    if(!uploaded.rows[0])throw forbidden('Upload this asset from your own account first');
  }
  let fileName: string|null=null;
  if(input.fileKey){const file=await pool.query('SELECT original_name FROM uploaded_assets WHERE key=$1',[input.fileKey]); fileName=file.rows[0]?.original_name??null;}
  const { rows: account } = await pool.query('SELECT payout_address FROM accounts WHERE id=$1', [sellerId]);
  if (!account[0]?.payout_address) throw forbidden('Set your Zcash payout address before listing');
  const { rows } = await pool.query(`INSERT INTO listings
    (seller_id,title,description,category,visibility,delivery,preview_key,file_key,file_name,asset_reference,price_usd_cents)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [sellerId,input.title,input.description,input.category,input.visibility,input.delivery,input.previewKey??null,
      input.fileKey??null,fileName,input.assetReference??null,input.priceUsdCents]);
  return { listingId: rows[0].id };
}

const publicFields = `l.id,l.title,l.description,l.category,l.visibility,l.delivery,l.preview_key,l.asset_reference,
  l.price_usd_cents,l.status,l.created_at,a.alias AS seller_alias`;
export async function browse(filters: { category?: string; query?: string }) {
  const { rows } = await pool.query(`SELECT ${publicFields} FROM listings l JOIN accounts a ON a.id=l.seller_id
    WHERE l.status='live' AND l.visibility='public'
      AND ($1::text IS NULL OR l.category=$1)
      AND ($2::text IS NULL OR l.title ILIKE '%' || $2 || '%')
    ORDER BY l.created_at DESC LIMIT 80`, [filters.category??null,filters.query??null]);
  return rows;
}
export async function getListing(id: string, accountId?: string) {
  const { rows } = await pool.query(`SELECT ${publicFields}, (l.seller_id=$2::uuid) AS is_seller
    FROM listings l JOIN accounts a ON a.id=l.seller_id WHERE l.id=$1`, [id,accountId??null]);
  if (!rows[0]) throw notFound();
  if (rows[0].status === 'paused' && !rows[0].is_seller) throw notFound();
  // Unlisted URLs are deliberately capability-like, not advertised as strong access control.
  return rows[0];
}
export async function mine(accountId: string) {
  const { rows } = await pool.query(`SELECT id,title,category,visibility,delivery,price_usd_cents,status,
    preview_key,created_at FROM listings WHERE seller_id=$1 ORDER BY created_at DESC LIMIT 80`, [accountId]);
  return rows;
}
export async function setListingStatus(sellerId: string, id: string, status: 'live'|'paused') {
  const { rows } = await pool.query(`UPDATE listings SET status=$3, updated_at=now()
    WHERE id=$1 AND seller_id=$2 AND status IN ('live','paused') RETURNING id,status`, [id,sellerId,status]);
  if (!rows[0]) throw notFound('Listing not available for update');
  return rows[0];
}
