// "Arcana Fragments": fifteen seeded generative works in a CMYK dot-matrix
// language. Each returns a standalone SVG string so the same bytes can be shown
// as a preview and sealed inside a capsule as the original.

const C = '#00AEEF', M = '#EC008C', Y = '#FFE11A', K = '#141414', G = '#BDBDBD', P = '#F7B6D9'

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]
const sq = (x: number, y: number, s: number, f: string) => `<rect x="${(x - s / 2).toFixed(1)}" y="${(y - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${f}"/>`
const dot = (x: number, y: number, rr: number, f: string) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(2)}" fill="${f}"/>`
const gauss = (r: () => number) => (r() + r() + r() + r() - 2) / 2

type Gen = (r: () => number) => string
const gens: Gen[] = [
  // 01 Cipher Grid
  (r) => { let s = ''; for (let i = 0; i < 14; i++) for (let j = 0; j < 14; j++) { const x = 30 + i * 10.8, y = 30 + j * 10.8, k = r(); s += k < .35 ? sq(x, y, 6.5, C) : k < .55 ? sq(x, y, 6.5, K) : k < .7 ? sq(x, y, 5, G) : k < .82 ? `<path d="M${x - 3} ${y - 3}l6 6m0-6l-6 6" stroke="${C}" stroke-width="1.6"/>` : dot(x, y, 1.2, K) } return s },
  // 02 Noise Field
  (r) => { let s = ''; for (let i = 0; i < 900; i++) { const x = 100 + gauss(r) * 70, y = 100 + gauss(r) * 70, d = Math.hypot(x - 110, y - 105); s += sq(x, y, 1.5 + r() * 2.5, d < 35 && r() < .8 ? M : d < 60 && r() < .4 ? P : pick(r, [G, G, K])) } return s },
  // 03 Orbit Ledger
  (r) => { let s = `<line x1="100" y1="20" x2="100" y2="180" stroke="${K}" stroke-width=".8"/>`; for (let k = 1; k <= 5; k++) s += `<circle cx="100" cy="100" r="${18 + k * 14}" fill="none" stroke="${K}" stroke-width=".9" stroke-dasharray="1 3"/>`; s += dot(100, 100, 17, C); for (let k = 0; k < 4; k++) { const a = r() * 6.28, rad = 32 + Math.floor(r() * 5) * 14; s += dot(100 + Math.cos(a) * rad, 100 + Math.sin(a) * rad, 3 + r() * 3, pick(r, [Y, M, M, Y])) } return s },
  // 04 Block Vault
  (r) => { let s = ''; for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) { const x = 28 + i * 21, y = 28 + j * 21, k = r(); if (k < .3) s += `<rect x="${x}" y="${y}" width="19" height="19" fill="${K}"/>`; else if (k < .5) s += `<rect x="${x}" y="${y}" width="19" height="19" fill="${Y}"/>`; else if (k < .8) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) s += dot(x + 2 + a * 3.8, y + 2 + b * 3.8, .9, k < .65 ? K : '#8a8a8a') } return s },
  // 05 Vertical Cipher
  (r) => { let s = ''; for (let i = 0; i < 26; i++) { const x = 28 + i * 5.7; let y = 25 + r() * 15; while (y < 175) { const h = 2 + r() * 12; if (r() < .7) s += `<rect x="${x - 1.4}" y="${y}" width="2.8" height="${h}" fill="${pick(r, [C, C, M, G, K])}"/>`; y += h + 2 + r() * 8 } } return s },
  // 06 Contour Map
  (r) => { let s = ''; const cx = 120 + r() * 20, cy = 80 + r() * 20; for (let k = 1; k <= 9; k++) { const n = 30 + k * 10, ph = r() * 6; for (let i = 0; i < n; i++) { const a = (i / n) * 6.283, rad = k * 11 * (1 + .25 * Math.sin(3 * a + ph)); const x = cx + Math.cos(a) * rad * 1.15, y = cy + Math.sin(a) * rad; if (x > 22 && x < 178 && y > 22 && y < 178) s += dot(x, y, 1.1, k < 3 ? Y : k === 6 ? Y : K) } } return s },
  // 07 Binary Bloom
  (r) => { let s = ''; for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) if (r() < .45) s += dot(25 + i * 7.9, 25 + j * 7.9, .9, P); for (let f = 0; f < 9; f++) { const x = 40 + r() * 120, y = 40 + r() * 120, c = r() < .55 ? M : K; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (Math.abs(a) + Math.abs(b) < 4 && r() < .8) s += sq(x + a * 4.4, y + b * 4.4, 4, c) } return s },
  // 08 Lattice Key
  (r) => { let s = ''; const w = 26, h = 15; for (let row = 0; row < 7; row++) for (let col = 0; col < 6; col++) { const x = 30 + col * w + (row % 2 ? w / 2 : 0), y = 32 + row * h * 1.55; if (x > 168) continue; const top = `M${x} ${y}l${w / 2} ${-h / 2}l${w / 2} ${h / 2}l${-w / 2} ${h / 2}z`, left = `M${x} ${y}l${w / 2} ${h / 2}v${h}l${-w / 2} ${-h / 2}z`, right = `M${x + w} ${y}l${-w / 2} ${h / 2}v${h}l${w / 2} ${-h / 2}z`; const k = r(); s += `<path d="${top}" fill="${k < .3 ? C : '#fff'}" stroke="${K}" stroke-width=".5"/><path d="${left}" fill="${k < .55 ? K : '#fff'}" stroke="${K}" stroke-width=".5"/><path d="${right}" fill="${k > .6 ? C : '#e9e9e9'}" stroke="${K}" stroke-width=".5"/>` } return s },
  // 09 Radiant Seal
  (r) => { let s = ''; for (let i = 0; i < 48; i++) { const a = (i / 48) * 6.283, c = pick(r, [Y, Y, M, K]); for (let d = 22; d < 80; d += 5 + r() * 3) s += dot(100 + Math.cos(a) * d, 100 + Math.sin(a) * d, .9 + r() * .6, c) } return s + `<rect x="86" y="86" width="28" height="28" fill="${Y}"/><rect x="93" y="93" width="14" height="14" fill="${K}"/>` },
  // 10 Fragment Cloud
  (r) => { let s = ''; for (let i = 0; i < 420; i++) { const x = 100 + gauss(r) * 75, y = 100 + gauss(r) * 70, d = Math.hypot(x - 105, y - 95); s += sq(x, y, d < 30 ? 3 + r() * 4 : 1.5 + r() * 2.5, d < 35 && r() < .6 ? C : r() < .15 ? K : pick(r, [G, C, G])) } return s },
  // 11 Wave Ledger
  (r) => { let s = ''; const ph = r() * 6; for (let row = 0; row < 11; row++) { const c = [C, M, K, G][row % 4]; for (let i = 0; i < 34; i++) { const x = 25 + i * 4.6, y = 40 + row * 11 + Math.sin(i / 5 + ph + row * .3) * 14; s += sq(x, y, 2.6, c) } } return s },
  // 12 Module Keys
  (r) => { let s = ''; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const x = 30 + i * 29, y = 30 + j * 29, c = pick(r, [C, M, Y, K]), k = Math.floor(r() * 4); s += `<rect x="${x}" y="${y}" width="24" height="24" fill="none" stroke="${c}" stroke-width="1.4"/>`; s += k === 0 ? `<rect x="${x + 7}" y="${y + 7}" width="10" height="10" fill="${K}"/>` : k === 1 ? `<circle cx="${x + 12}" cy="${y + 12}" r="6" fill="none" stroke="${K}" stroke-width="3"/>` : k === 2 ? `<path d="M${x + 6} ${y + 6}l12 12m0-12l-12 12" stroke="${c}" stroke-width="3"/>` : `<path d="M${x + 12} ${y + 5}v14m-7-7h14" stroke="${K}" stroke-width="3"/>` } return s },
  // 13 Spiral Memo
  (r) => { let s = ''; const off = r() * 6; for (let t = 0; t < 70; t++) { const a = t * .32 + off, rad = 6 + t * 1.12; s += sq(100 + Math.cos(a) * rad, 100 + Math.sin(a) * rad, 2 + t * .05, t % 7 < 3 ? M : t % 7 < 5 ? K : G) } return s },
  // 14 Shielded Interference
  (r) => { let s = ''; const cs: [number, number, string][] = [[80, 115, C], [120, 80, M], [125, 125, Y]]; for (const [cx, cy, col] of cs) for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) { const x = cx - 52 + i * 4.1, y = cy - 52 + j * 4.1, d = Math.hypot(x - cx, y - cy); if (d < 50 && r() < .92) s += dot(x, y, 2.3 * (1 - d / 75), col) } return `<g style="mix-blend-mode:multiply">${s}</g>` },
  // 15 Glitch Ledger
  (r) => { let s = ''; for (let row = 0; row < 26; row++) { let x = 24 + r() * 10; const y = 30 + row * 5.6; while (x < 176) { const w = 3 + r() * 30; if (r() < .7) s += `<rect x="${x}" y="${y}" width="${Math.min(w, 176 - x)}" height="${2.5 + r() * 2}" fill="${pick(r, [K, K, Y, Y, G])}"/>`; x += w + 2 } } return s },
]

const titles = ['Cipher Grid', 'Noise Field', 'Orbit Ledger', 'Block Vault', 'Vertical Cipher', 'Contour Map', 'Binary Bloom', 'Lattice Key', 'Radiant Seal', 'Fragment Cloud', 'Wave Ledger', 'Module Keys', 'Spiral Memo', 'Shielded Interference', 'Glitch Ledger']

export type Fragment = { index: number; number: string; title: string; svg: string; priceUsdCents: number; cmyk: [number, number, number, number] }

/** Deterministic: the same index always yields the same artwork. */
export function fragment(index: number): Fragment {
  const r = rng(0xa7ca7a + index * 7919)
  const body = gens[index](r)
  const corners = [[22, 22], [178, 22], [22, 178], [178, 178]].map(([x, y]) => `<path d="M${x - 3} ${y}h6M${x} ${y - 3}v6" stroke="${K}" stroke-width=".7"/>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="800" height="800"><rect width="200" height="200" fill="#fff"/>${corners}${body}</svg>`
  const c = Math.round(r() * 700) / 10, m = Math.round(r() * 700) / 10, y = Math.round(r() * 700) / 10
  const cmyk: [number, number, number, number] = [c, m, y, Math.round((100 - Math.max(c, m, y)) * r() * 10) / 10]
  return { index, number: String(index + 1).padStart(2, '0'), title: titles[index], svg, priceUsdCents: (80 + Math.floor(r() * 320)) * 100, cmyk }
}
export const FRAGMENT_COUNT = gens.length
export const fragmentDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`
