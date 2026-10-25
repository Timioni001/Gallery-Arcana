import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type Shape = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

/**
 * Dot-matrix renderer: paints a grayscale shape offscreen, then redraws it as a
 * grid of dots sized by darkness. Edges erode randomly so figures dissolve
 * into scattered pixels instead of ending on a hard line.
 */
export function Halftone({ shape, className, step = 7, seed = 1, erode = 0.35, square = false }: {
  shape: Shape; className?: string; step?: number; seed?: number; erode?: number; square?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = width * dpr; canvas.height = height * dpr
      const off = document.createElement('canvas')
      off.width = Math.ceil(width); off.height = Math.ceil(height)
      const o = off.getContext('2d', { willReadFrequently: true })!
      o.fillStyle = '#fff'; o.fillRect(0, 0, off.width, off.height)
      shape(o, off.width, off.height)
      const px = o.getImageData(0, 0, off.width, off.height).data
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      ctx.fillStyle = getComputedStyle(canvas).color
      const r = rng(seed)
      for (let y = step / 2; y < height; y += step) {
        for (let x = step / 2; x < width; x += step) {
          const i = (Math.floor(y) * off.width + Math.floor(x)) * 4
          const v = 1 - px[i] / 255
          // Dark areas keep every dot; mid-tones thin out faster as erode rises.
          if (v < 0.04 || r() > Math.min(1, v / 0.55) ** (1 + 4 * erode)) continue
          const s = Math.max(1, step * 0.82 * Math.sqrt(v))
          if (square) ctx.fillRect(x - s / 2, y - s / 2, s, s)
          else { ctx.beginPath(); ctx.arc(x, y, s / 2, 0, Math.PI * 2); ctx.fill() }
        }
      }
      // A few stray pixels around the figure, like dust off a dot-matrix print.
      for (let k = 0; k < (width * height) / 9000; k++) {
        const x = r() * width, y = r() * height
        const i = (Math.floor(y) * off.width + Math.floor(x)) * 4
        if (px[i] < 250 || r() < 0.3) ctx.fillRect(x, y, step * 0.35, step * 0.35)
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [shape, step, seed, erode, square])
  return <canvas ref={ref} className={cn('block size-full text-fg', className)} aria-hidden />
}

/** Shaded padlock, lit from the upper left. */
export const padlock: Shape = (c, w, h) => {
  const s = Math.min(w, h)
  const cx = w / 2, top = h / 2 - s * 0.4
  c.lineWidth = s * 0.1; c.strokeStyle = '#333'
  c.beginPath(); c.arc(cx, top + s * 0.28, s * 0.2, Math.PI, 0); c.lineTo(cx + s * 0.2, top + s * 0.42); c.moveTo(cx - s * 0.2, top + s * 0.28); c.lineTo(cx - s * 0.2, top + s * 0.42); c.stroke()
  const g = c.createLinearGradient(cx - s * 0.32, 0, cx + s * 0.32, 0)
  g.addColorStop(0, '#888'); g.addColorStop(0.35, '#222'); g.addColorStop(1, '#000')
  c.fillStyle = g; c.beginPath(); c.roundRect(cx - s * 0.33, top + s * 0.4, s * 0.66, s * 0.5, s * 0.06); c.fill()
  c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, top + s * 0.6, s * 0.055, 0, Math.PI * 2); c.fill()
  c.fillRect(cx - s * 0.02, top + s * 0.6, s * 0.04, s * 0.14)
}

/** Lit sphere with a soft terminator, the "globe" of observers. */
export const sphere: Shape = (c, w, h) => {
  const s = Math.min(w, h) * 0.42
  const g = c.createRadialGradient(w / 2 - s * 0.45, h / 2 - s * 0.45, s * 0.05, w / 2, h / 2, s)
  g.addColorStop(0, '#f4f4f4'); g.addColorStop(0.5, '#777'); g.addColorStop(1, '#111')
  c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, s, 0, Math.PI * 2); c.fill()
}

/** Two blocks reaching for each other across a gap — buyer and seller. */
export const reach: Shape = (c, w, h) => {
  const g1 = c.createLinearGradient(0, 0, w * 0.45, 0); g1.addColorStop(0, '#bbb'); g1.addColorStop(1, '#111')
  const g2 = c.createLinearGradient(w, 0, w * 0.55, 0); g2.addColorStop(0, '#bbb'); g2.addColorStop(1, '#111')
  c.fillStyle = g1; c.beginPath(); c.roundRect(-20, h * 0.36, w * 0.43, h * 0.28, h * 0.14); c.fill()
  c.fillStyle = g2; c.beginPath(); c.roundRect(w * 0.57, h * 0.36, w * 0.5, h * 0.28, h * 0.14); c.fill()
}
