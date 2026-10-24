import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Plus } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { ConnectorHero } from '@/components/connector-hero'
import { Halftone, padlock, reach, sphere } from '@/components/halftone'
import { IsoVault } from '@/components/iso-vault'
import { DotText } from '@/components/brand'
import { cn } from '@/lib/utils'

/** Black pill with a signal-orange dot tile, the primary call to action. */
function DotButton({ to, children, light = false }: { to: string; children: ReactNode; light?: boolean }) {
  return (
    <Link to={to} className={cn('group inline-flex items-center gap-2.5 rounded-xl p-1 pr-4 text-[13px] font-medium transition',
      light ? 'border bg-surface text-fg hover:bg-secondary' : 'bg-fg text-surface hover:bg-fg/90')}>
      <span className={cn('grid size-7 grid-cols-3 place-content-center gap-[2px] rounded-lg p-1.5', light ? 'bg-fg' : 'bg-signal')}>
        {Array.from({ length: 9 }, (_, i) => <span key={i} className={cn('size-[3px] rounded-full', light ? 'bg-surface' : 'bg-surface/90', [1, 3, 5, 7].includes(i) && 'opacity-40')} />)}
      </span>
      {children}
    </Link>
  )
}

function TwoTone({ strong, soft, className }: { strong: string; soft: string; className?: string }) {
  return <h2 className={cn('text-[30px] leading-[1.12] tracking-[-0.025em] sm:text-[40px]', className)}><span className="text-fg">{strong}</span> <span className="text-stone">{soft}</span></h2>
}

function Hero() {
  return (
    <section className="grid-paper relative overflow-hidden border-b pb-20 pt-10 sm:pt-16">
      <h1 className="dot-display px-4 text-center text-[44px] leading-[0.95] text-fg sm:hidden"><DotText>Seal. Sell.</DotText><br /><DotText>Settle.</DotText></h1>
      <ConnectorHero />
      <div className="animate-rise mx-auto max-w-md px-4 text-center">
        <p className="text-[15px] text-fg/70">Gallery Arcana is a private marketplace for digital work. Files are encrypted on your device, buyers pay in shielded ZEC, and the seller is paid only after the buyer accepts.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <DotButton to="/market">Explore the market</DotButton>
          <Link to="/auth?mode=signup" className="inline-flex items-center rounded-xl border bg-surface px-4 text-[13px] font-medium text-fg hover:bg-secondary">Get an alias</Link>
        </div>
      </div>
    </section>
  )
}

const proofs = [
  { n: '0', label: 'bytes of capsule plaintext or content keys sent to our servers' },
  { n: '2/2', label: 'confirmations before a payment counts as funded' },
  { n: '256', label: 'bit session tokens, stored only as hashes' },
]

function ProofStrip() {
  return (
    <section className="mx-auto -mt-10 max-w-6xl px-4 sm:px-6">
      <div className="glass grid gap-px overflow-hidden rounded-2xl bg-border sm:grid-cols-2 lg:grid-cols-4">
        {proofs.map((p) => (
          <div key={p.n} className="bg-surface p-6">
            <p className="dot-display text-[40px] leading-none text-fg">{p.n}</p>
            <p className="mt-3 max-w-[220px] text-[13px] text-fg/65">{p.label}</p>
          </div>
        ))}
        <div className="flex flex-col justify-between gap-4 bg-surface p-6">
          <p className="text-[13px] text-fg/75">Sign up with an alias and a passphrase. No email, no phone and no KYC on testnet.</p>
          <DotButton to="/auth?mode=signup" light>Create alias</DotButton>
        </div>
      </div>
    </section>
  )
}

function Capsules() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-28 sm:px-6 md:grid-cols-[1fr_1.1fr]">
      <div>
        <span className="eyebrow">v0.5 · capsule-v1</span>
        <TwoTone className="mt-5 max-w-md" strong="Introducing Arcana Capsules." soft="Products the marketplace itself cannot open." />
        <p className="mt-6 max-w-sm text-[15px] text-fg/70">Files are chunked and encrypted in your browser. Each buyer receives an HPKE key envelope, prepared before checkout and released only after the payment is funded.</p>
        <div className="mt-7"><DotButton to="/market" light>Browse capsules</DotButton></div>
      </div>
      <div className="aspect-[5/4] w-full"><Halftone shape={padlock} step={7} seed={4} erode={0.45} /></div>
    </section>
  )
}

const steps = [
  ['01', 'Seal', 'Encrypt the file locally and publish a re-encoded public preview.'],
  ['02', 'Negotiate', 'Make private offers and counters, with optional end-to-end encrypted threads.'],
  ['03', 'Fund', 'Checkout reserves the item and issues a single-use shielded address.'],
  ['04', 'Verify', 'The buyer checks the SHA-256 locally and accepts. Only then is the payout released.'],
]

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <span className="eyebrow">How it works</span>
          <h2 className="mt-5 text-[40px] leading-[1.02] tracking-[-0.035em] text-fg sm:text-[52px]">Escrow that keeps work secured.</h2>
          <p className="mt-4 max-w-sm text-[15px] text-fg/65">Encryption, escrow and release happen in one flow, and no step depends on trusting the operator with your file.</p>
          <ol className="mt-8 border-t">
            {steps.map(([n, t, b]) => (
              <li key={n} className="dotted-rule grid grid-cols-[40px_1fr] gap-2 py-4">
                <span className="font-mono text-[12px] text-signal">{n}</span>
                <span><span className="text-[15px] text-fg">{t}</span><span className="mt-1 block text-[13px] text-fg/60">{b}</span></span>
              </li>
            ))}
          </ol>
        </div>
        <IsoVault className="-mx-4 sm:mx-0" />
      </div>
    </section>
  )
}

const features = [
  ['Encrypted negotiation', 'Messages and attachments are readable only by the two participants, with sender authentication and replay protection.', 'conversations'],
  ['Private invitations', 'A single-use hashed link for one designated buyer, with a fixed or negotiable price, expiry and revocation.', 'invitations'],
  ['Trade Passport', 'Signed attestations such as "10+ completed trades" that you choose to share, bound to an audience.', 'passports'],
  ['Asset control checks', 'DNS, GitHub and EVM signed-message challenges that show technical control, though not legal title.', 'asset-control'],
]

function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
      <div className="grid items-end gap-6 md:grid-cols-[1.4fr_1fr]">
        <TwoTone strong="Every privacy feature runs on the client," soft="not only behind access control on our servers." />
        <p className="max-w-xs text-[13px] text-fg/60 md:justify-self-end">Here is what v0.5 enforces cryptographically, beyond the capsule itself.</p>
      </div>
      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2">
        {features.map(([t, b, tag]) => (
          <div key={t} className="group bg-surface p-7 transition hover:bg-paper">
            <div className="flex items-center justify-between">
              <span className="eyebrow">/api/{tag}</span>
              <Plus className="size-4 text-fg/30 transition group-hover:rotate-90 group-hover:text-signal" />
            </div>
            <p className="mt-10 text-[20px] tracking-[-0.015em] text-fg">{t}</p>
            <p className="mt-2 max-w-sm text-[13px] text-fg/60">{b}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const modes = [
  { name: 'Open listing', blurb: 'Public in the market and searchable.', items: ['Category browse and search', 'Offers and counteroffers', 'Encrypted file delivery', 'Buyer acceptance before payout'] },
  { name: 'Unlisted link', blurb: 'Hidden from search and shared by URL.', items: ['Everything in Open', 'Excluded from browse and search', 'Encrypted negotiation threads', 'Signed receipts and proofs'], featured: true },
  { name: 'Private invitation', blurb: 'One buyer, one use, one capability.', items: ['Single-use hashed capability', 'Designated buyer', 'Expiry and revocation', 'Trade Passport for both sides'] },
]

function Selling() {
  return (
    <section id="selling" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <span className="eyebrow">Ways to sell</span>
      <TwoTone className="mt-5 max-w-xl" strong="Choose how visible your work is." soft="The escrow is the same in every case." />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {modes.map((m) => (
          <div key={m.name} className={cn('flex flex-col rounded-2xl p-6', m.featured ? 'bg-fg text-surface' : 'glass text-fg')}>
            <div className="flex items-center justify-between">
              <p className="text-[17px]">{m.name}</p>
              {m.featured && <span className="rounded-full bg-signal px-2 py-0.5 font-mono text-[10px] text-surface">most used</span>}
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
    </section>
  )
}

const sees = [
  ['Database observer', 'Ciphertext, listing prices, order states', 'Capsule content, conversation text, evidence'],
  ['Platform operator', 'Offer amounts, timestamps, payout holds', 'Content keys or buyer private keys'],
  ['Public visitor', 'Live listings and re-encoded previews', 'Buyers, offers or any transaction feed'],
  ['Assigned reviewer', 'Evidence the buyer chose to share', 'Anything without explicit consent'],
]

function Privacy() {
  return (
    <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <div className="grid items-end gap-6 md:grid-cols-[1.4fr_1fr]">
        <TwoTone strong="Who can see what," soft="written down before anything was built." />
        <p className="max-w-xs text-[13px] text-fg/60 md:justify-self-end">This is the threat model in plain terms. The protocol docs list the known gaps.</p>
      </div>
      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="relative aspect-square overflow-hidden rounded-2xl border bg-surface lg:aspect-auto">
          <Halftone shape={sphere} step={6} seed={9} erode={0.3} />
          <p className="absolute bottom-4 left-4 right-4 rounded-lg border bg-surface px-3 py-2 font-mono text-[11px] text-fg/60">The server never holds capsule content keys or buyer private keys.</p>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-surface">
          <div className="grid grid-cols-[1fr_1fr_1fr] border-b bg-paper px-5 py-3 font-mono text-[11px] uppercase tracking-wider text-fg/50">
            <span>Who</span><span>Can see</span><span>Cannot see</span>
          </div>
          {sees.map(([who, can, cannot]) => (
            <div key={who} className="grid grid-cols-[1fr_1fr_1fr] gap-3 border-b px-5 py-5 text-[13px] last:border-0">
              <span className="text-fg">{who}</span>
              <span className="text-fg/65">{can}</span>
              <span className="text-fg/65"><span className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-signal" />{cannot}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const faq = [
  ['Is this real money?', 'No. The current build uses a mock wallet on Zcash testnet. Real Zcash and mainnet stay disabled until the live-testnet acceptance gate passes.'],
  ['Do I need an email?', 'No. You need an alias and a passphrase of at least 12 characters. Sessions are HttpOnly cookies that you can rotate and revoke.'],
  ['What if the file is not what was described?', 'Funds stay on hold after payment. The buyer can open a dispute and share selected evidence with an assigned reviewer, who can release or refund.'],
  ['Does a proof mean I legally own it?', 'No. Signed receipts show a historical platform claim, and asset-control checks show technical control at one point in time. Neither is legal title.'],
]

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <p className="dot-display text-center text-[36px] text-fg"><DotText>FAQ.</DotText></p>
      <div className="mt-8 divide-y border-y">
        {faq.map(([q, a]) => (
          <details key={q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] text-fg">{q}<Plus className="size-4 text-fg/40 transition group-open:rotate-45 group-open:text-signal" /></summary>
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
          <p className="dot-display text-[34px] leading-none text-surface sm:text-[52px]"><DotText>Into the vault.</DotText></p>
          <p className="mx-auto mt-4 max-w-sm text-sm text-surface/65">Seal a file, set a price and share it publicly, as an unlisted link or by private invitation.</p>
          <div className="mt-8 flex justify-center gap-3">
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
      <Capsules />
      <HowItWorks />
      <Features />
      <Selling />
      <Privacy />
      <Faq />
      <Cta />
      <SiteFooter />
    </>
  )
}
