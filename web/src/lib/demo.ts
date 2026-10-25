import type { Listing } from './api'

// Shown only when the API is unreachable, and always labelled as a preview.
const t = (d: number) => new Date(Date.UTC(2026, 9, 24 - d)).toISOString()
const base = { description: null, visibility: 'public', delivery: 'download', preview_key: null, asset_reference: null, status: 'live', revision: 1 } as const
export const demoListings: Listing[] = [
  { ...base, id: 'demo-1', title: 'Glacier Study No. 4', category: 'digital', price_usd_cents: 42000, created_at: t(1), seller_alias: 'halden', crypto_mode: 'capsule-v1', description: 'Layered generative study of ice shelf fractures, delivered as a 12k master in an encrypted capsule.' },
  { ...base, id: 'demo-2', title: 'Night Index — type specimen', category: 'digital', price_usd_cents: 8900, created_at: t(2), seller_alias: 'orrery', description: 'Variable display face with 340 glyphs, OTF/WOFF2 and a commercial licence.' },
  { ...base, id: 'demo-3', title: 'Unopened 1999 holo, graded 9', category: 'collectible', delivery: 'manual', price_usd_cents: 186000, created_at: t(3), seller_alias: 'cardvault', description: 'Hand-delivered. Grading slab and provenance documents shared with the buyer after funding.' },
  { ...base, id: 'demo-4', title: 'arcana.eth — wallet transfer', category: 'onchain', delivery: 'external', price_usd_cents: 250000, created_at: t(4), seller_alias: 'meridian', description: 'Asset-control verified via signed message. Transfer coordinated after escrow funding.' },
  { ...base, id: 'demo-5', title: 'Field recordings: Lofoten', category: 'digital', price_usd_cents: 3600, created_at: t(5), seller_alias: 'sund', crypto_mode: 'capsule-v1', description: '2 hours of 96kHz ambisonic sea and wind recordings.' },
  { ...base, id: 'demo-6', title: 'Monolith UI kit', category: 'digital', price_usd_cents: 12900, created_at: t(6), seller_alias: 'kiln', description: 'Dark interface system — 180 components, tokens, Figma source.' },
  { ...base, id: 'demo-7', title: 'Private repo: orbital sim', category: 'other', delivery: 'external', price_usd_cents: 64000, created_at: t(7), seller_alias: 'lagrange', description: 'GitHub control verified. Repository transfer after acceptance.' },
  { ...base, id: 'demo-8', title: 'Cyanotype series (5 prints)', category: 'collectible', delivery: 'manual', price_usd_cents: 72000, created_at: t(8), seller_alias: 'blueprint', description: 'Signed, numbered, shipped flat. Scans included as a capsule.' },
]
