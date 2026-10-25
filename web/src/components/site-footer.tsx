import { Link } from 'react-router-dom'
import { Logo } from './brand'

const cols = [
  { title: 'Market', links: [['Browse', '/market'], ['Auctions', '/auctions'], ['Arcana Fragments', '/#collection'], ['Digital', '/market?category=digital'], ['Collectibles', '/market?category=collectible'], ['Onchain', '/market?category=onchain'], ['Digital property', '/market?category=other']] },
  { title: 'Sellers', links: [['Studio', '/studio'], ['List a work', '/studio/new'], ['Ways to sell', '/#selling']] },
  { title: 'Protocol', links: [['Protected exchange', '/#how'], ['Privacy guarantees', '/#privacy'], ['Observer view', '/observer'], ['Build status', '/#status'], ['FAQ', '/#faq']] },
]

async function resetDemo() {
  if (!confirm('Clear every account, listing and key stored in this browser?')) return
  await (await import('@/demo/server')).resetDemo()
}

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t bg-surface pb-24 sm:pb-0">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-14 sm:px-6 grid-cols-2 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="col-span-2 max-w-xs md:col-span-1">
          <Logo />
          <p className="mt-4 text-sm text-muted-foreground">A private market for digital assets. Discover, negotiate and exchange privately. Lawful digital commerce only.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg/45">{c.title}</p>
            <ul className="mt-4 space-y-2 text-sm text-fg/75">
              {c.links.map(([label, to]) => <li key={label}><Link className="hover:text-fg" to={to}>{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-12 select-none overflow-hidden border-t px-4 pt-6">
        <p className="dot-display text-center text-[19vw] leading-[0.82] text-fg [mask-image:linear-gradient(to_bottom,black_40%,transparent_95%)]">Arcana</p>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-6 pt-2 font-mono text-[11px] text-fg/45 sm:px-6">
        Testnet only · mock payments · not a custodian
        {import.meta.env.VITE_DEMO === '1' && <> · <button onClick={resetDemo} className="underline hover:text-fg">Reset my data</button></>}
      </p>
    </footer>
  )
}
