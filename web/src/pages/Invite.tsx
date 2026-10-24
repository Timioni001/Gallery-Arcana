import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Lock, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell, Notice } from '@/components/page-shell'
import { DotText } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { usd } from '@/lib/format'
import { saveReceipt } from '@/lib/receipts'
import { useSession } from '@/lib/session'
import { useVault, VaultGate } from '@/components/vault'

type Invite = { id: string; listing_id: string; title: string; price_usd_cents: number | null; expires_at: string; crypto_mode: string }

/** Private-sale landing. The capability travels in the URL fragment, so it never reaches server logs or referrers. */
export default function InvitePage() {
  const { id = '' } = useParams()
  const capability = window.location.hash.slice(1)
  const { account, ready } = useSession()
  const nav = useNavigate()
  const vault = useVault()
  const [invite, setInvite] = useState<Invite | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    if (!account) return
    api.inspectInvitation(id, capability).then(async (r) => { const inv = r as unknown as Invite; setInvite(inv.price_usd_cents == null ? { ...inv, price_usd_cents: (await api.listing(inv.listing_id)).price_usd_cents } : inv) }).catch(() => setError('This invitation is invalid, expired, revoked, already used, or meant for someone else.'))
  }, [account, id, capability])

  const capsule = invite?.crypto_mode === 'capsule-v1'
  const redeem = async () => {
    setBusy(true)
    try { const r = await api.redeemInvitation(id, capability); saveReceipt(r.orderId, r.receiptCode); nav(`/orders/${r.orderId}`, { state: { receiptCode: r.receiptCode, fresh: true } }) }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const request = async () => {
    if (!invite) return
    setBusy(true)
    try { await api.offer(invite.listing_id, invite.price_usd_cents ?? 0, { id, capability }); setRequested(true); toast.success('Request sent. The seller seals your key, then you can redeem.') }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-lg py-6">
        <span className="eyebrow"><Ticket className="size-3" />Private invitation</span>
        <h1 className="dot-display mt-5 text-[34px] leading-none text-fg"><DotText>For your eyes.</DotText></h1>
        {ready && !account && <div className="mt-8"><Notice><Link className="text-signal" to={`/auth?next=${encodeURIComponent(`/invite/${id}#${capability}`)}`}>Sign in or create an alias</Link> to open this invitation. It may be restricted to one account.</Notice></div>}
        {error && <p className="mt-8 text-[14px] text-destructive">{error}</p>}
        {account && !invite && !error && <Skeleton className="mt-8 h-40 rounded-2xl" />}
        {invite && (
          <div className="mt-8 rounded-2xl border bg-card p-6">
            <p className="text-[20px] text-fg">{invite.title}</p>
            <p className="mt-1 text-[13px] text-fg/55">Expires {new Date(invite.expires_at).toLocaleString()} · one use only</p>
            {invite.price_usd_cents != null && <p className="mt-5 font-mono text-[26px] text-fg">{usd(invite.price_usd_cents)}</p>}
            {capsule && <p className="mt-3 flex items-center gap-1.5 text-[13px] text-fg/65"><Lock className="size-3.5 text-signal" />Arcana Capsule. The seller seals a key to your fingerprint before you redeem.</p>}
            <div className="mt-6 space-y-3">
              {capsule && <VaultGate vault={vault} purpose="receive the capsule key" />}
              {capsule && !requested && <Button variant="outline" className="h-11 w-full" disabled={busy || !vault.identity} onClick={request}>Request capsule key</Button>}
              <Button className="h-11 w-full" disabled={busy || (capsule && !vault.identity)} onClick={redeem}>Redeem &amp; check out</Button>
              {capsule && <p className="text-[12px] text-fg/50">Redeeming before the seller seals your key returns an error. Nothing is charged.</p>}
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
