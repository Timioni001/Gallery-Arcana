import { useMemo } from 'react'
import { previewUrl, type Listing } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Halftone, type Shape } from './halftone'

function hash(s: string) {
  let h = 2166136261
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return h >>> 0
}

// Seeded plates so every listing without a preview still gets its own figure.
const plates: ((h: number) => Shape)[] = [
  (h) => (c, w, ht) => { const g = c.createRadialGradient(w * .35, ht * .35, 4, w / 2, ht / 2, w * .42); g.addColorStop(0, '#eee'); g.addColorStop(1, '#111'); c.fillStyle = g; c.beginPath(); c.arc(w / 2, ht * (.42 + (h % 20) / 100), w * .32, 0, 7); c.fill() },
  (h) => (c, w, ht) => { const g = c.createLinearGradient(0, ht * .2, 0, ht); g.addColorStop(0, '#999'); g.addColorStop(1, '#000'); c.fillStyle = g; c.beginPath(); c.moveTo(w * .18, ht); c.lineTo(w * .18, ht * .45); c.arc(w / 2, ht * .45, w * .32, Math.PI, 0); c.lineTo(w * .82, ht); c.fill(); c.fillStyle = '#fff'; c.fillRect(w * (.4 + (h % 10) / 100), ht * .62, w * .12, ht * .4) },
  (h) => (c, w, ht) => { for (let i = 0; i < 4; i++) { c.fillStyle = `rgb(${40 + i * 45},${40 + i * 45},${40 + i * 45})`; c.beginPath(); c.roundRect(w * (.16 + i * .05), ht * (.22 + i * .15), w * (.6 - (h >> i) % 3 * .06), ht * .12, 10); c.fill() } },
  (h) => (c, w, ht) => { const g = c.createLinearGradient(0, ht * .3, 0, ht); g.addColorStop(0, '#666'); g.addColorStop(1, '#000'); c.fillStyle = g; c.beginPath(); c.moveTo(0, ht); for (let i = 0; i <= 8; i++) c.lineTo(w * i / 8, ht * (.45 + (((h >> (i * 3)) & 7) / 7) * .3)); c.lineTo(w, ht); c.fill() },
]

/** Seller preview when one exists, otherwise a deterministic dot-matrix plate. */
export function ListingArt({ listing, className }: { listing: Pick<Listing, 'id' | 'title' | 'preview_key' | 'category'>; className?: string }) {
  const src = previewUrl(listing.preview_key)
  const h = hash(listing.id + listing.title)
  const shape = useMemo(() => plates[h % plates.length](h), [h])
  if (src) return <img src={src} alt="" loading="lazy" className={cn('size-full bg-white object-contain', className)} />
  return (
    <div className={cn('relative size-full bg-surface', className)}>
      <Halftone shape={shape} step={6} seed={h} erode={0.4} square={h % 3 === 0} />
      <span className="absolute left-3 top-3 rounded-full border border-fg/20 bg-surface px-2 font-mono text-[10px] uppercase tracking-wider text-fg/60">{listing.category}</span>
    </div>
  )
}
