import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Play } from 'lucide-react'
import { PageShell, Notice } from '@/components/page-shell'
import { DotText } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Probes run with credentials omitted, so even a signed-in demonstrator sees
// exactly what an unrelated outsider would.
const probes = [
  { label: 'Public listings', method: 'GET', path: '/api/listings?limit=3', expect: 'visible' },
  { label: 'Every offer on the market', method: 'GET', path: '/api/offers', expect: 'hidden' },
  { label: 'Order history', method: 'GET', path: '/api/orders', expect: 'hidden' },
  { label: 'A seller’s sales', method: 'GET', path: '/api/sales', expect: 'hidden' },
  { label: 'Download a purchased file without a receipt', method: 'POST', path: '/api/files/00000000-0000-4000-8000-000000000000', expect: 'hidden', body: { receiptCode: 'RCT-GUESS-0000-0000' } },
  { label: 'Fetch a signed receipt without its code', method: 'POST', path: '/api/orders/00000000-0000-4000-8000-000000000000/proof', expect: 'hidden', body: { receiptCode: 'RCT-GUESS-0000-0000' } },
] as const

type Result = { status: number; body: string }

export default function Observer() {
  const [results, setResults] = useState<Record<string, Result>>({})
  const [running, setRunning] = useState(false)
  const run = async () => {
    setRunning(true)
    const next: Record<string, Result> = {}
    for (const p of probes) {
      try {
        const res = await fetch(p.path, {
          method: p.method, credentials: 'omit',
          headers: p.method === 'POST' ? { 'X-Arcana-Action': '1', 'Content-Type': 'application/json' } : {},
          body: 'body' in p ? JSON.stringify(p.body) : undefined,
        })
        const text = await res.text()
        next[p.path] = { status: res.status, body: text.length > 600 ? text.slice(0, 600) + '…' : text }
      } catch { next[p.path] = { status: 0, body: 'API unreachable' } }
      setResults({ ...next })
    }
    setRunning(false)
  }
  useEffect(() => { void run() }, [])

  return (
    <PageShell>
      <span className="eyebrow">Observer view</span>
      <h1 className="dot-display mt-5 text-[34px] leading-none text-fg sm:text-[48px]"><DotText>What outsiders see.</DotText></h1>
      <p className="mt-4 max-w-xl text-[15px] text-fg/65">These requests are made live against the API with no session cookie, exactly as an unrelated observer would make them. Anything returned here is public. Everything else is refused.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button className="h-10 rounded-xl" disabled={running} onClick={run}><Play className="size-3.5" />{running ? 'Probing…' : 'Run probes again'}</Button>
        <Link to="/#privacy" className="text-[13px] text-fg/60 hover:text-fg">Read the privacy model →</Link>
      </div>

      <div className="mt-10 divide-y overflow-hidden rounded-2xl border bg-surface">
        {probes.map((p) => {
          const r = results[p.path]
          const visible = r && r.status >= 200 && r.status < 300
          return (
            <details key={p.path} className="group">
              <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr_auto] items-center gap-4 px-5 py-4">
                {visible ? <Eye className="size-4 text-fg/60" /> : <EyeOff className="size-4 text-signal" />}
                <span>
                  <span className="block text-[14px] text-fg">{p.label}</span>
                  <span className="font-mono text-[11px] text-fg/45">{p.method} {p.path.split('?')[0]}</span>
                </span>
                <span className={cn('rounded-full px-2.5 py-0.5 font-mono text-[11px]', !r ? 'bg-muted text-fg/40' : visible ? 'bg-secondary text-fg/70' : 'bg-signal/10 text-signal')}>
                  {!r ? '…' : r.status === 0 ? 'offline' : `${r.status} · ${visible ? 'public' : 'refused'}`}
                </span>
              </summary>
              {r && <pre className="overflow-x-auto border-t bg-paper px-5 py-4 font-mono text-[11px] leading-relaxed text-fg/70">{r.body}</pre>}
            </details>
          )
        })}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Notice>Public listings show the title, price, category, preview and seller alias. They never include buyers, offers, payment addresses or a sales feed. A sold item shows only that it is no longer available.</Notice>
        <Notice>What we still handle: the operator can see prices, offer amounts, order states and timestamps. Shielded ZEC hides onchain payment details, but not this application metadata.</Notice>
      </div>
    </PageShell>
  )
}
