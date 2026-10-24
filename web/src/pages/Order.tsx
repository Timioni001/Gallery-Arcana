import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Check, Copy, Download, ShieldAlert } from 'lucide-react'
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

const stages = ['awaiting_payment', 'funded', 'verified', 'paid'] as const

function Copyable({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-frost/45">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className={cn('min-w-0 break-all text-[13px] text-frost', mono && 'font-mono')}>{value}</p>
        <button aria-label={`Copy ${label}`} className="shrink-0 text-frost/50 hover:text-frost" onClick={() => { void navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200) }}>
          {done ? <Check className="size-4 text-glacier" /> : <Copy className="size-4" />}
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

  const download = async () => {
    if (!order || !receipt) return toast.error('Enter your receipt code first')
    setBusy(true)
    try {
      const f = await api.download(order.listing_id, receipt)
      const digest = await sha256Hex(f.blob)
      const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; a.click(); URL.revokeObjectURL(a.href)
      if (order.file_sha256 && digest !== order.file_sha256.toLowerCase()) { setVerified(null); toast.error('Checksum mismatch. Do not accept this delivery; open a dispute.') }
      else { setVerified(digest); toast.success('File verified against the snapshotted SHA-256') }
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const accept = async () => {
    if (!verified) return
    setBusy(true)
    try { await api.confirmDelivery(id, receipt, verified); toast.success('Accepted. The seller payout is released and your receipt is signed.'); await load() }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
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
      <Link to="/studio?tab=purchases" className="text-[13px] text-frost/60 hover:text-frost">← Purchases</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-frost/45">Order {order.id.slice(0, 8)}</p>
          <h1 className="mt-1 text-[30px] tracking-[-0.02em] text-frost">{order.title}</h1>
        </div>
        <p className={cn('text-sm', statusTone[order.status])}>{sentence(order.status)} · <span className="font-mono text-frost">{usd(order.price_usd_cents)}</span></p>
      </div>

      <ol className="mt-8 grid grid-cols-4 gap-2">
        {stages.map((s, i) => (
          <li key={s}>
            <div className={cn('h-1 rounded-full', i <= stageIndex ? 'bg-glacier' : 'bg-white/10')} />
            <p className={cn('mt-2 text-[12px]', i <= stageIndex ? 'text-frost' : 'text-frost/40')}>{['Awaiting payment', 'Funded', 'Verified', 'Accepted'][i]}</p>
          </li>
        ))}
      </ol>

      {loc.state?.fresh && receipt && (
        <div className="mt-8"><Notice><b>Save your receipt code now.</b> It authorizes the download and any refund, and we only show it once: <span className="font-mono text-glacier">{receipt}</span></Notice></div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          {order.status === 'awaiting_payment' && payment ? (
            <>
              <h2 className="text-lg text-frost">Send payment</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Send exactly this amount, with the memo, from a testnet shielded wallet. This page updates by itself.</p>
              <div className="mt-5 space-y-2">
                <Copyable label="Amount" value={`${payment.amountZec} ZEC`} />
                <Copyable label="Address (single-use, mock)" value={payment.address} />
                <Copyable label="Memo" value={payment.memo} />
                <Copyable label="ZIP-321 URI" value={payment.uri} />
              </div>
              <p className="mt-4 text-[12px] text-frost/50">Received {received.toFixed(8)} ZEC · {order.confirmations} confirmations · expires {new Date(order.expires_at).toLocaleTimeString()}</p>
            </>
          ) : ['funded', 'disputed', 'paid'].includes(order.status) ? (
            <>
              <h2 className="text-lg text-frost">Delivery</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">Download the file. We hash it in your browser and compare the result with the SHA-256 recorded when you bought it.</p>
              <div className="mt-5 space-y-3">
                <Input className="h-11 font-mono" placeholder="RCT-…" value={receipt} onChange={(e) => setReceipt(e.target.value.trim())} aria-label="Receipt code" />
                <Button className="h-11 w-full" disabled={busy || !receipt} onClick={download}><Download className="size-4" />Download &amp; verify</Button>
                {order.file_sha256 && <Copyable label="Expected SHA-256" value={order.file_sha256} />}
                {verified && <p className="flex items-center gap-2 text-[13px] text-glacier"><Check className="size-4" />Checksum matches</p>}
              </div>
              {order.status === 'funded' && (
                <div className="mt-6 flex gap-3">
                  <Button className="h-11 flex-1" disabled={!verified || busy} onClick={accept}>Accept delivery</Button>
                  <Button variant="outline" className="h-11" onClick={() => setDisputeOpen(true)}><ShieldAlert className="size-4" />Dispute</Button>
                </div>
              )}
              <button onClick={renew} className="mt-4 text-[12px] text-frost/50 hover:text-frost">Lost your code? Issue a new receipt code</button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This order is {sentence(order.status).toLowerCase()}. {order.status === 'expired' && 'Any late or partial funds can be reclaimed with your receipt code.'}</p>
          )}
        </section>
        <aside className="space-y-3 text-[13px]">
          {[
            ['Funds held', order.funded_at ? new Date(order.funded_at).toLocaleString() : '—'],
            ['Buyer accepted', order.delivery_confirmed_at ? new Date(order.delivery_confirmed_at).toLocaleString() : '—'],
            ['Disputed', order.disputed_at ? new Date(order.disputed_at).toLocaleString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between rounded-xl border px-4 py-3"><span className="text-frost/55">{k}</span><span className="text-frost">{v}</span></div>
          ))}
          <p className="px-1 text-[12px] text-frost/45">The seller payout is released only after you accept or a reviewer resolves a dispute. Testnet only: these are mock payments.</p>
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
