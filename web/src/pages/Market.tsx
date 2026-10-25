import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { PageShell, Notice } from '@/components/page-shell'
import { ListingCard } from '@/components/listing-card'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Category, type Listing } from '@/lib/api'
import { demoListings } from '@/lib/demo'
import { cn } from '@/lib/utils'

const cats: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'digital', label: 'Digital' }, { id: 'collectible', label: 'Collectibles' },
  { id: 'onchain', label: 'On-chain' }, { id: 'other', label: 'Digital property' },
]
type Sort = 'new' | 'low' | 'high'

export default function Market() {
  const [params, setParams] = useSearchParams()
  const category = (params.get('category') as Category | null) ?? undefined
  const [q, setQ] = useState(params.get('q') ?? '')
  const [sort, setSort] = useState<Sort>('new')
  const [items, setItems] = useState<Listing[] | null>(null)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const query = params.get('q') ?? undefined
    let live = true
    setItems(null)
    api.listings({ category, q: query, limit: 80 })
      .then((r) => { if (live) { setItems(r); setOffline(false) } })
      .catch(() => {
        if (!live) return
        setOffline(true)
        setItems(demoListings.filter((l) => (!category || l.category === category) && (!query || l.title.toLowerCase().includes(query.toLowerCase()))))
      })
    return () => { live = false }
  }, [category, params])

  const sorted = useMemo(() => {
    if (!items) return null
    const copy = [...items]
    if (sort === 'low') copy.sort((a, b) => a.price_usd_cents - b.price_usd_cents)
    if (sort === 'high') copy.sort((a, b) => b.price_usd_cents - a.price_usd_cents)
    return copy
  }, [items, sort])

  const set = (k: string, v?: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v); else next.delete(k)
    setParams(next, { replace: true })
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="eyebrow">Market</span>
          <h1 className="mt-4 text-[34px] leading-tight tracking-[-0.025em] text-fg sm:text-[42px]">Works, sealed <span className="text-stone">until sold.</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">Public listings only. Buyers and offers are never shown.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); set('q', q.trim() || undefined) }} className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={70} placeholder="Search titles"
            className="h-10 w-full rounded-full border bg-card pl-9 pr-4 text-sm text-fg outline-none placeholder:text-fg/35 focus:border-signal/50" />
        </form>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex flex-wrap gap-1.5">
          {cats.map((c) => {
            const on = (c.id === 'all' && !category) || c.id === category
            return (
              <button key={c.id} onClick={() => set('category', c.id === 'all' ? undefined : c.id)}
                className={cn('rounded-full px-3.5 py-1.5 text-[13px] transition', on ? 'bg-fg text-paper' : 'bg-fg/[0.04] text-fg/70 hover:text-fg')}>
                {c.label}
              </button>
            )
          })}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort"
          className="h-8 rounded-full border bg-card px-3 text-[13px] text-fg/80 outline-none">
          <option value="new">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option>
        </select>
      </div>

      {offline && <div className="mt-6"><Notice>The API is not reachable, so these are <b>preview listings</b> and can't be bought. Start the API and worker (<code className="font-mono text-signal">npm run api</code>, <code className="font-mono text-signal">npm run worker</code>) to see the live market.</Notice></div>}

      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
        {!sorted && Array.from({ length: 8 }, (_, i) => (
          <div key={i}><Skeleton className="aspect-[4/5] rounded-xl" /><Skeleton className="mt-3 h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/3" /></div>
        ))}
        {sorted?.map((l) => <ListingCard key={l.id} listing={l} demo={offline} />)}
      </div>
      {sorted?.length === 0 && (
        <div className="py-24 text-center">
          <p className="dot-display text-3xl text-fg">Nothing here yet.</p>
          <p className="mt-2 text-sm text-muted-foreground">Try another category, or be the first to list.</p>
        </div>
      )}
    </PageShell>
  )
}
