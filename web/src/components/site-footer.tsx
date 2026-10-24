import { Link } from 'react-router-dom'
import { Landscape } from './landscape'
import { Logo } from './brand'

const cols = [
  { title: 'Market', links: [['Browse', '/market'], ['Digital', '/market?category=digital'], ['Collectibles', '/market?category=collectible'], ['On-chain', '/market?category=onchain']] },
  { title: 'Sellers', links: [['Studio', '/studio'], ['List a work', '/studio/new'], ['Ways to sell', '/#selling']] },
  { title: 'Protocol', links: [['How it works', '/#how'], ['Privacy model', '/#privacy'], ['FAQ', '/#faq']] },
]

export function SiteFooter() {
  return (
    <footer className="relative isolate mt-24 overflow-hidden border-t">
      <div className="absolute inset-0 -z-10 opacity-60"><Landscape variant="night" /></div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/70 to-background/10" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-16 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm text-muted-foreground">A private marketplace for digital work. Encrypted on your device, paid in shielded testnet ZEC, settled only when you accept.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-frost/50">{c.title}</p>
            <ul className="mt-4 space-y-2 text-sm text-frost/75">
              {c.links.map(([label, to]) => <li key={label}><Link className="hover:text-frost" to={to}>{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-xs text-frost/40 sm:px-6">Testnet only. Mock payments. Not a custodian. © {new Date().getFullYear()} Gallery Arcana</p>
      <div aria-hidden className="pointer-events-none mt-6 select-none overflow-hidden px-2">
        <p className="translate-y-[18%] text-center font-serif text-[23vw] leading-[0.8] tracking-[-0.03em] text-frost/85 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]">Arcana</p>
      </div>
    </footer>
  )
}
