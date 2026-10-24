import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Circle, CircleDashed, CircleDot, Plus, X } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { ConnectorHero } from '@/components/connector-hero'
import { Halftone, padlock, reach, sphere, type Shape } from '@/components/halftone'
import { IsoVault } from '@/components/iso-vault'
import { DotText } from '@/components/brand'
import { cn } from '@/lib/utils'

/** Black pill with a signal-orange dot tile, the primary call to action. */
function DotButton({ to, children, light = false }: { to: string; children: ReactNode; light?: boolean }) {
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-2.5 rounded-xl p-1 pr-4 text-[13px] font-medium transition',
      light ? 'border bg-surface text-fg hover:bg-secondary' : 'bg-fg text-surface hover:bg-fg/90')}>
      <span className={cn('grid size-7 grid-cols-3 place-content-center gap-[2px] rounded-lg p-1.5', light ? 'bg-fg' : 'bg-signal')}>
        {Array.from({ length: 9 }, (_, i) => <span key={i} className={cn('size-[3px] rounded-full bg-surface/90', [1, 3, 5, 7].includes(i) && 'opacity-40')} />)}
      </span>
      {children}
    </Link>
  )
}

function TwoTone({ strong, soft, className, dark = false }: { strong: string; soft: string; className?: string; dark?: boolean }) {
  return (
    <h2 className={cn('text-[30px] leading-[1.12] tracking-[-0.025em] sm:text-[40px]', className)}>
      <span className={dark ? 'text-surface' : 'text-fg'}>{strong}</span> <span className={dark ? 'text-surface/45' : 'text-stone'}>{soft}</span>
    </h2>
  )
}

function Head({ tag, strong, soft, aside, dark }: { tag: string; strong: string; soft: string; aside?: string; dark?: boolean }) {
  return (
    <div className="grid items-end gap-6 md:grid-cols-[1.4fr_1fr]">
      <div>
        <span className={cn('eyebrow', dark && 'border-surface/25 bg-transparent text-surface/75')}>{tag}</span>
        <TwoTone className="mt-5 max-w-2xl" strong={strong} soft={soft} dark={dark} />
      </div>
      {aside && <p className={cn('max-w-xs text-[13px] md:justify-self-end', dark ? 'text-surface/55' : 'text-fg/60')}>{aside}</p>}
    </div>
  )
}

function Hero() {
  return (
    <section className="grid-paper relative overflow-hidden border-b pb-20 pt-10 sm:pt-14">
      <h1 className="dot-display px-4 text-center text-[34px] leading-[1] text-fg sm:hidden">
        <DotText>Discover.</DotText><br /><DotText>Negotiate.</DotText><br /><DotText>Exchange.</DotText><br /><span className="text-stone"><DotText>Privately.</DotText></span>
      </h1>
      <ConnectorHero />
      <div className="animate-rise mx-auto max-w-lg px-4 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-signal">A private market for digital assets</p>
        <p className="mt-3 text-[15px] text-fg/70">Buy, sell and exchange digital property without exposing who you are, what you paid or what changed hands. You pay in shielded ZEC, delivery arrives encrypted, and the seller is paid only when you approve.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <DotButton to="/market">Explore the market</DotButton>
          <Link to="/auth?mode=signup" className="inline-flex items-center rounded-xl border bg-surface px-4 text-[13px] font-medium text-fg hover:bg-secondary">Create a pseudonym</Link>
        </div>
        <p className="mt-6 text-[13px] italic text-fg/50">“Private commerce should be as simple as ordinary online shopping.”</p>
      </div>
    </section>
  )
}

const proofs = [
  { n: '0', label: 'identities required: an alias and a passphrase are enough' },
  { n: '0', label: 'bytes of capsule plaintext or content keys sent to our servers' },
  { n: '2/2', label: 'confirmations before a payment counts as funded' },
]

function ProofStrip() {
  return (
    <section className="mx-auto -mt-10 max-w-6xl px-4 sm:px-6">
      <div className="glass grid gap-px overflow-hidden rounded-2xl bg-border sm:grid-cols-2 lg:grid-cols-4">
        {proofs.map((p) => (
          <div key={p.label} className="bg-surface p-6">
            <p className="dot-display text-[40px] leading-none text-fg">{p.n}</p>
            <p className="mt-3 max-w-[220px] text-[13px] text-fg/65">{p.label}</p>
          </div>
        ))}
        <div className="flex flex-col justify-between gap-4 bg-surface p-6">
          <p className="text-[13px] text-fg/75">There's no public bidding history, buyer history or negotiation feed. Sellers control their listings, and buyers control their purchase records.</p>
          <DotButton to="/observer" light>See what an observer sees</DotButton>
        </div>
      </div>
    </section>
  )
}

const box = (seed: number): Shape => (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#aaa'); g.addColorStop(1, '#000')
  c.fillStyle = g
  if (seed === 0) { c.beginPath(); c.roundRect(w * .2, h * .2, w * .6, h * .6, 14); c.fill() }
  if (seed === 1) { c.beginPath(); c.moveTo(w / 2, h * .12); c.lineTo(w * .85, h * .85); c.lineTo(w * .15, h * .85); c.fill() }
  if (seed === 2) { c.beginPath(); c.moveTo(w / 2, h * .1); c.lineTo(w * .86, h / 2); c.lineTo(w / 2, h * .9); c.lineTo(w * .14, h / 2); c.fill() }
  if (seed === 3) { c.beginPath(); c.arc(w / 2, h / 2, w * .34, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2, h / 2, w * .14, 0, 7); c.fill() }
}

const markets = [
  { cat: 'digital', name: 'Digital goods', ex: 'Software, source code, 3D models, designs, datasets', settle: 'Automated ZEC checkout', auto: true },
  { cat: 'collectible', name: 'Digital collectibles', ex: 'Artwork, limited editions, licensed creative assets', settle: 'Automated for downloadable editions', auto: true },
  { cat: 'onchain', name: 'Onchain assets', ex: 'NFTs, tokens and other transferable assets', settle: 'Listed and negotiated; transfer outside the app', auto: false },
  { cat: 'other', name: 'Digital property', ex: 'Domains, repositories, commercial licences, access rights', settle: 'Listed and negotiated; control can be verified', auto: false },
]

function Markets() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
      <Head tag="Supported markets" strong="One private market," soft="four kinds of digital property." aside="Settlement starts with downloadable goods paid in ZEC. Onchain assets and digital property can be listed and negotiated today. Automated custody and transfer for them need separate integrations." />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {markets.map((m, i) => (
          <Link key={m.cat} to={`/market?category=${m.cat}`} className="group glass flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5">
            <div className="h-36 border-b bg-paper"><Halftone shape={box(i)} step={6} seed={i + 11} erode={0.45} square={i % 2 === 1} /></div>
            <div className="flex flex-1 flex-col p-5">
              <p className="text-[16px] text-fg">{m.name}</p>
              <p className="mt-1 flex-1 text-[13px] text-fg/60">{m.ex}</p>
              <p className="mt-4 flex items-center gap-1.5 font-mono text-[10.5px] text-fg/65">
                <span className={cn('size-1.5 rounded-full', m.auto ? 'bg-emerald-600' : 'bg-stone')} />{m.settle}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

const flow = [
  ['Buyer funds', 'Checkout reserves the item and issues a unique shielded invoice with a ZIP-321 request.'],
  ['Payment verified', 'Exact integer-zatoshi accounting, confirmations, expiry, underpayments and overpayments.'],
  ['Proceeds on hold', "The seller's payout stays in custody. Nothing is released yet."],
  ['Buyer verifies', 'The asset decrypts locally and its SHA-256 is checked against the listing snapshot.'],
  ['Buyer approves', 'Approving signs an Ed25519 receipt and authorizes the seller payout.'],
]

function Exchange() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.35fr]">
        <div>
          <span className="eyebrow">Protected exchange</span>
          <h2 className="mt-5 text-[40px] leading-[1.02] tracking-[-0.035em] text-fg sm:text-[50px]">The buyer controls when the payment is released.</h2>
          <ol className="mt-8 border-t">
            {flow.map(([t, b], i) => (
              <li key={t} className="dotted-rule grid grid-cols-[36px_1fr] gap-2 py-3.5">
                <span className="font-mono text-[12px] text-signal">0{i + 1}</span>
                <span><span className="text-[15px] text-fg">{t}</span><span className="mt-0.5 block text-[13px] text-fg/60">{b}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <IsoVault className="-mx-4 sm:mx-0" />
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-surface p-4 text-[13px]">
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-signal">Disputes</p>
              <p className="mt-1.5 text-fg/70">A disputed order stays frozen until an authorized reviewer decides. The buyer chooses which encrypted evidence the reviewer can open.</p>
            </div>
            <div className="rounded-xl border bg-surface p-4 text-[13px]">
              <p className="font-mono text-[10.5px] uppercase tracking-wider text-signal">Custody, stated plainly</p>
              <p className="mt-1.5 text-fg/70">Gallery Arcana holds the funds between payment and release. This is custodial buyer protection, not a trustless contract.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Capsules() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-28 sm:px-6 md:grid-cols-[1fr_1.1fr]">
      <div>
        <span className="eyebrow">Arcana Capsules</span>
        <TwoTone className="mt-5 max-w-md" strong="Sell unreleased work." soft="The market stores it but cannot open it." />
        <p className="mt-6 max-w-sm text-[15px] text-fg/70">Products are encrypted in your browser in authenticated chunks. Each buyer gets their own decryption envelope, released after payment, and the file is recovered locally.</p>
        <ul className="mt-6 space-y-2 text-[13px] text-fg/70">
          {['Client-side encryption, with ciphertext only on our disks', 'Authenticated integrity for every chunk', 'Buyer-specific HPKE key envelopes'].map((t) => (
            <li key={t} className="flex items-center gap-2"><Check className="size-3.5 text-signal" strokeWidth={2.5} />{t}</li>
          ))}
        </ul>
      </div>
      <div className="aspect-[5/4] w-full"><Halftone shape={padlock} step={7} seed={4} erode={0.45} /></div>
    </section>
  )
}

const features = [
  ['Confidential negotiation', 'Offers and counters are private to both parties. Message and attachment contents are end-to-end encrypted, with authenticated keys, replay protection and controlled retention. Settlement terms stay verifiable by the backend.', 'conversations'],
  ['Private sales & exclusive drops', 'Expiring invitations, one-time redemption, recipient-restricted pricing and revocable access, without exposing your whole inventory.', 'invitations'],
  ['Receipts & Trade Passport', 'Signed transaction attestations and private receipts. Prove successful purchases or deliveries selectively, without publishing your history.', 'passports'],
  ['Asset-control checks', 'DNS, GitHub and wallet signed-message challenges show technical control. They do not establish legal ownership or licensing rights.', 'asset-control'],
]

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
      <Head tag="Discretion by design" strong="Negotiate, sell and prove," soft="disclosing only what you choose." />
      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
        {features.map(([t, b, tag]) => (
          <div key={t} className="group bg-surface p-7 transition hover:bg-paper">
            <div className="flex items-center justify-between">
              <span className="eyebrow">/api/{tag}</span>
              <Plus className="size-4 text-fg/30 transition group-hover:rotate-90 group-hover:text-signal" />
            </div>
            <p className="mt-10 text-[20px] tracking-[-0.015em] text-fg">{t}</p>
            <p className="mt-2 max-w-md text-[13px] text-fg/60">{b}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const audiences = [
  ['Counterparty', 'The listing, agreed price, delivery status and encrypted messages addressed to them', 'Your other trades, your inventory, your identity beyond the alias'],
  ['Platform operator', 'Prices, offer amounts, order states, payout holds and timestamps', 'Capsule content keys, buyer private keys, encrypted message text'],
  ['Database administrator', 'Ciphertext, hashed tokens and receipt codes, and settlement records', 'Capsule plaintext, conversations, dispute evidence'],
  ['Blockchain observer', 'That a shielded transaction happened', 'Shielded amounts, memo or counterparties. App metadata and external asset transfers are not covered.'],
  ['Public visitor', 'Live listings and re-encoded previews with metadata stripped', 'Buyers, offers, sales history or any transaction feed'],
]

function Privacy() {
  return (
    <section id="privacy" className="mt-28 scroll-mt-16 bg-fg py-24 text-surface">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Head dark tag="Privacy guarantees" strong="Who can see what." soft="Each audience is documented separately." aside="Privacy covers identity, communications, assets, payments and records. These are the limits as they stand today, including what we still handle." />
        <div className="mt-12 grid gap-6 lg:grid-cols-[0.8fr_1.6fr]">
          <div className="relative hidden aspect-square overflow-hidden rounded-2xl border border-surface/10 lg:block">
            <Halftone shape={sphere} step={6} seed={9} erode={0.3} className="text-surface" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-surface/10">
            <div className="hidden grid-cols-[0.8fr_1fr_1fr] border-b border-surface/10 px-5 py-3 font-mono text-[10.5px] uppercase tracking-wider text-surface/45 sm:grid">
              <span>Audience</span><span>Can see</span><span>Cannot see</span>
            </div>
            {audiences.map(([who, can, cannot]) => (
              <div key={who} className="grid gap-2 border-b border-surface/10 px-5 py-4 text-[13px] last:border-0 sm:grid-cols-[0.8fr_1fr_1fr] sm:gap-4">
                <span className="text-surface">{who}</span>
                <span className="flex gap-2 text-surface/65"><Circle className="mt-0.5 size-3 shrink-0 text-surface/35" />{can}</span>
                <span className="flex gap-2 text-surface/65"><X className="mt-0.5 size-3 shrink-0 text-signal" strokeWidth={3} />{cannot}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const status = [
  { icon: CircleDot, title: 'Working now', tone: 'text-emerald-700', items: ['Pseudonymous accounts, listings, offers and atomic checkout', 'Capsules encrypted and decrypted in your browser', 'End-to-end encrypted negotiation with attachments', 'Private invitations, Trade Passports and public verification', 'Buyer-controlled release, consent-based dispute evidence and signed receipts'] },
  { icon: CircleDashed, title: 'In progress', tone: 'text-signal', items: ['Verified Zcash testnet payment and settlement (Zebra + Zallet)', 'Fresh exchange-rate quotes for live settlement', 'More asset verification types', 'Independent review of the client cryptography'] },
  { icon: Circle, title: 'Not yet verified', tone: 'text-fg/45', items: ['Live Zcash settlement', 'Mainnet custody', 'Production key management', 'Actual external asset transfers', 'Independent review of client cryptography'] },
]

function Status() {
  return (
    <section id="status" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <Head tag="Build status" strong="Built in the open." soft="Live results are never shown as mock results, or the other way round." aside="Payments currently run on a durable mock wallet. A complete mock purchase shows that the app works. It doesn't show blockchain settlement." />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {status.map((s) => (
          <div key={s.title} className="glass rounded-2xl p-6">
            <p className={cn('flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider', s.tone)}><s.icon className="size-3.5" />{s.title}</p>
            <ul className="mt-5 space-y-2.5 text-[13px] text-fg/75">
              {s.items.map((it) => <li key={it} className="border-b border-dashed border-fg/10 pb-2.5 last:border-0">{it}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

const modes = [
  { name: 'Open listing', blurb: 'Public, searchable and with a fixed price.', items: ['Category browse and search', 'Confidential offers and counters', 'Encrypted delivery', 'Buyer approval before payout'] },
  { name: 'Unlisted link', blurb: 'Hidden from search and shared by URL.', items: ['Everything in Open', 'Excluded from browse and search', 'Encrypted negotiation threads', 'Signed receipts'], featured: true },
  { name: 'Private invitation', blurb: 'Restricted to a recipient and redeemable once.', items: ['Expiring, revocable invitation', 'Designated buyer', 'Optional negotiated price', 'Limited digital releases'] },
]

function Selling() {
  return (
    <section id="selling" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <Head tag="Selling & fees" strong="Choose how visible each sale is." soft="Pay only when something sells." />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {modes.map((m) => (
          <div key={m.name} className={cn('flex flex-col rounded-2xl p-6', m.featured ? 'bg-fg text-surface' : 'glass text-fg')}>
            <div className="flex items-center justify-between">
              <p className="text-[17px]">{m.name}</p>
              {m.featured && <span className="rounded-full bg-signal px-2 py-0.5 font-mono text-[10px] text-surface">discreet</span>}
            </div>
            <p className={cn('mt-1 text-[13px]', m.featured ? 'text-surface/60' : 'text-fg/55')}>{m.blurb}</p>
            <ul className={cn('mt-6 space-y-2.5 border-t pt-6 text-[13px]', m.featured && 'border-surface/15')}>
              {m.items.map((it) => (
                <li key={it} className="flex items-center gap-2.5"><Check className={cn('size-3.5', m.featured ? 'text-signal' : 'text-fg/50')} strokeWidth={2.5} />{it}</li>
              ))}
            </ul>
            <Link to="/studio/new" className={cn('mt-8 inline-flex items-center justify-center gap-1 rounded-lg py-2.5 text-[13px] font-medium', m.featured ? 'bg-surface text-fg' : 'bg-fg text-surface')}>
              Start listing <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3">
        {[
          ['Free', 'Registration, browsing and creating listings. No membership fees.'],
          ['On completion', 'A transparent fee on completed transactions only, published before live settlement.'],
          ['Never', 'Selling identity disclosure or user transaction data.'],
        ].map(([k, v], i) => (
          <div key={k} className="bg-surface p-5">
            <p className={cn('dot-display text-[24px] leading-none', i === 2 ? 'text-signal' : 'text-fg')}><DotText>{k + '.'}</DotText></p>
            <p className="mt-2 text-[13px] text-fg/65">{v}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const faq = [
  ['Is this real money?', 'No. The current build uses a mock wallet on Zcash testnet, and the nav badge shows that at all times. Real settlement has to be demonstrated on testnet before any production claim is made.'],
  ['Does shielded ZEC make everything private?', 'It protects the onchain payment details. It does not anonymize application metadata held by the platform, or transfers of external blockchain assets.'],
  ['Who holds the money during a trade?', 'Gallery Arcana does, between payment and the buyer’s approval. This custodial buyer protection is what lets disputes freeze funds for review.'],
  ['What if the file is not what was described?', 'Don’t approve it. Open a dispute and share only the evidence you choose with an assigned reviewer, who can release or refund the payment.'],
  ['Does a receipt prove I legally own it?', 'No. Signed receipts prove a platform transaction, and control checks prove technical control at one point in time. Neither establishes legal title or licensing rights.'],
  ['What can’t be sold?', 'Gallery Arcana is for lawful digital commerce. Prohibited content, stolen assets and fraud are removed, with fraud prevention and compliance safeguards kept proportionate.'],
]

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <p className="dot-display text-center text-[36px] text-fg"><DotText>FAQ.</DotText></p>
      <div className="mt-8 divide-y border-y">
        {faq.map(([q, a]) => (
          <details key={q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] text-fg">{q}<Plus className="size-4 shrink-0 text-fg/40 transition group-open:rotate-45 group-open:text-signal" /></summary>
            <p className="mt-2 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
      <div className="relative overflow-hidden rounded-3xl bg-fg px-6 py-16 text-center sm:py-20">
        <div className="absolute inset-x-0 bottom-0 h-1/2 opacity-25"><Halftone shape={reach} step={8} seed={3} erode={0.5} className="text-surface" /></div>
        <div className="relative">
          <p className="dot-display text-[30px] leading-none text-surface sm:text-[48px]"><DotText>Privacy by default.</DotText></p>
          <p className="mx-auto mt-4 max-w-md text-sm text-surface/65">Digital property can change hands without the trade, the people involved or the contents becoming public information.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/studio/new" className="rounded-xl bg-signal px-5 py-2.5 text-[13px] font-medium text-surface">Start selling</Link>
            <Link to="/market" className="rounded-xl bg-surface px-5 py-2.5 text-[13px] font-medium text-fg">Browse the market</Link>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  return (
    <>
      <SiteNav />
      <Hero />
      <ProofStrip />
      <Markets />
      <Exchange />
      <Capsules />
      <Features />
      <Privacy />
      <Selling />
      <Status />
      <Faq />
      <Cta />
      <SiteFooter />
    </>
  )
}
