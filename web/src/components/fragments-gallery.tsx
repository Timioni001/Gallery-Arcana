import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArtViewer } from './art-viewer'
import { FRAGMENT_COUNT, fragment, fragmentDataUrl } from '@/lib/fragments'
import { usd } from '@/lib/format'

const INK = ['#00AEEF', '#EC008C', '#FFE11A', '#3a3a3a']

/** Dark 5×3 sheet of the generative collection, each piece sold as a capsule. */
export function FragmentsGallery() {
  const items = useMemo(() => Array.from({ length: FRAGMENT_COUNT }, (_, i) => fragment(i)), [])
  const [view, setView] = useState<number | null>(null)
  return (
    <section id="collection" className="mt-28 scroll-mt-16 bg-[#0b0b0b] px-4 py-14 text-white sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.18em] text-white/80">
          <span className="text-white">Arcana Fragments</span>
          <span className="hidden h-px flex-1 bg-white/25 sm:block" />
          <span className="hidden sm:inline">A collection of 15 generative works · sealed as capsules</span>
          <span className="hidden h-px flex-1 bg-white/25 md:block" />
          <span className="text-white/60">Edition 001 · 5 × 3</span>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((f) => {
            const total = f.cmyk.reduce((a, b) => a + b, 0) || 1
            return (
              <button key={f.number} onClick={() => setView(f.index)} aria-label={`View ${f.title} full screen`} className="group block text-left">
                <div className="flex items-baseline justify-between gap-2 font-mono text-[10.5px] uppercase tracking-wider text-white/85">
                  <span><span className="mr-2 text-white">{f.number}</span>{f.title}</span>
                  <span className="text-white/60">{usd(f.priceUsdCents)}</span>
                </div>
                <img src={fragmentDataUrl(f.svg)} alt={`${f.title}, generative artwork ${f.number}`} loading="lazy" className="mt-2 aspect-square w-full bg-white transition duration-300 group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_30px_-10px_rgba(255,255,255,0.25)]" />
                <div className="mt-2 flex h-2 w-full overflow-hidden border border-white/30">
                  {f.cmyk.map((v, i) => <span key={i} style={{ width: `${(v / total) * 100}%`, background: INK[i] }} />)}
                </div>
                <p className="mt-1.5 font-mono text-[10px] tracking-wide text-white/60">C:{f.cmyk[0].toFixed(1)} M:{f.cmyk[1].toFixed(1)} Y:{f.cmyk[2].toFixed(1)} K:{f.cmyk[3].toFixed(1)}</p>
              </button>
            )
          })}
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3 text-[13px] font-medium">
          <Link to="/auctions" className="rounded-xl bg-signal px-5 py-3 text-white hover:brightness-110">Bid in sealed auctions</Link>
          <Link to="/market" className="rounded-xl border border-white/30 px-5 py-3 text-white hover:bg-white/10">Browse the market</Link>
        </div>
        <div className="mt-12 flex items-center gap-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-white/55">
          <span className="h-px flex-1 bg-white/20" />
          <span className="text-center">Fifteen algorithmic explorations · encrypted before upload · keys sealed to one buyer</span>
          <span className="h-px flex-1 bg-white/20" />
        </div>
      </div>
      {view !== null && <ArtViewer index={view} onIndex={setView} onClose={() => setView(null)} />}
    </section>
  )
}
