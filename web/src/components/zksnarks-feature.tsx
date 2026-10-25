import { ArrowUpRight, Lock } from 'lucide-react'
import { ZcashLogo } from './zcash-logo'

// Placeholder plates only: the real works are revealed by the artists at launch.
const plate = (seed: number) => {
  let s = seed, out = ''
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let y = 0; y < 10; y++) for (let x = 0; x < 5; x++) if (r() < 0.55) {
    for (const cx of [x, 9 - x]) out += `<rect x="${cx * 10 + 1}" y="${y * 10 + 1}" width="8" height="8" fill="#fff" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`
  }
  return `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#111"/>${out}</svg>`)}`
}

/** Upcoming featured collection from the team behind ZECATHON. */
export function ZkSnarksFeature() {
  return (
    <section id="zksnarks" aria-labelledby="zksnarks-title" className="scroll-mt-16 border-t border-white/10 bg-[#0b0b0b] px-4 pb-16 pt-14 text-white sm:px-6">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-[#F4B728]/50 bg-[#F4B728]/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[#F4B728]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#F4B728]" />Featured collection · coming soon
          </p>
          <h2 id="zksnarks-title" className="mt-5 text-[34px] leading-[1.05] tracking-[-0.025em] sm:text-[46px]">zkSNARKs</h2>
          <p className="mt-3 max-w-md text-[15px] text-white/70">A collection of shielded identities stored on Zcash, from the team presenting <b className="font-medium text-white">ZECATHON</b>, the $ZEC privacy hackathon with a $100K prize pool for builders shipping useful tech on Zcash.</p>
          <p className="mt-3 max-w-md text-[13px] text-white/50">Their works will be listed here as sealed capsules: encrypted in the artist's browser, paid in shielded ZEC, unlocked only by the buyer.</p>
          <div className="mt-7 flex flex-wrap gap-3 text-[13px] font-medium">
            <a href="https://x.com/zksnarks_" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-5 py-3 text-[#0b0b0b]">Follow @zksnarks_<ArrowUpRight className="size-4" /></a>
            <a href="#waitlist" className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 px-5 py-3 hover:bg-white/10">Get notified at the drop</a>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {[3, 17, 29, 41, 53, 67].map((seed, i) => (
            <div key={seed} className="relative aspect-square overflow-hidden rounded-xl border border-white/10">
              <img src={plate(seed * 7919)} alt="" className="size-full blur-[3px] [image-rendering:pixelated]" />
              <span className="absolute inset-0 grid place-items-center">
                {i === 4 ? <ZcashLogo className="size-9" /> : <Lock className="size-5 text-white/70" />}
              </span>
              <span className="absolute bottom-1.5 left-2 font-mono text-[10px] text-white/50">#{String(i + 1).padStart(3, '0')}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
