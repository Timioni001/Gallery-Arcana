// Demo-only backend that runs entirely in the visitor's browser (VITE_DEMO=1).
// It answers the same /api contract as the real server, persists to IndexedDB,
// and simulates sample sellers, payments and a dispute reviewer. All client
// cryptography (capsules, sealed keys, encrypted chat) is the real SDK.
import * as sdk from '@arcana/client-crypto'
import { FRAGMENT_COUNT, fragment, fragmentDataUrl } from '@/lib/fragments'

type Json = Record<string, unknown>
type Account = { id: string; alias: string; salt: string; pass: string; payout: string | null; epoch: number; sim?: boolean }
type IdentityRec = { account_id: string; public_identity: sdk.PublicIdentity; epoch: number; revision: number; created_at: string; revoked_at: string | null }
type Asset = { key: string; owner: string; kind: 'previews' | 'private'; name: string; sha256: string; bytes?: Uint8Array; dataUrl?: string; crypto_mode: string; capsule_id?: string }
type Listing = { id: string; seller_id: string; title: string; description: string | null; category: string; visibility: string; delivery: string; preview_key: string | null; file_key: string | null; price_usd_cents: number; crypto_mode: string; status: string; created_at: string; revision: number; invitation_only: boolean }
type Offer = { id: string; listing_id: string; buyer_id: string; amount_usd_cents: number; counter_usd_cents: number | null; status: string; created_at: string; revision: number; invitation_id?: string }
type Envelope = { listing_id: string; buyer_id: string; listing_revision: number; recipient_key_id: string; sender_key_id: string; envelope: sdk.Envelope; expires_at: string }
type Order = { id: string; listing_id: string; buyer_id: string; title: string; price_usd_cents: number; status: string; created_at: string; receipt: string; payment: Json; amount_zat: string; funded_at: string | null; release_after?: string | null; dispute_due_at?: string | null; delivery_confirmed_at: string | null; disputed_at: string | null; file_sha256: string | null; crypto_mode: string; envelope: sdk.Envelope | null; proof: Json | null; fee_bps: number; dispute_reason?: string }
type Conversation = { id: string; listing_id: string; buyer_id: string; seller_id: string; buyer_key_id: string; seller_key_id: string; expires_at: string; created_at: string; sequence: number }
type Message = { id: string; conversation_id: string; sender_id: string; sequence: number; buyer_envelope: sdk.Envelope; seller_envelope: sdk.Envelope; created_at: string }
type State = {
  v: 2; session: string | null; accounts: Account[]; identities: IdentityRec[]; assets: Asset[]; listings: Listing[]; offers: Offer[]; envelopes: Envelope[]
  orders: Order[]; conversations: Conversation[]; messages: Message[]; invitations: Json[]; passports: Json[]; controls: Json[]; challenges: Json[]; evidence: Json[]
  simKeys: Record<string, sdk.Identity>; contentKeys: Record<string, { capsuleId: string; sha: string; key: string }>; signing?: { pub: JsonWebKey; priv: JsonWebKey }; reviewer?: string
}

const ZEC_USD = 40_000_000n
const AUTOPAY_MS = 6000
const now = () => new Date().toISOString()
const uuid = () => crypto.randomUUID()
const te = new TextEncoder()
let S: State
let origin = ''
let signKey: { priv: CryptoKey; pub: CryptoKey }

// ---------- persistence ----------
function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('arcana-demo-server', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('state')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const req = fn(open.result.transaction('state', mode).objectStore('state'))
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
    }
  })
}
const save = () => idb('readwrite', (s) => s.put(S, 'v2'))
export async function resetDemo() { await idb('readwrite', (s) => s.delete('v2')); indexedDB.deleteDatabase('arcana-vault'); location.reload() }

// ---------- helpers ----------
class Http extends Error { status: number; constructor(status: number, msg: string) { super(msg); this.status = status } }
const fail = (status: number, msg: string): never => { throw new Http(status, msg) }
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
const code = (p: string, n = 16) => `${p}-${(hex(crypto.getRandomValues(new Uint8Array(n))).toUpperCase().match(/.{4}/g) ?? []).join('-')}`
const zatFor = (cents: number) => (BigInt(cents) * 10n ** 12n + ZEC_USD - 1n) / ZEC_USD
const zec = (zat: bigint) => { const w = zat / 100000000n, f = (zat % 100000000n).toString().padStart(8, '0').replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}` }
const passHash = async (salt: string, pass: string) => sdk.digest(te.encode(salt + ':' + pass))
const account = (id: string | null) => S.accounts.find((a) => a.id === id) ?? null
const activeIdentity = (accountId: string) => S.identities.find((i) => i.account_id === accountId && !i.revoked_at) ?? null
const listing = (id: string) => S.listings.find((l) => l.id === id) ?? fail(404, 'Not found')
const alias = (id: string) => account(id)?.alias ?? 'unknown'

async function signClaim(claim: Json) {
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signKey.priv, te.encode(JSON.stringify(claim))))
  return sdk.b64(sig)
}
async function verifyClaim(claim: unknown, signature: unknown) {
  try { return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, signKey.pub, sdk.unb64(String(signature)).slice(), te.encode(JSON.stringify(claim))) } catch { return false }
}

// ---------- seed ----------
const svg = (hue: number, title: string) => te.encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><radialGradient id="g" cx=".35" cy=".3"><stop offset="0" stop-color="hsl(${hue} 60% 75%)"/><stop offset="1" stop-color="hsl(${hue + 20} 40% 12%)"/></radialGradient></defs><rect width="400" height="500" fill="url(#g)"/><path d="M0 500V330l90-110 70 80 80-140 160 170v170Z" fill="#0e0d0b" opacity=".85"/><text x="24" y="470" fill="#f3f1ec" font-family="monospace" font-size="16">${title} — Gallery Arcana demo original</text></svg>`)

async function seed() {
  const t = (d: number) => new Date(Date.now() - d * 86400000).toISOString()
  const mkSeller = async (a: string) => {
    const id = uuid(); S.accounts.push({ id, alias: a, salt: uuid(), pass: 'disabled', payout: 'utest1demoseller' + a.padEnd(20, '0'), epoch: 0, sim: true })
    const identity = await sdk.generateIdentity(id, origin)
    S.identities.push({ account_id: id, public_identity: identity.public, epoch: 0, revision: 1, created_at: t(30), revoked_at: null })
    S.simKeys[id] = identity
    return id
  }
  const halden = await mkSeller('halden'), orrery = await mkSeller('orrery'), kiln = await mkSeller('kiln'), meridian = await mkSeller('meridian'), cardvault = await mkSeller('cardvault')
  const base = { visibility: 'public', preview_key: null, status: 'live', revision: 1, invitation_only: false }
  const plainFile = (owner: string, name: string, text: string): Asset => ({ key: uuid(), owner, kind: 'private', name, sha256: '', bytes: te.encode(text), crypto_mode: 'server' })
  const capsule = async (owner: string, name: string, mime: string, bytes: Uint8Array) => {
    const { capsule: c, contentKey } = await sdk.encryptCapsule(bytes, { name, mime })
    const enc = sdk.encode(c), sha = await sdk.digest(enc), key = uuid()
    S.assets.push({ key, owner, kind: 'private', name: 'arcana-capsule.json', sha256: sha, bytes: enc, crypto_mode: 'capsule-v1', capsule_id: c.id })
    S.contentKeys[key] = { capsuleId: c.id, sha, key: sdk.b64(contentKey) }
    return key
  }
  const files = [plainFile(orrery, 'night-index-specimen.txt', 'Night Index — variable display face. 340 glyphs. Demo file delivered by Gallery Arcana.'), plainFile(kiln, 'monolith-ui-kit.json', JSON.stringify({ kit: 'Monolith', components: 180, note: 'Demo delivery' }, null, 2))]
  for (const f of files) { f.sha256 = await sdk.digest(f.bytes!); S.assets.push(f) }
  const glacier = await capsule(halden, 'glacier-study-no-4.svg', 'image/svg+xml', svg(205, 'Glacier Study No. 4'))
  const lofoten = await capsule(halden, 'lofoten-field-notes.txt', 'text/plain', te.encode('Lofoten field recordings — session notes.\nThis text was decrypted in your browser from an Arcana Capsule.'))
  S.listings.push(
    { ...base, id: uuid(), seller_id: halden, title: 'Glacier Study No. 4', description: 'Generative study of ice-shelf fractures. Delivered as an Arcana Capsule: encrypted before upload, the key sealed only to you.', category: 'digital', delivery: 'download', file_key: glacier, price_usd_cents: 4200, crypto_mode: 'capsule-v1', created_at: t(1) },
    { ...base, id: uuid(), seller_id: orrery, title: 'Night Index — type specimen', description: 'Variable display face with 340 glyphs, OTF/WOFF2 and a commercial licence.', category: 'digital', delivery: 'download', file_key: files[0].key, price_usd_cents: 8900, crypto_mode: 'server', created_at: t(2) },
    { ...base, id: uuid(), seller_id: cardvault, title: 'Unopened 1999 holo, graded 9', description: 'Hand-delivered. Grading slab and provenance shared after funding.', category: 'collectible', delivery: 'manual', file_key: null, price_usd_cents: 186000, crypto_mode: 'server', created_at: t(3) },
    { ...base, id: uuid(), seller_id: meridian, title: 'arcana.eth — wallet transfer', description: 'Asset-control verified via signed message. Transfer coordinated outside the app after funding.', category: 'onchain', delivery: 'external', file_key: null, price_usd_cents: 250000, crypto_mode: 'server', created_at: t(4) },
    { ...base, id: uuid(), seller_id: halden, title: 'Field recordings: Lofoten', description: 'Two hours of 96 kHz sea and wind. Arcana Capsule delivery.', category: 'digital', delivery: 'download', file_key: lofoten, price_usd_cents: 3600, crypto_mode: 'capsule-v1', created_at: t(5) },
    { ...base, id: uuid(), seller_id: kiln, title: 'Monolith UI kit', description: 'Dark interface system — 180 components, tokens and source.', category: 'digital', delivery: 'download', file_key: files[1].key, price_usd_cents: 12900, crypto_mode: 'server', created_at: t(6) },
    { ...base, id: uuid(), seller_id: meridian, title: 'Private repo: orbital sim', description: 'GitHub control verified. Repository transfer after acceptance.', category: 'other', delivery: 'external', file_key: null, price_usd_cents: 64000, crypto_mode: 'server', created_at: t(7) },
  )
  // The Arcana Fragments collection: each original sealed as a capsule, its preview public.
  const studio = await mkSeller('fragments-studio')
  for (let i = 0; i < FRAGMENT_COUNT; i++) {
    const f = fragment(i), slug = f.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const fileKey = await capsule(studio, `arcana-fragment-${f.number}-${slug}.svg`, 'image/svg+xml', te.encode(f.svg))
    const previewKey = uuid()
    S.assets.push({ key: previewKey, owner: studio, kind: 'previews', name: 'preview', sha256: '', dataUrl: fragmentDataUrl(f.svg), crypto_mode: 'server' })
    S.listings.push({ ...base, id: uuid(), seller_id: studio, title: f.title, description: `Arcana Fragments ${f.number}/15, a generative work in CMYK dot matrix. The original SVG is sealed as an Arcana Capsule and decrypts only in the buyer's browser.`, category: 'collectible', delivery: 'download', preview_key: previewKey, file_key: fileKey, price_usd_cents: f.priceUsdCents, crypto_mode: 'capsule-v1', created_at: new Date(Date.now() - i * 3600000).toISOString() })
  }
  const reviewer = await mkSeller('arcana-reviewer'); S.reviewer = reviewer
}

// ---------- simulated counterparties ----------
async function sealFor(listingId: string, buyerId: string) {
  const l = listing(listingId), sim = S.simKeys[l.seller_id], buyer = activeIdentity(buyerId), ck = l.file_key ? S.contentKeys[l.file_key] : null
  if (!sim || !buyer || !ck) return
  if (S.envelopes.some((e) => e.listing_id === l.id && e.buyer_id === buyerId && e.recipient_key_id === buyer.public_identity.keyId)) return
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
  const envelope = await sdk.sealEnvelope(sim, buyer.public_identity, buyer.public_identity.fingerprint, { origin, purpose: 'capsule-key', resourceId: l.id, nonce: uuid(), senderAccountId: l.seller_id, recipientAccountId: buyerId, expiresAt },
    sdk.encode({ capsuleId: ck.capsuleId, ciphertextSha256: ck.sha, contentKey: ck.key }))
  S.envelopes.push({ listing_id: l.id, buyer_id: buyerId, listing_revision: l.revision, recipient_key_id: envelope.recipientKeyId, sender_key_id: envelope.senderKeyId, envelope, expires_at: expiresAt })
}
// The demo shortens the escrow review window so visitors can watch an automatic release.
const DEMO_REVIEW_MS = 10 * 60_000, DISPUTE_DAYS = 7
async function finalize(o: Order, outcome: 'buyer_accepted' | 'auto_release') {
  o.status = 'paid'
  const at = now(); if (outcome === 'buyer_accepted') o.delivery_confirmed_at = at
  const claim = { version: 1, kind: 'acquisition', orderId: o.id, listingId: o.listing_id, assetSha256: o.file_sha256, finalizedAt: at, outcome, settlement: 'demo-simulated' }
  o.proof = { algorithm: 'ECDSA-P256 (demo key)', claim, signature: await signClaim(claim) }
}
async function tick() {
  let changed = false
  for (const o of S.offers) {
    const l = S.listings.find((x) => x.id === o.listing_id)
    if (!l || !account(l.seller_id)?.sim || l.status !== 'live') continue
    if (o.status === 'open') {
      if (o.amount_usd_cents >= l.price_usd_cents * 0.85) { o.status = 'accepted' } else { o.status = 'countered'; o.counter_usd_cents = Math.round(l.price_usd_cents * 0.92) }
      o.revision++; changed = true
    }
    if (l.crypto_mode === 'capsule-v1' && ['open', 'accepted', 'countered'].includes(o.status)) { const before = S.envelopes.length; await sealFor(l.id, o.buyer_id); changed ||= S.envelopes.length !== before }
  }
  for (const o of S.orders) {
    if (o.status === 'awaiting_payment' && Date.now() - Date.parse(o.created_at) > AUTOPAY_MS) {
      o.status = 'funded'; o.funded_at = now(); o.release_after = new Date(Date.now() + DEMO_REVIEW_MS).toISOString()
      const l = S.listings.find((x) => x.id === o.listing_id); if (l) l.status = 'sold'
      for (const of of S.offers) if (of.listing_id === o.listing_id && ['open', 'countered', 'accepted'].includes(of.status)) of.status = of.buyer_id === o.buyer_id ? 'completed' : 'declined'
      changed = true
    }
  }
  for (const o of S.orders) if (o.status === 'funded' && o.release_after && Date.parse(o.release_after) <= Date.now()) { await finalize(o, 'auto_release'); changed = true }
  // Simulated sellers answer the first message in each thread.
  for (const c of S.conversations) {
    const sim = S.simKeys[c.seller_id]
    if (!sim || !S.messages.some((m) => m.conversation_id === c.id && m.sender_id === c.buyer_id) || S.messages.some((m) => m.conversation_id === c.id && m.sender_id === c.seller_id)) continue
    const buyer = S.identities.find((i) => i.public_identity.keyId === c.buyer_key_id)!.public_identity
    const body = await sdk.encryptConversation(sim, buyer, sim.public, { buyer: buyer.fingerprint, seller: sim.public.fingerprint }, c.id, { text: `Hi — @${alias(c.seller_id)} here (simulated seller). Happy to answer; this reply was end-to-end encrypted in your browser.` }, c.expires_at)
    S.messages.push({ id: body.id, conversation_id: c.id, sender_id: c.seller_id, sequence: ++c.sequence, buyer_envelope: body.buyer, seller_envelope: body.seller, created_at: now() })
    changed = true
  }
  if (changed) await save()
}

// ---------- views ----------
const publicListing = (l: Listing, me: string | null) => ({ id: l.id, title: l.title, description: l.description, category: l.category, visibility: l.visibility, delivery: l.delivery, preview_key: l.preview_key, asset_reference: null, price_usd_cents: l.price_usd_cents, crypto_mode: l.crypto_mode, status: l.status, created_at: l.created_at, revision: l.revision, seller_alias: alias(l.seller_id), invitation_only: l.invitation_only, is_seller: l.seller_id === me })
const capsuleReady = (o: Offer) => {
  const l = S.listings.find((x) => x.id === o.listing_id), buyer = activeIdentity(o.buyer_id)
  return !!l && l.crypto_mode === 'capsule-v1' && !!buyer && S.envelopes.some((e) => e.listing_id === l.id && e.buyer_id === o.buyer_id && e.listing_revision === l.revision && e.recipient_key_id === buyer.public_identity.keyId)
}
const orderView = (o: Order) => ({ id: o.id, listing_id: o.listing_id, title: o.title, price_usd_cents: o.price_usd_cents, status: o.status, expires_at: o.payment.expiresAt, received_zat: o.status === 'awaiting_payment' ? '0' : o.amount_zat, confirmations: o.status === 'awaiting_payment' ? 0 : 2, file_sha256: o.file_sha256, funded_at: o.funded_at, release_after: o.release_after ?? null, dispute_due_at: o.dispute_due_at ?? null, delivery_confirmed_at: o.delivery_confirmed_at, disputed_at: o.disputed_at, downloadable: ['funded', 'paid', 'disputed'].includes(o.status), buyer_confirmed: !!o.delivery_confirmed_at, crypto_mode: o.crypto_mode })

// ---------- checkout ----------
function checkout(me: string, listingId: string, offerId?: string, priceOverride?: number) {
  const l = listing(listingId)
  if (l.seller_id === me) fail(403, 'You cannot buy your own listing')
  if (l.status !== 'live') fail(409, 'This listing is not available')
  if (l.delivery !== 'download') fail(409, 'This item is delivered outside the app and cannot be checked out automatically')
  let price = priceOverride ?? l.price_usd_cents
  if (offerId) { const o = S.offers.find((x) => x.id === offerId && x.buyer_id === me && x.status === 'accepted') ?? fail(409, 'Offer is not accepted'); price = o.counter_usd_cents ?? o.amount_usd_cents }
  let envelope: sdk.Envelope | null = null
  if (l.crypto_mode === 'capsule-v1') {
    const buyer = activeIdentity(me) ?? fail(409, 'An active encryption identity is required')
    envelope = S.envelopes.find((e) => e.listing_id === l.id && e.buyer_id === me && e.recipient_key_id === buyer.public_identity.keyId)?.envelope ?? fail(409, 'Seller must prepare a current buyer-specific capsule envelope before checkout')
  }
  const asset = S.assets.find((a) => a.key === l.file_key)
  const zat = zatFor(price), memo = code('GA', 8), address = 'utest1demo' + hex(crypto.getRandomValues(new Uint8Array(16)))
  const expiresAt = new Date(Date.now() + 30 * 60000).toISOString(), receipt = code('RCT')
  const payment = { paymentId: uuid(), address, memo, amountZat: zat.toString(), amountZec: zec(zat), usdCents: price, uri: `zcash:${address}?amount=${zec(zat)}&memo=${sdk.b64(te.encode(memo))}`, expiresAt }
  const order: Order = { id: uuid(), listing_id: l.id, buyer_id: me, title: l.title, price_usd_cents: price, status: 'awaiting_payment', created_at: now(), receipt, payment, amount_zat: zat.toString(), funded_at: null, delivery_confirmed_at: null, disputed_at: null, file_sha256: asset?.sha256 ?? null, crypto_mode: l.crypto_mode, envelope, proof: null, fee_bps: 0 }
  S.orders.push(order); l.status = 'reserved'
  return { orderId: order.id, payment, receiptCode: receipt }
}

// ---------- router ----------
type Ctx = { method: string; path: string; query: URLSearchParams; body: unknown; raw: Uint8Array | null; headers: Headers; me: string | null }
type Route = [string, RegExp, (c: Ctx, m: RegExpMatchArray) => Promise<unknown> | unknown]
const need = (c: Ctx) => c.me ?? fail(401, 'unauthorized')
const b = (c: Ctx) => (c.body ?? {}) as Json

const routes: Route[] = [
  ['GET', /^\/api\/health$/, () => ({ ok: true, mode: 'demo', network: 'test', origin, demoAutopaySeconds: AUTOPAY_MS / 1000 })],
  ['GET', /^\/api\/terms$/, () => ({ platformFeeBps: 0, feeAppliesTo: 'completed sales only; refunds and cancelled orders pay no fee', feeHistory: [{ fee_bps: 0, effective_at: now() }], settlement: 'demo', network: 'test', minConfirmations: 2, price: { source: 'fixed', rateMicroUsd: ZEC_USD.toString() }, escrow: { reviewHours: 1, disputeDecisionDays: DISPUTE_DAYS, demoReviewMinutes: DEMO_REVIEW_MS / 60_000 }, neverSold: ['identity disclosure', 'user transaction data'] })],
  ['GET', /^\/api\/me$/, (c) => { const a = account(c.me); return { account: a ? { id: a.id, alias: a.alias, hasPayout: !!a.payout } : null } }],
  ['POST', /^\/api\/signup$/, async (c) => {
    const alias = String(b(c).alias ?? '').trim().toLowerCase(), pass = String(b(c).passphrase ?? '')
    if (!/^[a-z][a-z0-9_-]{2,23}$/.test(alias) || pass.length < 12) fail(400, 'Invalid input')
    if (S.accounts.some((a) => a.alias === alias)) fail(409, 'Alias unavailable')
    const salt = uuid(), a: Account = { id: uuid(), alias, salt, pass: await passHash(salt, pass), payout: null, epoch: 0 }
    S.accounts.push(a); S.session = a.id; return { account: { id: a.id, alias } }
  }],
  ['POST', /^\/api\/login$/, async (c) => {
    const a = S.accounts.find((x) => x.alias === String(b(c).alias ?? '').toLowerCase() && !x.sim)
    if (!a || a.pass !== await passHash(a.salt, String(b(c).passphrase ?? ''))) fail(401, 'Invalid alias or passphrase')
    S.session = a!.id; return { account: { id: a!.id, alias: a!.alias } }
  }],
  ['POST', /^\/api\/logout$/, () => { S.session = null; return { ok: true } }],
  ['PUT', /^\/api\/me\/payout$/, (c) => { const a = account(need(c))!, addr = String(b(c).address ?? ''); if (!/^utest1[a-z0-9]{15,}$/.test(addr)) fail(400, 'Use a shielded-capable Zcash unified address for the selected network'); a.payout = addr; return { ok: true } }],
  ['GET', /^\/api\/listings$/, (c) => {
    const cat = c.query.get('category'), q = (c.query.get('q') ?? '').toLowerCase()
    return S.listings.filter((l) => l.status !== 'paused' && l.visibility === 'public' && !l.invitation_only && (!cat || l.category === cat) && (!q || l.title.toLowerCase().includes(q)))
      .sort((x, y) => y.created_at.localeCompare(x.created_at)).map((l) => publicListing(l, c.me))
  }],
  ['GET', /^\/api\/listings\/mine$/, (c) => { const me = need(c); return S.listings.filter((l) => l.seller_id === me).map((l) => publicListing(l, me)) }],
  ['GET', /^\/api\/listings\/([\w-]+)$/, (c, m) => { const l = listing(m[1]); if (l.status === 'paused' && l.seller_id !== c.me) fail(404, 'Not found'); return publicListing(l, c.me) }],
  ['POST', /^\/api\/listings$/, (c) => {
    const me = need(c), a = account(me)!, x = b(c)
    if (!a.payout) fail(409, 'Configure a payout address before listing')
    const title = String(x.title ?? '').trim(), price = Number(x.priceUsdCents)
    if (title.length < 3 || !Number.isInteger(price) || price < 50) fail(400, 'Invalid input')
    const file = x.fileKey ? S.assets.find((f) => f.key === x.fileKey && f.owner === me && f.kind === 'private') ?? fail(400, 'Unknown file') : null
    if ((x.delivery ?? 'download') === 'download' && !file) fail(400, 'Download delivery requires a private file')
    const l: Listing = { id: uuid(), seller_id: me, title, description: (x.description as string) || null, category: String(x.category ?? 'digital'), visibility: String(x.visibility ?? 'public'), delivery: String(x.delivery ?? 'download'), preview_key: (x.previewKey as string) ?? null, file_key: file?.key ?? null, price_usd_cents: price, crypto_mode: file?.crypto_mode ?? 'server', status: 'live', created_at: now(), revision: 1, invitation_only: false }
    S.listings.push(l); return { listingId: l.id, revision: 1 }
  }],
  ['POST', /^\/api\/listings\/([\w-]+)\/status$/, (c, m) => { const l = listing(m[1]); if (l.seller_id !== need(c)) fail(404, 'Not found'); if (!['live', 'paused'].includes(l.status)) fail(409, 'Reserved or sold'); l.status = String(b(c).status); return { ok: true } }],
  ['POST', /^\/api\/assets\/(previews|private)$/, async (c, m) => {
    const me = need(c), bytes = c.raw ?? fail(400, 'Upload bytes as octet-stream')
    if (m[1] === 'previews') {
      const type = c.headers.get('x-asset-type') ?? 'image/png'
      if (!/^image\/(png|jpeg|webp)$/.test(type) || bytes.length > 5_000_000) fail(415, 'Unsupported preview')
      let bin = ''; bytes.forEach((x) => { bin += String.fromCharCode(x) })
      const key = uuid(); S.assets.push({ key, owner: me, kind: 'previews', name: 'preview', sha256: '', dataUrl: `data:${type};base64,${btoa(bin)}`, crypto_mode: 'server' }); return { key }
    }
    if (bytes.length > 25_000_000) fail(413, 'Too large')
    const key = uuid(), sha = await sdk.digest(bytes)
    S.assets.push({ key, owner: me, kind: 'private', name: c.headers.get('x-asset-filename') ?? 'file.bin', sha256: sha, bytes, crypto_mode: 'server' }); return { key, sha256: sha }
  }],
  ['POST', /^\/api\/capsules$/, async (c) => {
    const me = need(c), bytes = c.raw ?? fail(400, 'Upload encoded capsule JSON as octet-stream')
    let cap: sdk.Capsule; try { cap = sdk.decode(bytes); sdk.validateCapsule(cap) } catch { return fail(400, 'Invalid capsule format') }
    activeIdentity(me) ?? fail(409, 'An active encryption identity is required')
    const key = uuid(), sha = await sdk.digest(bytes)
    S.assets.push({ key, owner: me, kind: 'private', name: 'arcana-capsule.json', sha256: sha, bytes, crypto_mode: 'capsule-v1', capsule_id: cap.id }); return { key, sha256: sha, capsuleId: cap.id, cryptoMode: 'capsule-v1' }
  }],
  ['POST', /^\/api\/listings\/([\w-]+)\/offers$/, (c, m) => {
    const me = need(c), l = listing(m[1]), x = b(c), amount = Number(x.amountUsdCents)
    if (l.seller_id === me) fail(403, 'You cannot make an offer on your own listing')
    if (l.status !== 'live') fail(409, 'This listing is not accepting offers')
    if (l.invitation_only) { const inv = x.invitation as Json | undefined; if (!inv || !S.invitations.some((i) => i.id === inv.id && i.capability === inv.capability && i.listing_id === l.id && !i.revoked && !i.redeemed)) fail(404, 'Invitation capability required') }
    if (!Number.isInteger(amount) || amount < 50) fail(400, 'Invalid input')
    if (S.offers.some((o) => o.listing_id === l.id && o.buyer_id === me && ['open', 'countered', 'accepted'].includes(o.status))) fail(409, 'You already have an active offer for this listing')
    const o: Offer = { id: uuid(), listing_id: l.id, buyer_id: me, amount_usd_cents: amount, counter_usd_cents: null, status: 'open', created_at: now(), revision: 1 }
    S.offers.push(o); return { offerId: o.id, revision: 1 }
  }],
  ['GET', /^\/api\/offers$/, (c) => {
    const me = need(c)
    return S.offers.filter((o) => o.buyer_id === me || listing(o.listing_id).seller_id === me).sort((x, y) => y.created_at.localeCompare(x.created_at)).map((o) => {
      const l = listing(o.listing_id), seller = l.seller_id === me
      return { id: o.id, listing_id: l.id, listing_title: l.title, am_buyer: o.buyer_id === me, am_seller: seller, amount_usd_cents: o.amount_usd_cents, counter_usd_cents: o.counter_usd_cents, status: o.status, created_at: o.created_at, delivery: l.delivery, revision: o.revision, listing_revision: l.revision, crypto_mode: l.crypto_mode, buyer_id: seller ? o.buyer_id : null, buyer_alias: seller ? alias(o.buyer_id) : null, capsule_ready: capsuleReady(o) }
    })
  }],
  ['POST', /^\/api\/offers\/([\w-]+)\/action$/, (c, m) => {
    const me = need(c), o = S.offers.find((x) => x.id === m[1]) ?? fail(404, 'Not found'), l = listing(o.listing_id), x = b(c), action = String(x.action)
    const seller = l.seller_id === me, buyer = o.buyer_id === me
    const ok = (cond: boolean, next: string) => { if (!cond) fail(409, 'Offer state changed'); o.status = next; o.revision++ }
    if (action === 'accept' && seller) ok(o.status === 'open', 'accepted')
    else if (action === 'decline' && seller) ok(['open', 'countered'].includes(o.status), 'declined')
    else if (action === 'counter' && seller) { const v = Number(x.counterUsdCents); if (!Number.isInteger(v) || v < 50) fail(400, 'Invalid input'); ok(o.status === 'open', 'countered'); o.counter_usd_cents = v }
    else if (action === 'withdraw' && buyer) ok(['open', 'countered'].includes(o.status), 'withdrawn')
    else if (action === 'accept-counter' && buyer) ok(o.status === 'countered', 'accepted')
    else if (action === 'decline-counter' && buyer) ok(o.status === 'countered', 'declined')
    else fail(403, 'Forbidden')
    return { ok: true, revision: o.revision }
  }],
  ['POST', /^\/api\/listings\/([\w-]+)\/checkout$/, (c, m) => checkout(need(c), m[1], (b(c).offerId as string) || undefined)],
  ['GET', /^\/api\/orders$/, (c) => { const me = need(c); return S.orders.filter((o) => o.buyer_id === me).sort((x, y) => y.created_at.localeCompare(x.created_at)).map((o) => ({ id: o.id, listing_id: o.listing_id, title: o.title, status: o.status, price_usd_cents: o.price_usd_cents, created_at: o.created_at, refund_status: 'none' })) }],
  ['GET', /^\/api\/sales$/, (c) => { const me = need(c); return S.orders.filter((o) => listing(o.listing_id).seller_id === me).map((o) => ({ id: o.id, listing_id: o.listing_id, title: o.title, status: o.status, price_usd_cents: o.price_usd_cents, created_at: o.created_at, funded_at: o.funded_at, release_after: o.release_after ?? null, dispute_due_at: o.dispute_due_at ?? null, delivery_confirmed_at: o.delivery_confirmed_at, disputed_at: o.disputed_at, platform_fee_bps: 0, price_zat: o.amount_zat, platform_fee_zat: '0', seller_payout_zat: o.amount_zat })) }],
  ['GET', /^\/api\/orders\/([\w-]+)$/, (c, m) => { const me = need(c); return orderView(S.orders.find((o) => o.id === m[1] && o.buyer_id === me) ?? fail(404, 'Not found')) }],
  ['GET', /^\/api\/orders\/([\w-]+)\/payment$/, (c, m) => { const me = need(c), o = S.orders.find((x) => x.id === m[1] && x.buyer_id === me) ?? fail(404, 'Not found'); return { orderId: o.id, status: o.status, expiresAt: o.payment.expiresAt, payment: o.payment } }],
  ['POST', /^\/api\/orders\/([\w-]+)\/receipt$/, (c, m) => { const me = need(c), o = S.orders.find((x) => x.id === m[1] && x.buyer_id === me && ['funded', 'paid', 'disputed'].includes(x.status)) ?? fail(404, 'Not found'); o.receipt = code('RCT'); return { id: o.id, title: o.title, receiptCode: o.receipt } }],
  ['POST', /^\/api\/files\/([\w-]+)$/, (c, m) => {
    const o = S.orders.find((x) => x.listing_id === m[1] && x.receipt === b(c).receiptCode && x.buyer_id === c.me && ['funded', 'paid', 'disputed'].includes(x.status)) ?? fail(404, 'Not found')
    const a = S.assets.find((x) => x.key === listing(o.listing_id).file_key) ?? fail(404, 'Not found')
    return new Response(a.bytes!.slice(), { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${a.name}"`, 'x-arcana-asset-sha256': a.sha256 } })
  }],
  ['POST', /^\/api\/orders\/([\w-]+)\/confirm-delivery$/, async (c, m) => {
    const me = need(c), x = b(c), o = S.orders.find((y) => y.id === m[1] && y.buyer_id === me && y.receipt === x.receiptCode) ?? fail(404, 'Not found')
    if (o.status !== 'funded') fail(409, 'Order is not awaiting acceptance')
    if (String(x.assetSha256).toLowerCase() !== o.file_sha256) fail(409, 'Digest does not match the purchased asset')
    await finalize(o, 'buyer_accepted')
    return { status: 'paid', proof: o.proof }
  }],
  ['POST', /^\/api\/orders\/([\w-]+)\/dispute$/, (c, m) => {
    const me = need(c), o = S.orders.find((y) => y.id === m[1] && y.buyer_id === me) ?? fail(404, 'Not found'), reason = String(b(c).reason ?? '').trim()
    if (o.status !== 'funded') fail(409, 'Only funded orders can be disputed'); if (reason.length < 10) fail(400, 'Invalid input')
    if (o.release_after && Date.parse(o.release_after) <= Date.now()) fail(409, 'The review window has closed; this order is being released to the seller')
    o.status = 'disputed'; o.disputed_at = now(); o.dispute_due_at = new Date(Date.now() + DISPUTE_DAYS * 86400000).toISOString(); o.dispute_reason = reason
    return { status: 'disputed', sellerPayout: 'on_hold', decisionDueInDays: DISPUTE_DAYS }
  }],
  ['POST', /^\/api\/orders\/([\w-]+)\/proof$/, (c, m) => S.orders.find((o) => o.id === m[1] && o.receipt === b(c).receiptCode && o.status === 'paid')?.proof ?? fail(404, 'Not found')],
  ['POST', /^\/api\/proofs\/verify$/, async (c) => { const p = b(c).proof as Json | undefined; return { valid: !!p && await verifyClaim(p.claim, p.signature) } }],
  ['GET', /^\/api\/encryption\/identities\/([\w-]+)$/, (c, m) => { need(c); return S.identities.filter((i) => i.account_id === m[1]).map((i) => ({ public_identity: i.public_identity, binding: {}, epoch: i.epoch, revision: i.revision, created_at: i.created_at, revoked_at: i.revoked_at })) }],
  ['POST', /^\/api\/encryption\/challenges$/, async (c) => {
    const me = need(c), proposed = b(c) as unknown as sdk.PublicIdentity, a = account(me)!
    if (proposed.accountId !== me || proposed.origin !== origin) fail(400, 'Identity account/origin mismatch')
    try { await sdk.validatePublicIdentity(proposed) } catch { fail(400, 'Invalid public keys') }
    const id = uuid(), secret = crypto.getRandomValues(new Uint8Array(32)), previous = activeIdentity(me)
    const statement = JSON.stringify(['arcana-registration-challenge/v1', id, me, origin, proposed.fingerprint, previous?.epoch === a.epoch ? previous.public_identity.keyId : null, a.epoch, new Date(Date.now() + 300000).toISOString()])
    S.challenges = S.challenges.filter((x) => x.account_id !== me)
    S.challenges.push({ id, account_id: me, proposed, statement, secret: sdk.b64(secret), previous: previous?.epoch === a.epoch ? previous.public_identity.keyId : null })
    return { challengeId: id, statement, sealed: await sdk.sealChallenge(proposed, secret, statement), expiresAt: now() }
  }],
  ['POST', /^\/api\/encryption\/challenges\/([\w-]+)\/complete$/, async (c, m) => {
    const me = need(c), ch = S.challenges.find((x) => x.id === m[1] && x.account_id === me) ?? fail(401, 'Invalid registration challenge'), x = b(c)
    if (x.secret !== ch.secret) fail(401, 'Invalid registration challenge')
    const statement = sdk.registrationStatement(String(ch.statement), String(x.secret)), proposed = ch.proposed as sdk.PublicIdentity
    if (!await sdk.verifyStatement(proposed, statement, String(x.signature))) fail(401, 'Identity continuity signature required')
    const prev = ch.previous ? S.identities.find((i) => i.public_identity.keyId === ch.previous) : null
    if (prev && !await sdk.verifyStatement(prev.public_identity, statement, String(x.previousSignature ?? ''))) fail(401, 'Identity continuity signature required')
    S.identities.forEach((i) => { if (i.account_id === me && !i.revoked_at) i.revoked_at = now() })
    S.identities.push({ account_id: me, public_identity: proposed, epoch: account(me)!.epoch, revision: S.identities.filter((i) => i.account_id === me).length + 1, created_at: now(), revoked_at: null })
    S.challenges = S.challenges.filter((y) => y.id !== ch.id); return { identity: proposed }
  }],
  ['POST', /^\/api\/encryption\/reset$/, async (c) => {
    const me = need(c), a = account(me)!
    if (a.pass !== await passHash(a.salt, String(b(c).passphrase ?? ''))) fail(401, 'unauthorized')
    S.identities.forEach((i) => { if (i.account_id === me && !i.revoked_at) i.revoked_at = now() }); a.epoch++; return { epoch: a.epoch }
  }],
  ['POST', /^\/api\/listings\/([\w-]+)\/capsule-envelope$/, async (c, m) => {
    const me = need(c), l = listing(m[1]), x = b(c), e = x.envelope as sdk.Envelope, buyerId = String(x.buyerId)
    if (l.seller_id !== me || l.crypto_mode !== 'capsule-v1' || l.status !== 'live') fail(409, 'Capsule listing is unavailable')
    const sender = activeIdentity(me), recipient = activeIdentity(buyerId)
    if (!sender || !recipient || e.context.purpose !== 'capsule-key' || e.context.resourceId !== l.id || !await sdk.verifyEnvelope(e, sender.public_identity, recipient.public_identity)) fail(401, 'Invalid envelope authentication')
    S.envelopes = S.envelopes.filter((y) => !(y.listing_id === l.id && y.buyer_id === buyerId && y.recipient_key_id === e.recipientKeyId))
    S.envelopes.push({ listing_id: l.id, buyer_id: buyerId, listing_revision: l.revision, recipient_key_id: e.recipientKeyId, sender_key_id: e.senderKeyId, envelope: e, expires_at: e.context.expiresAt })
    return { envelopeId: uuid() }
  }],
  ['POST', /^\/api\/orders\/([\w-]+)\/key-envelope$/, (c, m) => {
    const me = need(c), o = S.orders.find((x) => x.id === m[1] && x.buyer_id === me && x.receipt === b(c).receiptCode && ['funded', 'paid', 'disputed'].includes(x.status) && x.envelope) ?? fail(404, 'Not found')
    return { envelope: o.envelope }
  }],
  ['GET', /^\/api\/conversations$/, (c) => {
    const me = need(c)
    return S.conversations.filter((x) => x.buyer_id === me || x.seller_id === me).map((x) => ({ ...x, listing_title: listing(x.listing_id).title, am_buyer: x.buyer_id === me, counterpart_alias: alias(x.buyer_id === me ? x.seller_id : x.buyer_id) }))
  }],
  ['POST', /^\/api\/conversations$/, (c) => {
    const me = need(c), l = listing(String(b(c).listingId))
    if (l.seller_id === me || l.status !== 'live') fail(404, 'Not found')
    const buyer = activeIdentity(me) ?? fail(409, 'An active encryption identity is required'), seller = activeIdentity(l.seller_id) ?? fail(409, 'Seller has no encryption identity yet')
    const conv: Conversation = { id: uuid(), listing_id: l.id, buyer_id: me, seller_id: l.seller_id, buyer_key_id: buyer.public_identity.keyId, seller_key_id: seller.public_identity.keyId, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(), created_at: now(), sequence: 0 }
    S.conversations.push(conv); return { ...conv, buyerIdentity: buyer.public_identity, sellerIdentity: seller.public_identity }
  }],
  ['GET', /^\/api\/conversations\/([\w-]+)\/messages$/, (c, m) => {
    const me = need(c), conv = S.conversations.find((x) => x.id === m[1] && (x.buyer_id === me || x.seller_id === me)) ?? fail(404, 'Not found'), after = Number(c.query.get('after') ?? 0)
    return S.messages.filter((x) => x.conversation_id === conv.id && x.sequence > after).map((x) => ({ id: x.id, sequence: x.sequence, sender_id: x.sender_id, envelope: me === conv.buyer_id ? x.buyer_envelope : x.seller_envelope, created_at: x.created_at }))
  }],
  ['POST', /^\/api\/conversations\/([\w-]+)\/messages$/, async (c, m) => {
    const me = need(c), conv = S.conversations.find((x) => x.id === m[1] && (x.buyer_id === me || x.seller_id === me)) ?? fail(404, 'Not found'), x = b(c)
    if (S.messages.some((y) => y.id === x.id)) fail(409, 'Request conflicts with current state')
    const keyOf = (id: string) => S.identities.find((i) => i.public_identity.keyId === id)!.public_identity
    const sender = activeIdentity(me)!.public_identity
    if (!await sdk.verifyEnvelope(x.buyer as sdk.Envelope, sender, keyOf(conv.buyer_key_id)) || !await sdk.verifyEnvelope(x.seller as sdk.Envelope, sender, keyOf(conv.seller_key_id))) fail(401, 'Invalid envelope authentication')
    S.messages.push({ id: String(x.id), conversation_id: conv.id, sender_id: me, sequence: ++conv.sequence, buyer_envelope: x.buyer as sdk.Envelope, seller_envelope: x.seller as sdk.Envelope, created_at: now() })
    return { sequence: conv.sequence }
  }],
  ['DELETE', /^\/api\/conversations\/([\w-]+)$/, (c, m) => { const me = need(c); S.conversations = S.conversations.filter((x) => !(x.id === m[1] && (x.buyer_id === me || x.seller_id === me))); S.messages = S.messages.filter((x) => x.conversation_id !== m[1]); return { deleted: true } }],
  ['POST', /^\/api\/listings\/([\w-]+)\/invitations$/, (c, m) => {
    const me = need(c), l = listing(m[1]), x = b(c)
    if (l.seller_id !== me || l.status !== 'live') fail(404, 'Not found'); if (l.crypto_mode !== 'capsule-v1') fail(409, 'Private invitations require a capsule product')
    const inv = { id: uuid(), listing_id: l.id, buyer_id: x.buyerId ?? null, price_usd_cents: x.priceUsdCents ?? null, capability: sdk.b64(crypto.getRandomValues(new Uint8Array(32))), expires_at: new Date(Date.now() + Number(x.hours ?? 24) * 3600000).toISOString(), revoked: false, redeemed: false }
    S.invitations.push(inv); l.invitation_only = true; l.visibility = 'unlisted'
    return { invitationId: inv.id, capability: inv.capability, expiresAt: inv.expires_at }
  }],
  ['POST', /^\/api\/invitations\/([\w-]+)\/inspect$/, (c, m) => {
    const me = need(c), i = S.invitations.find((x) => x.id === m[1] && x.capability === b(c).capability && !x.revoked && !x.redeemed && (!x.buyer_id || x.buyer_id === me) && Date.parse(String(x.expires_at)) > Date.now()) ?? fail(404, 'Not found')
    const l = listing(String(i.listing_id)); return { id: i.id, listing_id: l.id, price_usd_cents: i.price_usd_cents, expires_at: i.expires_at, title: l.title, crypto_mode: l.crypto_mode }
  }],
  ['POST', /^\/api\/invitations\/([\w-]+)\/redeem$/, (c, m) => {
    const me = need(c), i = S.invitations.find((x) => x.id === m[1] && x.capability === b(c).capability && !x.revoked && !x.redeemed && (!x.buyer_id || x.buyer_id === me)) ?? fail(404, 'Not found')
    const l = listing(String(i.listing_id)); l.invitation_only = false
    try { const r = checkout(me, l.id, undefined, (i.price_usd_cents as number | null) ?? undefined); i.redeemed = true; return r } finally { l.invitation_only = true }
  }],
  ['DELETE', /^\/api\/invitations\/([\w-]+)$/, (c, m) => { const me = need(c), i = S.invitations.find((x) => x.id === m[1] && listing(String(x.listing_id)).seller_id === me && !x.redeemed) ?? fail(409, 'Invitation already redeemed'); i.revoked = true; return { revoked: true } }],
  ['POST', /^\/api\/passports$/, async (c) => {
    const me = need(c), x = b(c), identity = activeIdentity(me) ?? fail(409, 'Active encryption identity required for holder binding')
    const kind = String(x.kind), minimum = Number(x.minimum ?? 1)
    const count = kind === 'completed_acquisition' ? (S.orders.some((o) => o.id === x.orderId && o.buyer_id === me && o.status === 'paid') ? 1 : 0) : S.orders.filter((o) => listing(o.listing_id).seller_id === me && o.status === 'paid').length
    if (count < minimum) fail(409, 'Requested fact is not established')
    const claim = { version: 2, id: uuid(), keyId: 'demo-issuer', kind, issuedAt: now(), expiresAt: new Date(Date.now() + Number(x.hours ?? 24) * 3600000).toISOString(), audience: String(x.audience), holderFingerprint: identity.public_identity.fingerprint, minimum, ...(x.discloseCount ? { disclosedCount: count } : {}) }
    const proof = { algorithm: 'ECDSA-P256 (demo key)', claim, signature: await signClaim(claim) }
    S.passports.push({ id: claim.id, account_id: me, revoked: false }); return proof
  }],
  ['POST', /^\/api\/passports\/verify$/, async (c) => {
    const x = b(c), p = x.proof as Json | undefined, claim = p?.claim as Json | undefined
    if (!p || !claim || claim.audience !== x.audience || Date.parse(String(claim.expiresAt)) <= Date.now() || S.passports.find((y) => y.id === claim.id)?.revoked !== false || !await verifyClaim(claim, p.signature)) return { valid: false }
    return { valid: true, claim, holderProofRequired: true }
  }],
  ['DELETE', /^\/api\/passports\/([\w-]+)$/, (c, m) => { const me = need(c), p = S.passports.find((x) => x.id === m[1] && x.account_id === me) ?? fail(404, 'Not found'); p.revoked = true; return { revoked: true } }],
  ['POST', /^\/api\/asset-control\/challenges$/, async (c) => {
    const me = need(c), x = b(c), kind = String(x.kind), subject = String(x.subject).trim().toLowerCase(), id = uuid()
    const statement = ['Gallery Arcana asset-control/v1 — control only; no transfer authorization', `Origin: ${origin}`, `Account: ${me}`, `Kind: ${kind}`, `Subject: ${subject}`, `Challenge: ${id}`].join('\n')
    const marker = 'arcana-control-v1=' + await sdk.digest(te.encode(statement))
    S.challenges.push({ id, account_id: me, kind, subject, statement })
    return { challengeId: id, kind, subject, statement, expiresAt: new Date(Date.now() + 600000).toISOString(), ...(kind === 'dns' ? { record: `_arcana-control.${subject}`, value: marker } : kind === 'github' ? { path: '.well-known/arcana-control.txt', branch: 'main', value: marker } : { signatureStandard: 'EIP-191 personal_sign' }) }
  }],
  ['POST', /^\/api\/asset-control\/challenges\/([\w-]+)\/verify$/, (c, m) => {
    const me = need(c), ch = S.challenges.find((x) => x.id === m[1] && x.account_id === me && x.kind) ?? fail(404, 'Not found')
    const row = { id: uuid(), kind: ch.kind, subject: ch.subject, verified_at: now(), expires_at: new Date(Date.now() + 86400000).toISOString(), account_id: me, scope: 'demo: simulated observation, not checked against DNS/GitHub/chain' }
    S.controls.push(row); S.challenges = S.challenges.filter((x) => x.id !== ch.id); return row
  }],
  ['GET', /^\/api\/asset-control\/verifications$/, (c) => { const me = need(c); return S.controls.filter((x) => x.account_id === me) }],
  ['GET', /^\/api\/orders\/([\w-]+)\/reviewer$/, (c, m) => {
    const me = need(c), o = S.orders.find((x) => x.id === m[1] && (x.buyer_id === me || listing(x.listing_id).seller_id === me) && x.status === 'disputed') ?? fail(404, 'Not found')
    void o; return { reviewerIdentity: activeIdentity(S.reviewer!)!.public_identity }
  }],
  ['POST', /^\/api\/orders\/([\w-]+)\/evidence$/, async (c, m) => {
    const me = need(c), o = S.orders.find((x) => x.id === m[1] && x.buyer_id === me && x.status === 'disputed') ?? fail(404, 'Not found'), e = (b(c).envelope) as sdk.Envelope
    if (!await sdk.verifyEnvelope(e, activeIdentity(me)!.public_identity, activeIdentity(S.reviewer!)!.public_identity) || e.context.resourceId !== o.id) fail(401, 'Invalid envelope authentication')
    const sha = await sdk.digest(te.encode(JSON.stringify(e))); S.evidence.push({ id: e.context.nonce, order_id: o.id, envelope: e, sha }); return { evidenceId: e.context.nonce, ciphertextSha256: sha }
  }],
  ['GET', /^\/api\/orders\/([\w-]+)\/evidence$/, () => fail(404, 'Not found')],
]

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const raw = ['GET', 'HEAD'].includes(req.method) ? null : new Uint8Array(await req.arrayBuffer())
  let body: unknown = null
  if (raw && (req.headers.get('content-type') ?? '').includes('json')) { try { body = JSON.parse(new TextDecoder().decode(raw)) } catch { body = null } }
  // credentials:'omit' (the observer probes) behaves like a visitor with no session cookie.
  const ctx: Ctx = { method: req.method, path: url.pathname, query: url.searchParams, body, raw, headers: req.headers, me: req.credentials === 'omit' ? null : S.session }
  try {
    if (req.method !== 'GET' && req.headers.get('x-arcana-action') !== '1') fail(403, 'Missing request verification header')
    await tick()
    for (const [method, re, fn] of routes) {
      const m = ctx.path.match(re)
      if (m && method === req.method) {
        const out = await fn(ctx, m)
        if (req.method !== 'GET') await save()
        if (out instanceof Response) return out
        return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } })
      }
    }
    fail(404, 'Not found')
  } catch (e) {
    const status = e instanceof Http ? e.status : 500
    if (!(e instanceof Http)) console.error(e)
    return new Response(JSON.stringify({ error: e instanceof Http ? e.message : 'Internal error' }), { status, headers: { 'content-type': 'application/json' } })
  }
  return new Response(null, { status: 404 })
}

/** Installs the in-browser API. Previews are served as data URLs via previewUrl(). */
export async function installDemoServer() {
  origin = window.location.origin
  S = (await idb<State | undefined>('readonly', (s) => s.get('v2'))) as State
  if (!S || S.v !== 2) {
    S = { v: 2, session: null, accounts: [], identities: [], assets: [], listings: [], offers: [], envelopes: [], orders: [], conversations: [], messages: [], invitations: [], passports: [], controls: [], challenges: [], evidence: [], simKeys: {}, contentKeys: {} }
    await seed()
  }
  if (!S.signing) {
    const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    S.signing = { pub: await crypto.subtle.exportKey('jwk', k.publicKey), priv: await crypto.subtle.exportKey('jwk', k.privateKey) }
  }
  signKey = {
    priv: await crypto.subtle.importKey('jwk', S.signing.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
    pub: await crypto.subtle.importKey('jwk', S.signing.pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']),
  }
  await save()
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init)
    const path = new URL(req.url).pathname
    // The waitlist is real even in the demo: it goes to the Pages Function, never the simulation.
    return path.startsWith('/api/') && path !== '/api/waitlist' ? handle(req) : realFetch(input, init)
  }
  ;(window as unknown as { __arcanaPreview?: (k: string) => string | null }).__arcanaPreview = (key) => S.assets.find((a) => a.key === key)?.dataUrl ?? null
}
