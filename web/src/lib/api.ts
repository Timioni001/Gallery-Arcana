// Thin client for the Gallery Arcana JSON API (docs/API.md). Every mutation
// carries X-Arcana-Action; the session lives in an HttpOnly cookie.

import type { Envelope, PublicIdentity } from '@arcana/client-crypto'

export type Category = 'digital' | 'collectible' | 'onchain' | 'other'
export type Listing = {
  id: string
  title: string
  description: string | null
  category: Category
  visibility: 'public' | 'unlisted'
  delivery: 'download' | 'manual' | 'external'
  preview_key: string | null
  asset_reference: string | null
  price_usd_cents: number
  crypto_mode?: string | null
  status: 'live' | 'paused' | 'reserved' | 'sold'
  created_at: string
  revision: number
  seller_alias?: string
  is_seller?: boolean
}
export type Account = { id: string; alias: string; hasPayout?: boolean }
export type Offer = {
  id: string; listing_id: string; listing_title: string; am_buyer: boolean; am_seller: boolean
  amount_usd_cents: number; counter_usd_cents: number | null; status: string; created_at: string
  delivery: string; revision: number; crypto_mode?: string; buyer_id?: string | null; buyer_alias?: string | null; capsule_ready?: boolean
}
export type Conversation = {
  id: string; listing_id: string; listing_title: string; am_buyer: boolean; buyer_id: string; seller_id: string
  buyer_key_id: string; seller_key_id: string; counterpart_alias: string; sequence: number; expires_at: string; created_at: string
}
export type StoredMessage = { id: string; sequence: number; sender_id: string; envelope: Envelope; created_at: string }
export type IdentityRecord = { public_identity: PublicIdentity; revision: number; created_at: string; revoked_at: string | null }
export type OrderSummary = { id: string; listing_id: string; title: string; status: string; price_usd_cents: number; created_at: string; refund_status?: string }
export type Payment = { paymentId?: string; address: string; memo: string; amountZat: string; amountZec: string; usdCents: number; uri: string; expiresAt?: string }
export type Checkout = { orderId: string; payment: Payment; receiptCode: string }
export type OrderStatus = {
  id: string; listing_id: string; title: string; price_usd_cents: number; status: string; expires_at: string
  received_zat: string; confirmations: number; file_sha256: string | null; funded_at: string | null
  delivery_confirmed_at: string | null; disputed_at: string | null; downloadable: boolean; buyer_confirmed: boolean; crypto_mode?: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function request<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
  if (method !== 'GET') headers['X-Arcana-Action'] = '1'
  if (body !== undefined && !(body instanceof Blob)) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, {
    ...init, method, headers, credentials: 'same-origin',
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  })
  if (!res.ok) {
    let message = res.statusText || 'Request failed'
    try { message = (await res.json()).error ?? message } catch { /* non-JSON error */ }
    throw new ApiError(res.status, message)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.blob()) as Promise<T>
}

const baseApi = {
  health: () => request<{ mode: string; network: string; origin?: string; demoAutopaySeconds?: number | null }>('GET', '/api/health'),
  me: () => request<{ account: Account | null }>('GET', '/api/me'),
  signup: (alias: string, passphrase: string) => request<{ account: Account }>('POST', '/api/signup', { alias, passphrase }),
  login: (alias: string, passphrase: string) => request<{ account: Account }>('POST', '/api/login', { alias, passphrase }),
  logout: () => request<{ ok: true }>('POST', '/api/logout', {}),
  setPayout: (address: string) => request<unknown>('PUT', '/api/me/payout', { address }),

  listings: (p: { category?: Category; q?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams()
    if (p.category) qs.set('category', p.category)
    if (p.q) qs.set('q', p.q)
    qs.set('limit', String(p.limit ?? 40))
    return request<Listing[]>('GET', `/api/listings?${qs}`)
  },
  listing: (id: string) => request<Listing>('GET', `/api/listings/${id}`),
  mine: () => request<Listing[]>('GET', '/api/listings/mine'),
  createListing: (b: { title: string; description?: string; category: Category; visibility: 'public' | 'unlisted'; delivery: 'download' | 'manual' | 'external'; fileKey?: string; previewKey?: string; priceUsdCents: number }) =>
    request<{ listingId: string; revision: number }>('POST', '/api/listings', b),
  setStatus: (id: string, status: 'live' | 'paused') => request<unknown>('POST', `/api/listings/${id}/status`, { status }),
  upload: (kind: 'previews' | 'private', file: File) =>
    request<{ key: string; sha256?: string }>('POST', `/api/assets/${kind}`, new Blob([file], { type: 'application/octet-stream' }), {
      headers: kind === 'previews' ? { 'X-Asset-Type': file.type } : { 'X-Asset-Filename': file.name },
    }),

  offer: (listingId: string, amountUsdCents: number, invitation?: { id: string; capability: string }) => request<{ offerId: string }>('POST', `/api/listings/${listingId}/offers`, invitation ? { amountUsdCents, invitation } : { amountUsdCents }),
  offers: () => request<Offer[]>('GET', '/api/offers'),
  actOnOffer: (id: string, action: string, extra: { counterUsdCents?: number; expectedVersion?: number } = {}) =>
    request<unknown>('POST', `/api/offers/${id}/action`, { action, ...extra }),

  checkout: (listingId: string, offerId?: string) => request<Checkout>('POST', `/api/listings/${listingId}/checkout`, offerId ? { offerId } : {}),
  orders: () => request<OrderSummary[]>('GET', '/api/orders'),
  sales: () => request<OrderSummary[]>('GET', '/api/sales'),
  renewReceipt: (id: string) => request<{ receiptCode: string }>('POST', `/api/orders/${id}/receipt`, {}),
  order: (id: string) => request<OrderStatus>('GET', `/api/orders/${id}`),
  orderPayment: (id: string) => request<{ payment: Payment; status: string; expiresAt: string }>('GET', `/api/orders/${id}/payment`),
  download: async (listingId: string, receiptCode: string) => {
    const res = await fetch(`/api/files/${listingId}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'X-Arcana-Action': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ receiptCode }),
    })
    if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => ({}))).error ?? 'Download failed')
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'arcana-asset.bin'
    return { blob: await res.blob(), name, sha256: res.headers.get('x-arcana-asset-sha256') ?? '' }
  },
  confirmDelivery: (orderId: string, receiptCode: string, assetSha256: string) =>
    request<unknown>('POST', `/api/orders/${orderId}/confirm-delivery`, { receiptCode, assetSha256 }),
  proof: (orderId: string, receiptCode: string) => request<Record<string, unknown>>('POST', `/api/orders/${orderId}/proof`, { receiptCode }),
  verifyProof: (proof: unknown) => request<{ valid: boolean }>('POST', '/api/proofs/verify', { proof }),
  dispute: (orderId: string, reason: string) => request<unknown>('POST', `/api/orders/${orderId}/dispute`, { reason }),
}

export const privateApi = {
  identityHistory: (accountId: string) => request<IdentityRecord[]>('GET', `/api/encryption/identities/${accountId}`),
  identityChallenge: (identity: PublicIdentity) => request<{ challengeId: string; statement: string; sealed: { enc: string; ciphertext: string } }>('POST', '/api/encryption/challenges', identity),
  completeIdentity: (challengeId: string, answer: { secret: string; signature: string; previousSignature?: string }) =>
    request<unknown>('POST', `/api/encryption/challenges/${challengeId}/complete`, answer),
  resetIdentity: (passphrase: string) => request<unknown>('POST', '/api/encryption/reset', { passphrase, acknowledgeKeyLoss: true }),
  uploadCapsule: (encoded: Uint8Array) => request<{ key: string; sha256: string; capsuleId: string }>('POST', '/api/capsules', new Blob([encoded.slice()], { type: 'application/octet-stream' })),
  prepareCapsuleEnvelope: (listingId: string, buyerId: string, envelope: Envelope) => request<{ envelopeId: string }>('POST', `/api/listings/${listingId}/capsule-envelope`, { buyerId, envelope }),
  keyEnvelope: (orderId: string, receiptCode: string) => request<{ envelope: Envelope }>('POST', `/api/orders/${orderId}/key-envelope`, { receiptCode }),
  conversations: () => request<Conversation[]>('GET', '/api/conversations'),
  openConversation: (listingId: string, invitation?: { id: string; capability: string }) =>
    request<Conversation & { buyerIdentity: PublicIdentity; sellerIdentity: PublicIdentity }>('POST', '/api/conversations', invitation ? { listingId, invitation } : { listingId }),
  messages: (id: string, after = 0) => request<StoredMessage[]>('GET', `/api/conversations/${id}/messages?after=${after}`),
  postMessage: (id: string, body: { id: string; buyer: Envelope; seller: Envelope }) => request<{ sequence: number }>('POST', `/api/conversations/${id}/messages`, body),
  closeConversation: (id: string) => request<unknown>('DELETE', `/api/conversations/${id}`),
  createInvitation: (listingId: string, b: { buyerId?: string; priceUsdCents?: number; offerId?: string; hours?: number }) =>
    request<{ invitationId?: string; id?: string; capability: string; expiresAt?: string; expires_at?: string }>('POST', `/api/listings/${listingId}/invitations`, b),
  inspectInvitation: (id: string, capability: string) => request<Record<string, unknown> & { listing_id: string }>('POST', `/api/invitations/${id}/inspect`, { capability }),
  redeemInvitation: (id: string, capability: string) => request<Checkout>('POST', `/api/invitations/${id}/redeem`, { capability }),
  revokeInvitation: (id: string) => request<unknown>('DELETE', `/api/invitations/${id}`),
  issuePassport: (b: { kind: 'completed_acquisition' | 'seller_deliveries'; orderId?: string; minimum?: number; discloseCount?: boolean; audience: string; hours?: number }) =>
    request<Record<string, unknown>>('POST', '/api/passports', b),
  verifyPassport: (proof: unknown, audience: string) => request<Record<string, unknown> & { valid: boolean }>('POST', '/api/passports/verify', { proof, audience }),
  revokePassport: (id: string) => request<unknown>('DELETE', `/api/passports/${id}`),
  controlChallenge: (b: { kind: 'dns' | 'github' | 'evm'; subject: string; chainId?: number }) => request<Record<string, unknown>>('POST', '/api/asset-control/challenges', b),
  verifyControl: (id: string, signature?: string) => request<Record<string, unknown>>('POST', `/api/asset-control/challenges/${id}/verify`, signature ? { signature } : {}),
  controlVerifications: () => request<Record<string, unknown>[]>('GET', '/api/asset-control/verifications'),
  reviewer: (orderId: string) => request<{ reviewerIdentity: PublicIdentity }>('GET', `/api/orders/${orderId}/reviewer`),
  evidence: (orderId: string) => request<{ id: string; submitter_id: string; envelope: Envelope; ciphertext_hash: string; expires_at: string }[]>('GET', `/api/orders/${orderId}/evidence`),
  submitEvidence: (orderId: string, envelope: Envelope) => request<{ evidenceId: string; ciphertextSha256: string }>('POST', `/api/orders/${orderId}/evidence`, { consent: true, envelope }),
}
export const api = { ...baseApi, ...privateApi }

// The in-browser demo backend serves previews from memory instead of /previews.
const demoPreview = (key: string) => (window as unknown as { __arcanaPreview?: (k: string) => string | null }).__arcanaPreview?.(key)
export const previewUrl = (key: string | null) => (key ? demoPreview(key) ?? `/previews/${encodeURIComponent(key)}` : null)
