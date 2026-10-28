import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { BadgeCheck, Check, Copy, Download, FileSignature, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell, Notice } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api, type OrderStatus, type Payment } from '@/lib/api'
import { sentence, statusTone, usd } from '@/lib/format'
import { loadReceipt, saveReceipt } from '@/lib/receipts'
import { cn } from '@/lib/utils'
import { openPurchasedCapsule } from '@/lib/vault'
import { Fingerprint, useVault, VaultGate } from '@/components/vault'
import { EvidencePanel } from '@/components/evidence'
import { PaymentRequest } from '@/components/payment-request'

const stages = ['awaiting_payment', 'funded', 'verified', 'paid'] as const

function Copyable({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className="rounded-xl bg-fg/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-fg/45">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className={cn('min-w-0 break-all text-[13px] text-fg', mono && 'font-mono')}>{value}</p>
        <button aria-label={`Copy ${label}`} className="shrink-0 text-fg/50 hover:text-fg" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200) }}>
          {done ? <Check className="size-4 text-signal" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  )
}

async function sha256Hex(blob: Blob) {
  const d = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function Order() {
  const { id = '' } = useParams()
  const loc = useLocation() as { state?: { receiptCode?: string; fresh?: boolean } }
  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [receipt, setReceipt] = useState(loc.state?.receiptCode ?? loadReceipt(id))
  const [verified, setVerified] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [proof, setProof] = useState<Record<string, unknown> | null>(null)
  const [proofValid, setProofValid] = useState<boolean | null>(null)
  const [mode, setMode] = useState<string>('')
  const [autopay, setAutopay] = useState<number | null>(null)
  useEffect(() => { api.health().then((h) => { setMode(h.mode); setAutopay(h.demoAutopaySeconds ?? null) }).catch(() => {}) }, [])

  const fetchProof = async () => {
    try { const p = await api.proof(id, receipt); setProof(p); setProofValid((await api.verifyProof(p)).valid) }
    catch (e) { toast.error((e as Error).message) }
  }

  const load = useCallback(async () => {
    try {
      const o = await api.order(id); setOrder(o)
      if (o.status === 'awaiting_payment' && !payment) setPayment((await api.orderPayment(id)).payment)
    } catch (e) { toast.error((e as Error).message) }
  }, [id, payment])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!order || !['awaiting_payment', 'funded'].includes(order.status)) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [order, load])

  const vault = useVault()
  const [steps, setSteps] = useState<string[]>([])
  const [seller, setSeller] = useState<{ fingerprint: string; pin: string } | null>(null)
  const capsule = order?.crypto_mode === 'capsule-v1'
  const save = (blob: Blob, name: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href) }
  const decrypt = async () => {
    if (!order || !receipt || !vault.identity) return
    setBusy(true); setSteps([])
    const done = (s: string) => setSteps((x) => [...x, s])
    try {
      const { envelope } = await api.keyEnvelope(id, receipt); done('Released key envelope received')
      const f = await api.download(order.listing_id, receipt)
      const ciphertext = new Uint8Array(await f.blob.arrayBuffer())
      const digest = await sha256Hex(f.blob)
      if (order.file_sha256 && digest !== order.file_sha256.toLowerCase()) throw new Error('Ciphertext checksum mismatch. Do not accept; open a dispute.')
      done('Ciphertext matches the SHA-256 snapshotted at checkout')
      const opened = await openPurchasedCapsule(vault.identity, order.listing_id, envelope, ciphertext)
      done("Envelope signature verified against the seller's published key")
      done(`Decrypted locally · plaintext SHA-256 ${String(opened.metadata.sha256).slice(0, 16)}… verified`)
      setSeller({ fingerprint: opened.seller.fingerprint, pin: opened.pin.status })
      save(new Blob([opened.bytes.slice()], { type: String(opened.metadata.mime) }), String(opened.metadata.name))
      setVerified(digest)
      await release(digest)
    } catch (e) { setVerified(null); toast.error((e as Error).message || 'Decryption failed') } finally { setBusy(false) }
  }
  const download = async () => {
    if (!order || !receipt) return toast.error('Enter your receipt code first')
    if (capsule) return decrypt()
    setBusy(true)
    try {
      const f = await api.download(order.listing_id, receipt)
      const digest = await sha256Hex(f.blob)
      const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; a.click(); URL.revokeObjectURL(a.href)
      if (order.file_sha256 && digest !== order.file_sha256.toLowerCase()) { setVerified(null); toast.error('Checksum mismatch. Do not accept this delivery; open a dispute.') }
      else { setVerified(digest); await release(digest) }
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  /** Instant release: a matching fingerprint completes the order straight away. */
  const release = async (digest: string) => {
    if (order?.status !== 'funded') return
    try { await api.confirmDelivery(id, receipt, digest); toast.success('Verified and released. The seller is paid and your receipt is signed.'); await load() }
    catch (e) { toast.error(`Verified, but release failed: ${(e as Error).message}. You can retry with Accept.`) }
  }
  const accept = async () => {
    if (!verified) return
    setBusy(true)
    try { await release(verified) } finally { setBusy(false) }
  }
  const dispute = async () => {
    setBusy(true)
    try { await api.dispute(id, reason); setDisputeOpen(false); toast.success('Dispute opened. Funds stay on hold.'); await load() }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const renew = async () => {
    try { const r = await api.renewReceipt(id); setReceipt(r.receiptCode); saveReceipt(id, r.receiptCode); toast.success('New receipt code issued. The old one no longer works.') }
    catch (e) { toast.error((e as Error).message) }
  }

  if (!order) return <PageShell><Skeleton className="h-10 w-1/2" /><Skeleton className="mt-6 h-64" /></PageShell>

  const stageIndex = order.status === 'paid' ? 3 : verified ? 2 : ['funded', 'disputed'].includes(order.status) ? 1 : 0
  const received = Number(order.received_zat) / 1e8

  return (
    <PageShell>
      <Link to="/studio?tab=purchases" className="text-[13px] text-fg/60 hover:text-fg">← Purchases</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-fg/45">Order {order.id.slice(0, 8)}</p>
          <h1 className="mt-1 text-[30px] tracking-[-0.02em] text-fg">{order.title}</h1>
        </div>
        <p className={cn('text-sm', statusTone[order.status])}>{sentence(order.status)} · <span className="font-mono text-fg">{usd(order.price_usd_cents)}</span></p>
      </div>

      <ol className="mt-8 grid grid-cols-4 gap-2">
        {stages.map((s, i) => (
          <li key={s}>
            <div className={cn('h-1 rounded-full', i <= stageIndex ? 'bg-signal' : 'bg-fg/10')} />
            <p className={cn('mt-2 text-[12px]', i <= stageIndex ? 'text-fg' : 'text-fg/40')}>{['Awaiting payment', 'Funded', 'Verified', 'Accepted'][i]}</p>
          </li>
        ))}
      </ol>

      {loc.state?.fresh && receipt && (
        <div className="mt-8"><Notice><b>Save your receipt code now.</b> It authorizes the download and any refund, and we only show it once: <span className="font-mono text-signal">{receipt}</span></Notice></div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          {order.status === 'awaiting_payment' && payment ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg text-fg">Send payment</h2>
                {(mode === 'mock' || mode === 'demo') && <span className="rounded-full bg-signal/10 px-2.5 py-0.5 font-mono text-[10.5px] text-signal">MOCK · no blockchain transaction</span>}
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">Send exactly this amount, with the memo, from a testnet shielded wallet. This page updates by itself.</p>
              <PaymentRequest uri={payment.uri} expiresAt={payment.expiresAt ?? order.expires_at} mode={mode} />
              <div className="mt-5 space-y-2">
                <Copyable label="Amount" value={`${payment.amountZec} ZEC`} />
                <Copyable label={mode === 'mock' || mode === 'demo' ? 'Address (single-use, mock)' : 'Address (single-use)'} value={payment.address} />
                <Copyable label="Memo" value={payment.memo} />
                <Copyable label="ZIP-321 URI" value={payment.uri} />
              </div>
              <p className="mt-4 text-[12px] text-fg/50">Received {received.toFixed(8)} ZEC · {order.confirmations} confirmations · expires {new Date(order.expires_at).toLocaleTimeString()}</p>
              {(mode === 'mock' || mode === 'demo') && autopay && <p className="mt-3 rounded-lg bg-signal/10 px-3 py-2 text-[12.5px] text-fg">Demo mode: this payment is simulated automatically within about {autopay + 10} seconds. No real ZEC is involved.</p>}
              {mode === 'mock' && !autopay && <p className="mt-2 font-mono text-[11px] text-fg/45">Local demo: <span className="select-all text-fg/70">npm run mock:pay -- {payment.memo}</span></p>}
            </>
          ) : ['funded', 'disputed', 'paid'].includes(order.status) ? (
            <>
              <h2 className="text-lg text-fg">Delivery</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Download the file. We hash it in your browser and compare the result with the SHA-256 recorded when you bought it.</p>
              <div className="mt-5 space-y-3">
                <Input className="h-11 font-mono" placeholder="RCT-…" value={receipt} onChange={(e) => setReceipt(e.target.value.trim())} aria-label="Receipt code" />
                {capsule && <VaultGate vault={vault} purpose="decrypt this capsule" />}
                <Button className="h-11 w-full" disabled={busy || !receipt || (capsule && !vault.identity)} onClick={download}><Download className="size-4" />{capsule ? 'Decrypt locally & verify' : 'Download & verify'}</Button>
                {steps.length > 0 && (
                  <ol className="space-y-1.5 rounded-xl bg-paper p-3 text-[12.5px] text-fg/75">
                    {steps.map((s) => <li key={s} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700" />{s}</li>)}
                  </ol>
                )}
                {seller && <p className="text-[12px] text-fg/55">Seller key <Fingerprint value={seller.fingerprint} /> {seller.pin === 'changed' ? <b className="text-destructive">differs from the key you trusted before</b> : seller.pin === 'new' ? '(now pinned)' : '(matches your pin)'}</p>}
                {order.file_sha256 && <Copyable label="Expected SHA-256" value={order.file_sha256} />}
                {verified && <p className="flex items-center gap-2 text-[13px] text-emerald-700"><Check className="size-4" />Checksum matches</p>}
              </div>
              {order.status === 'funded' && order.release_after && <EscrowClock until={order.release_after} />}
              {order.status === 'disputed' && order.dispute_due_at && (
                <p className="mt-6 rounded-xl border border-amber-600/25 bg-amber-500/[0.07] px-4 py-3 text-[13px] text-fg/80">Funds are frozen while a reviewer looks at this. A decision is due by <b className="font-medium text-fg">{new Date(order.dispute_due_at).toLocaleString()}</b>: release to the seller or a full refund to you.</p>
              )}
              {order.status === 'funded' && (
                <div className="mt-6 flex gap-3">
                  <Button className="h-11 flex-1" disabled={!verified || busy} onClick={accept}>Accept delivery</Button>
                  <Button variant="outline" className="h-11" onClick={() => setDisputeOpen(true)}><ShieldAlert className="size-4" />Dispute</Button>
                </div>
              )}
              <button onClick={renew} className="mt-4 text-[12px] text-fg/50 hover:text-fg">Lost your code? Issue a new receipt code</button>
              {order.status === 'disputed' && <EvidencePanel orderId={order.id} />}
              {order.status === 'paid' && (
                <div className="mt-6 border-t pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-fg"><FileSignature className="size-4 text-signal" />Signed receipt</p>
                    <Button size="sm" variant="outline" disabled={!receipt} onClick={fetchProof}>{proof ? 'Refresh' : 'Fetch & verify'}</Button>
                  </div>
                  <p className="mt-1 text-[12px] text-fg/55">An Ed25519 attestation of this acquisition. It proves a platform transaction, not legal title.</p>
                  {proofValid !== null && (
                    <p className={cn('mt-3 flex items-center gap-1.5 text-[13px]', proofValid ? 'text-emerald-700' : 'text-destructive')}>
                      <BadgeCheck className="size-4" />{proofValid ? 'Signature valid against the published key' : 'Signature did not verify'}
                    </p>
                  )}
                  {proof && <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-paper p-3 font-mono text-[10.5px] leading-relaxed text-fg/70">{JSON.stringify(proof, null, 2)}</pre>}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This order is {sentence(order.status).toLowerCase()}. {order.status === 'expired' && 'Any late or partial funds can be reclaimed with your receipt code.'}</p>
          )}
        </section>
        <aside className="space-y-3 text-[13px]">
          <div className="rounded-xl border bg-surface p-4">
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-fg/50">Who can see this order</p>
            <ul className="mt-3 space-y-2 text-[12.5px] text-fg/70">
              <li><b className="font-medium text-fg">You:</b> everything here, including the receipt code</li>
              <li><b className="font-medium text-fg">Seller:</b> title, price and status, but not your identity or payment memo</li>
              <li><b className="font-medium text-fg">Operator:</b> price, states and timestamps for settlement</li>
              <li><b className="font-medium text-fg">Outsiders:</b> nothing. <Link to="/observer" className="text-signal">Check it yourself</Link></li>
            </ul>
          </div>
          {[
            ['Funds held', order.funded_at ? new Date(order.funded_at).toLocaleString() : '—'],
            ['Buyer accepted', order.delivery_confirmed_at ? new Date(order.delivery_confirmed_at).toLocaleString() : '—'],
            ['Auto-release', order.release_after && ['funded', 'paid'].includes(order.status) && !order.delivery_confirmed_at && !order.disputed_at ? new Date(order.release_after).toLocaleString() : '—'],
            ['Disputed', order.disputed_at ? new Date(order.disputed_at).toLocaleString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between rounded-xl border px-4 py-3"><span className="text-fg/55">{k}</span><span className="text-fg">{v}</span></div>
          ))}
          <p className="px-1 text-[12px] text-fg/45">Your payment is held in escrow. It goes to the seller when you accept, or automatically when the review window ends without a dispute. A dispute freezes it until a reviewer releases or refunds in full. <Link to="/terms#escrow" className="text-signal">Escrow terms</Link></p>
        </aside>
      </div>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open a dispute</DialogTitle>
            <DialogDescription>Funds stay on hold while an operator reviews it. Say what is wrong in 10–2000 characters.</DialogDescription>
          </DialogHeader>
          <Textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
          <DialogFooter><Button disabled={busy || reason.trim().length < 10} onClick={dispute}>Open dispute</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}

/** Live countdown to the automatic release of a funded order. */
function EscrowClock({ until }: { until: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  const left = Math.max(0, Date.parse(until) - now), s = Math.floor(left / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const text = d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, '0')}s`
  return (
    <div className="mt-6 rounded-xl border border-signal/25 bg-signal/[0.06] px-4 py-3 text-[13px] text-fg/80">
      <p className="flex items-center justify-between gap-3"><span className="font-medium text-fg">Held in escrow</span><span className="font-mono text-fg">{left ? `auto-release in ${text}` : 'releasing…'}</span></p>
      <p className="mt-1">Decrypt and verify the file: if its fingerprint matches, payment releases to the seller instantly. If you don't open it, payment releases automatically when this reaches zero. A mismatch blocks release; open a dispute to freeze the funds.</p>
    </div>
  )
}
