// Thin client for the Gallery Arcana JSON API (docs/API.md). Every mutation
// carries X-Arcana-Action; the session lives in an HttpOnly cookie.

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
  delivery: string; revision: number
}
export type OrderSummary = { id: string; listing_id: string; title: string; status: string; price_usd_cents: number; created_at: string; refund_status?: string }
export type Payment = { paymentId?: string; address: string; memo: string; amountZat: string; amountZec: string; usdCents: number; uri: string; expiresAt?: string }
export type Checkout = { orderId: string; payment: Payment; receiptCode: string }
export type OrderStatus = {
  id: string; listing_id: string; title: string; price_usd_cents: number; status: string; expires_at: string
  received_zat: string; confirmations: number; file_sha256: string | null; funded_at: string | null
  delivery_confirmed_at: string | null; disputed_at: string | null; downloadable: boolean; buyer_confirmed: boolean
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

export const api = {
  health: () => request<{ mode: string; network: string }>('GET', '/api/health'),
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

  offer: (listingId: string, amountUsdCents: number) => request<{ offerId: string }>('POST', `/api/listings/${listingId}/offers`, { amountUsdCents }),
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

export const previewUrl = (key: string | null) => (key ? `/previews/${encodeURIComponent(key)}` : null)
