import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Gavel, Lock, Maximize2, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell } from '@/components/page-shell'
import { ArtViewer } from '@/components/art-viewer'
import { FRAGMENT_COUNT, fragmentDataUrl } from '@/lib/fragments'
import { countdown, currentLot, myBid, myResults, placeBid, sealedCount, type Lot } from '@/lib/auctions'
import { toCents, usd } from '@/lib/format'
import { cn } from '@/lib/utils'

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

function LotCard({ l, now, onView }: { l: Lot; now: number; onView: () => void }) {
  const f = l.fragment
  const [mine, setMine] = useState(() => myBid(l))
  const [input, setInput] = useState('')
  const left = l.end - now, closing = left < 60_000
  const min = Math.max(l.reserve, (mine ?? 0) + l.increment)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const cents = toCents(input)
    if (cents === null) return toast.error('Enter a dollar amount, like 450')
    if (cents < min) return toast.error(`Minimum sealed bid is ${usd(min)}`)
    placeBid(l, cents); setMine(cents); setInput('')
    toast.success(`Sealed bid of ${usd(cents)} placed on ${f.title}`, { description: 'Nobody sees it. Revealed only to you when the lot closes.' })
  }
  return (
    <article id={`lot-${f.number}`} className="scroll-mt-24 overflow-hidden rounded-2xl border bg-card">
      <button onClick={onView} className="group relative block w-full bg-white" aria-label={`View ${f.title} full screen`}>
        <img src={fragmentDataUrl(f.svg)} alt={`${f.title}, generative artwork ${f.number}`} loading="lazy" className="aspect-square w-full object-contain" />
        <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/60 text-white opacity-80 group-hover:opacity-100"><Maximize2 className="size-4" /></span>
        <span className={cn('absolute left-2 top-2 rounded-full px-2 py-0.5 font-mono text-[11px] text-white', closing ? 'bg-signal' : 'bg-black/70')}>{countdown(left)}</span>
      </button>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate text-[15px] font-medium text-fg"><span className="mr-1.5 font-mono text-[12px] text-fg/45">{f.number}</span>{f.title}</h2>
          <span className="shrink-0 font-mono text-[11px] text-fg/50">Lot {l.round % 1000}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-fg/[0.04] px-2.5 py-2"><dt className="text-fg/50">Reserve</dt><dd className="font-mono text-fg">{usd(l.reserve)}</dd></div>
          <div className="rounded-lg bg-fg/[0.04] px-2.5 py-2"><dt className="flex items-center gap-1 text-fg/50"><Lock className="size-3" />Sealed bids</dt><dd className="font-mono text-fg">{sealedCount(l, now) + (mine ? 1 : 0)}</dd></div>
        </dl>
        {mine && <p className="mt-3 rounded-lg border border-signal/30 bg-signal/[0.06] px-2.5 py-2 text-[12px] text-fg/80">Your sealed bid: <b className="font-mono">{usd(mine)}</b>. You can raise it until close.</p>}
        <form onSubmit={submit} className="mt-3 flex gap-2">
          <label className="sr-only" htmlFor={`bid-${f.number}`}>Bid in US dollars</label>
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg/40">$</span>
            <input id={`bid-${f.number}`} inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} placeholder={String(min / 100)}
              className="h-11 w-full rounded-xl border bg-surface pl-7 pr-3 text-[15px] text-fg outline-none focus:border-signal/60" />
          </div>
          <button className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-fg px-4 text-[13px] font-medium text-surface hover:bg-fg/90"><Gavel className="size-4" />{mine ? 'Raise' : 'Bid'}</button>
        </form>
      </div>
    </article>
  )
}

export default function Auctions() {
  const now = useNow()
  const { hash } = useLocation()
  const [view, setView] = useState<number | null>(null)
  const lots = Array.from({ length: FRAGMENT_COUNT }, (_, i) => currentLot(i, now)).sort((a, b) => a.end - b.end)
  const results = myResults(now)

  // Announce results for rounds that close while the page is open.
  const [seen, setSeen] = useState(() => new Set(results.map((r) => `${r.lot.fragment.index}:${r.lot.round}`)))
  useEffect(() => {
    for (const r of results) {
      const k = `${r.lot.fragment.index}:${r.lot.round}`
      if (seen.has(k)) continue
      setSeen((s) => new Set(s).add(k))
      if (r.result.won) toast.success(`You won ${r.lot.fragment.title}`, { description: `Second-price settlement: you pay ${usd(r.result.pays)}.` })
      else toast(`${r.lot.fragment.title} closed`, { description: `A shielded bidder won at ${usd(r.result.pays)}.` })
    }
  }, [results, seen])

  useEffect(() => { if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 50) }, [hash])

  return (
    <PageShell>
      <span className="eyebrow">Auctions</span>
      <h1 className="mt-4 text-[32px] leading-tight tracking-[-0.025em] text-fg sm:text-[42px]">Sealed bids. <span className="text-stone">No public paddle.</span></h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Every Arcana Fragment is on the block in rolling 12-minute rounds. Bids are sealed: other bidders see only how many there are, never who or how much.
        At close the highest bid wins and pays the <b className="font-medium text-fg">second-highest</b> price, so bidding your true maximum is safe.
      </p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-600/30 bg-amber-500/10 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-fg/70">Simulation · rival bids are generated in your browser · no payment is taken</p>

      {results.length > 0 && (
        <section aria-labelledby="results" className="mt-8 rounded-2xl border bg-surface p-4">
          <h2 id="results" className="flex items-center gap-2 text-[14px] font-medium text-fg"><Trophy className="size-4 text-signal" />Your closed lots</h2>
          <ul className="mt-3 divide-y text-[13px]">
            {results.map(({ lot: l, mine, result }) => (
              <li key={`${l.fragment.index}:${l.round}`} className="flex items-center justify-between gap-3 py-2">
                <button onClick={() => setView(l.fragment.index)} className="truncate text-left text-fg hover:underline">{l.fragment.number} {l.fragment.title}</button>
                <span className={cn('shrink-0 font-mono text-[12px]', result.won ? 'text-emerald-700' : 'text-fg/55')}>
                  {result.won ? `Won · pay ${usd(result.pays)}` : `Outbid · your ${usd(mine)}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {lots.map((l) => <LotCard key={`${l.fragment.index}:${l.round}`} l={l} now={now} onView={() => setView(l.fragment.index)} />)}
      </div>
      {view !== null && <ArtViewer index={view} onIndex={setView} onClose={() => setView(null)} />}
    </PageShell>
  )
}
