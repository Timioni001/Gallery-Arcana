// Cloudflare Pages Function wrapper (Pages deployments). Workers deployments use worker/index.ts.
import { json, waitlist } from '../../worker/waitlist'
type Ctx = { request: Request; env: { WAITLIST?: Parameters<typeof waitlist>[1]['WAITLIST'] } }
export const onRequestPost = ({ request, env }: Ctx) => waitlist(request, env)
export const onRequest = () => json(405, { error: 'Method not allowed' })
