import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Gavel, X } from 'lucide-react'
import { FRAGMENT_COUNT, fragment, fragmentDataUrl } from '@/lib/fragments'
import { usd } from '@/lib/format'

/** Full-screen viewer for one Arcana Fragment. Arrow keys / swipe to browse, Esc to close. */
export function ArtViewer({ index, onIndex, onClose }: { index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const f = fragment(index)
  const go = (d: number) => onIndex((index + d + FRAGMENT_COUNT) % FRAGMENT_COUNT)
  const touch = useRef<number | null>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtn.current?.focus()
    return () => { document.body.style.overflow = prev }
  }, [])

  const src = fragmentDataUrl(f.svg)
  return (
    <div role="dialog" aria-modal="true" aria-label={`${f.title}, fragment ${f.number}`} className="fixed inset-0 z-[60] flex flex-col bg-[#0b0b0b]/95 text-white backdrop-blur"
      onTouchStart={(e) => { touch.current = e.touches[0].clientX }}
      onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); touch.current = null }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-[11px] uppercase tracking-wider">
        <span className="truncate"><span className="text-white/50">{f.number} / {String(FRAGMENT_COUNT).padStart(2, '0')}</span> · {f.title}</span>
        <button ref={closeBtn} onClick={onClose} aria-label="Close viewer" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 hover:bg-white/20"><X className="size-5" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
        <button onClick={() => go(-1)} aria-label="Previous artwork" className="absolute left-2 z-10 hidden size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid"><ChevronLeft className="size-5" /></button>
        <img src={src} alt={`${f.title}, generative artwork ${f.number}`} className="max-h-full w-auto max-w-full bg-white object-contain shadow-2xl" style={{ aspectRatio: '1' }} />
        <button onClick={() => go(1)} aria-label="Next artwork" className="absolute right-2 z-10 hidden size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20 sm:grid"><ChevronRight className="size-5" /></button>
      </div>
      <div className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] text-white/60">
          <span>C:{f.cmyk[0].toFixed(1)} M:{f.cmyk[1].toFixed(1)} Y:{f.cmyk[2].toFixed(1)} K:{f.cmyk[3].toFixed(1)}</span>
          <span>List price <b className="font-medium text-white">{usd(f.priceUsdCents)}</b> · sealed as a capsule</span>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr_1fr_auto] gap-2 text-[13px] font-medium">
          <button onClick={() => go(-1)} aria-label="Previous artwork" className="grid size-11 place-items-center rounded-xl bg-white/10 sm:hidden"><ChevronLeft className="size-5" /></button>
          <Link to={`/market?q=${encodeURIComponent(f.title)}`} className="flex h-11 items-center justify-center rounded-xl bg-white text-[#0b0b0b] sm:col-start-2">Buy now</Link>
          <Link to={`/auctions#lot-${f.number}`} className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-signal text-white"><Gavel className="size-4" />Bid in auction</Link>
          <button onClick={() => go(1)} aria-label="Next artwork" className="grid size-11 place-items-center rounded-xl bg-white/10 sm:hidden"><ChevronRight className="size-5" /></button>
          <a href={src} download={`arcana-fragment-${f.number}-preview.svg`} aria-label="Download preview" className="hidden size-11 place-items-center rounded-xl bg-white/10 hover:bg-white/20 sm:grid"><Download className="size-4" /></a>
        </div>
      </div>
    </div>
  )
}
