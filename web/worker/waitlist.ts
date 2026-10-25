// POST /api/waitlist handler shared by the Worker (worker/index.ts) and the Pages Function.
// Stores { email, role, at } in the KV namespace bound as WAITLIST
// (Pages project → Settings → Bindings → KV namespace → variable name WAITLIST).
// No IP address, user agent or tracking data is stored.
type KV = { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> }

export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
const ROLES = ['collector', 'creator', 'both']

export async function waitlist(request: Request, env: { WAITLIST?: KV }) {
  if (!env.WAITLIST) return json(503, { error: 'Waitlist storage is not configured on this deployment yet.' })
  if (request.headers.get('x-arcana-action') !== '1') return json(403, { error: 'Missing request verification header' })
  const site = new URL(request.url).origin, from = request.headers.get('origin')
  if (from && from !== site) return json(403, { error: 'Invalid request origin' })
  const text = await request.text()
  if (text.length > 2048) return json(413, { error: 'Request too large' })
  let body: { email?: unknown; role?: unknown; website?: unknown }
  try { body = JSON.parse(text) } catch { return json(400, { error: 'Invalid request' }) }
  if (body.website) return json(200, { ok: true }) // honeypot: bots fill hidden fields
  const email = String(body.email ?? '').trim().toLowerCase(), role = String(body.role ?? 'collector')
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !ROLES.includes(role)) return json(400, { error: 'Enter a valid email address' })
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)))].map((b) => b.toString(16).padStart(2, '0')).join('')
  const key = `waitlist:${digest}`
  if (!(await env.WAITLIST.get(key))) await env.WAITLIST.put(key, JSON.stringify({ email, role, at: new Date().toISOString() }))
  // Same answer whether new or existing, so the form cannot be used to test who signed up.
  return json(200, { ok: true })
}
