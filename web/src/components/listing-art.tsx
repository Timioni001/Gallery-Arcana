import { previewUrl, type Listing } from '@/lib/api'
import { cn } from '@/lib/utils'

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

/** Seller preview when one exists, otherwise a deterministic cool-toned plate. */
export function ListingArt({ listing, className }: { listing: Pick<Listing, 'id' | 'title' | 'preview_key' | 'category'>; className?: string }) {
  const src = previewUrl(listing.preview_key)
  if (src) return <img src={src} alt="" loading="lazy" className={cn('size-full object-cover', className)} />
  const h = hash(listing.id + listing.title)
  const hue = 195 + (h % 75)
  const x = 20 + (h >> 8) % 60, y = 15 + (h >> 16) % 50
  return (
    <div className={cn('relative size-full overflow-hidden grain', className)}
      style={{ background: `radial-gradient(120% 90% at ${x}% ${y}%, oklch(0.74 0.1 ${hue}) 0%, oklch(0.44 0.07 ${hue + 15}) 45%, oklch(0.2 0.03 250) 100%)` }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-1/2 w-full opacity-70" aria-hidden>
        <path d={`M0 100V${60 + (h % 20)}L${18 + (h % 10)} ${40 + (h >> 4) % 25}L${42 + (h >> 6) % 10} ${62 + (h >> 3) % 15}L${64 + (h >> 9) % 10} ${30 + (h >> 5) % 30}L100 ${55 + (h >> 7) % 25}V100Z`} fill="oklch(0.14 0.015 250 / .85)" />
      </svg>
      <span className="absolute left-3 top-3 font-mono text-[10px] uppercase tracking-widest text-frost/55">{listing.category}</span>
    </div>
  )
}
