// Cloudflare Worker entry: /api/waitlist is handled here, everything else is
// the static demo app (dist/), with single-page-app fallback.
import { json, waitlist } from './waitlist'

type Env = { ASSETS: { fetch(req: Request): Promise<Response> }; WAITLIST?: Parameters<typeof waitlist>[1]['WAITLIST'] }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/api/waitlist') return request.method === 'POST' ? waitlist(request, env) : json(405, { error: 'Method not allowed' })
    if (pathname.startsWith('/api/')) return json(404, { error: 'Not found' })
    return env.ASSETS.fetch(request)
  },
}
