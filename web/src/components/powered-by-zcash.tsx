import { EyeOff, FileKey2, KeyRound, Lock, ShieldCheck, Sparkles } from 'lucide-react'
import { ZcashLogo } from './zcash-logo'
import { DotText } from './brand'

const points = [
  { icon: EyeOff, t: 'Shielded by default', b: 'Shielded Zcash transactions encrypt the sender, recipient and amount on chain. Observers see only that a transaction happened.' },
  { icon: Sparkles, t: 'Zero-knowledge proofs', b: 'Transactions are validated with zk-SNARKs, so the network checks a payment is valid without learning its contents.' },
  { icon: ShieldCheck, t: 'Orchard and Halo 2', b: 'Payments use the Orchard pool, whose Halo 2 proofs need no trusted setup.' },
  { icon: FileKey2, t: 'Encrypted memos', b: 'Each invoice is matched by an encrypted memo that only the recipient wallet can read, not a public label.' },
  { icon: KeyRound, t: 'Selective disclosure', b: 'Viewing keys and our signed receipts let you prove a payment or purchase to one party, and only when you choose.' },
  { icon: Lock, t: 'One address per invoice', b: 'Every checkout gets a fresh shielded address, so purchases are never linked by a reused address.' },
]

export function PoweredByZcash() {
  return (
    <section id="zcash" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-16 sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <div className="flex items-center gap-4">
            <ZcashLogo className="size-16 drop-shadow-[0_10px_25px_rgba(244,183,40,0.45)] sm:size-20" />
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg/55">Powered by</p>
              <p className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg sm:text-[34px]">Zcash</p>
            </div>
          </div>
          <h2 className="dot-display mt-6 text-[40px] leading-[0.98] text-fg sm:text-[56px]"><DotText>Private money.</DotText><br /><span className="text-stone"><DotText>Private market.</DotText></span></h2>
          <p className="mt-5 max-w-md text-[15px] text-fg/70">Gallery Arcana settles in shielded ZEC. That's the payment layer built for privacy, so the price you paid and the wallet you paid from don't become public record.</p>
          <a href="https://z.cash" target="_blank" rel="noreferrer" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#F4B728] px-5 py-3 text-[13px] font-medium text-[#1a1a1a] hover:brightness-105">Learn about Zcash →</a>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
          {points.map((p) => (
            <div key={p.t} className="bg-surface p-6">
              <p.icon className="size-5 text-[#C9921A]" />
              <p className="mt-4 text-[16px] text-fg">{p.t}</p>
              <p className="mt-1.5 text-[13px] text-fg/60">{p.b}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[12px] text-fg/45">Shielding protects onchain payment details. It does not hide application metadata from the marketplace operator, or transfers of assets on other chains.</p>
    </section>
  )
}
