import { useMemo } from 'react'
import { cn } from '@/lib/utils'

// Deterministic ridgelines by midpoint displacement, so the scene is identical
// on every render and costs no image bytes.
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}
function ridge(seed: number, base: number, rough: number, peaks: number, w = 1600) {
  const r = rng(seed)
  // A few seeded summits first, then fractal detail between them.
  let pts = Array.from({ length: 9 }, (_, i) => base - peaks * (0.25 + 0.75 * r()) * (i % 2 ? 1 : 0.45))
  let amp = peaks * 0.45
  while (pts.length < 257) {
    const next: number[] = []
    for (let i = 0; i < pts.length - 1; i++) next.push(pts[i], (pts[i] + pts[i + 1]) / 2 + (r() - 0.5) * amp)
    next.push(pts[pts.length - 1])
    pts = next
    amp *= rough
  }
  const step = w / (pts.length - 1)
  return `M0 900V${pts[0].toFixed(1)}` + pts.map((y, i) => `L${(i * step).toFixed(1)} ${y.toFixed(1)}`).join('') + `L${w} 900Z`
}

const stars = (() => { const r = rng(99); return Array.from({ length: 70 }, () => [r() * 1600, r() * 380, r()]) })()

const layers = [
  { seed: 7, base: 600, rough: 0.55, peaks: 300, fill: 'oklch(0.56 0.04 240)', rim: 'oklch(0.92 0.03 220 / .55)' },
  { seed: 19, base: 660, rough: 0.53, peaks: 210, fill: 'oklch(0.42 0.04 245)', rim: 'oklch(0.85 0.04 220 / .3)' },
  { seed: 41, base: 720, rough: 0.5, peaks: 150, fill: 'oklch(0.3 0.032 250)', rim: 'oklch(0.8 0.04 225 / .18)' },
  { seed: 83, base: 790, rough: 0.48, peaks: 110, fill: 'oklch(0.2 0.022 250)', rim: 'transparent' },
  { seed: 5, base: 880, rough: 0.46, peaks: 70, fill: 'oklch(0.13 0.012 250)', rim: 'transparent' },
]

export function Landscape({ className, variant = 'dusk' }: { className?: string; variant?: 'dusk' | 'night' }) {
  const paths = useMemo(() => layers.map((l) => ridge(l.seed, l.base, l.rough, l.peaks)), [])
  const sky = variant === 'dusk'
    ? ['oklch(0.2 0.035 260)', 'oklch(0.36 0.05 245)', 'oklch(0.7 0.06 220)', 'oklch(0.86 0.05 80)']
    : ['oklch(0.12 0.02 260)', 'oklch(0.18 0.03 255)', 'oklch(0.3 0.04 240)', 'oklch(0.42 0.04 230)']
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" className={cn('h-full w-full', className)} aria-hidden>
      <defs>
        <linearGradient id={`sky-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset=".45" stopColor={sky[1]} />
          <stop offset=".72" stopColor={sky[2]} />
          <stop offset=".86" stopColor={sky[3]} />
        </linearGradient>
        <radialGradient id={`sun-${variant}`} cx=".66" cy=".5" r=".42">
          <stop offset="0" stopColor="oklch(0.95 0.06 85)" stopOpacity={variant === 'dusk' ? 0.55 : 0.12} />
          <stop offset="1" stopColor="oklch(0.95 0.06 85)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.85 0.04 225)" stopOpacity="0" />
          <stop offset="1" stopColor="oklch(0.85 0.04 225)" stopOpacity=".22" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill={`url(#sky-${variant})`} />
      <rect width="1600" height="900" fill={`url(#sun-${variant})`} />
      {stars.map(([x, y, o], i) => <circle key={i} cx={x} cy={y} r={o > 0.8 ? 1.3 : 0.8} fill="white" opacity={(variant === 'night' ? 0.7 : 0.35) * o} />)}
      {paths.map((d, i) => (
        <g key={i}>
          <path d={d} fill={layers[i].fill} stroke={layers[i].rim} strokeWidth="1.2" />
          {i < paths.length - 1 && <rect y={layers[i].base - 40} width="1600" height="220" fill="url(#haze)" opacity={0.9 - i * 0.18} />}
        </g>
      ))}
    </svg>
  )
}
