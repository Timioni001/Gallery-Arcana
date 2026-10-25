// Sealed-bid auctions for the Arcana Fragments, simulated in the browser.
// Rounds cycle forever and are staggered so a lot is always closing soon. Rival bids
// are a pure function of (lot, round), so every reload shows the same outcome;
// only the visitor's own bids are stored (localStorage, this browser only).
// Settlement is second-price: the winner pays the runner-up bid, or the reserve.
import { FRAGMENT_COUNT, fragment, type Fragment } from './fragments'

export const ROUND_MS = 12 * 60_000
const KEY = 'arcana-sealed-bids'

function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const r100 = (cents: number) => Math.round(cents / 100) * 100

export type Lot = {
  fragment: Fragment; round: number; start: number; end: number
  reserve: number; increment: number; rivalTop: number; rivalSecond: number; rivalCount: number
}

export function lot(index: number, round: number): Lot {
  const f = fragment(index), phase = (index * ROUND_MS) / FRAGMENT_COUNT
  const r = rng(index * 100_003 + round)
  const reserve = r100(f.priceUsdCents * 0.45), increment = Math.max(500, r100(reserve * 0.05))
  const rivalTop = r100(f.priceUsdCents * (0.55 + r() * 0.9)), rivalSecond = r100(rivalTop * (0.7 + r() * 0.25))
  const start = round * ROUND_MS - phase
  return { fragment: f, round, start, end: start + ROUND_MS, reserve, increment, rivalTop: Math.max(rivalTop, reserve), rivalSecond: Math.max(rivalSecond, reserve), rivalCount: 2 + Math.floor(r() * 9) }
}

export const currentLot = (index: number, now: number) => lot(index, Math.floor((now + (index * ROUND_MS) / FRAGMENT_COUNT) / ROUND_MS))

/** Sealed bids visible as a count only, rising through the round. */
export const sealedCount = (l: Lot, now: number) => Math.min(l.rivalCount, Math.floor(l.rivalCount * Math.min(1, Math.max(0, (now - l.start) / (l.end - l.start - 60_000))) + 0.5))

type Store = Record<string, number>
const id = (l: Pick<Lot, 'fragment' | 'round'>) => `${l.fragment.index}:${l.round}`
function load(): Store { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} } }
function save(s: Store) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode: bids last this session */ } }

export const myBid = (l: Lot): number | undefined => load()[id(l)]
export function placeBid(l: Lot, cents: number) { const s = load(); s[id(l)] = cents; save(s) }

export type Outcome = { won: boolean; pays: number }
/** Second-price result once a round has closed. Ties go to the earlier (rival) bid. */
export function outcome(l: Lot, mine?: number): Outcome {
  if (mine && mine > l.rivalTop) return { won: true, pays: Math.max(l.reserve, l.rivalTop) }
  return { won: false, pays: Math.max(l.reserve, mine ? Math.min(mine, l.rivalTop) : l.rivalSecond) }
}

/** Closed rounds this browser bid on, newest first. */
export function myResults(now: number) {
  return Object.entries(load()).map(([k, cents]) => {
    const [i, round] = k.split(':').map(Number)
    const l = lot(i, round)
    return { lot: l, mine: cents, result: outcome(l, cents) }
  }).filter((x) => x.lot.end <= now).sort((a, b) => b.lot.end - a.lot.end).slice(0, 12)
}

export function countdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
