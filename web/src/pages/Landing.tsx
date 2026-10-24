import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronRight, EyeOff, FileLock2, KeyRound, Lock, MessageSquareLock, ShieldCheck, Stamp, Ticket, Vault } from 'lucide-react'
import { SiteNav } from '@/components/site-nav'
import { SiteFooter } from '@/components/site-footer'
import { Landscape } from '@/components/landscape'
import { Mark } from '@/components/brand'
import { cn } from '@/lib/utils'

function SectionHead({ tag, title, aside }: { tag: string; title: ReactNode; aside: string }) {
  return (
    <div className="grid items-end gap-6 md:grid-cols-[1.2fr_1fr]">
      <div>
        <span className="eyebrow">{tag}</span>
        <h2 className="mt-4 max-w-md text-[28px] leading-[1.15] tracking-[-0.02em] text-frost sm:text-[34px]">{title}</h2>
      </div>
      <p className="max-w-sm text-sm text-muted-foreground md:justify-self-end">{aside}</p>
    </div>
  )
}

const stack = ['Zcash testnet', 'RFC 9180 HPKE', 'AES-256-GCM', 'Ed25519', 'X25519', 'PostgreSQL 16', 'EIP-191', 'SHA-256']

function Hero() {
  return (
    <section className="px-2 pt-2 sm:px-3 sm:pt-3">
      <div className="relative isolate overflow-hidden rounded-[28px]">
        <div className="absolute inset-0 -z-10"><Landscape /></div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/30 via-transparent to-ink" />
        <SiteNav overlay />
        <div className="mx-auto flex min-h-[640px] max-w-3xl flex-col items-center px-4 pb-40 pt-36 text-center sm:min-h-[760px] sm:pt-44">
          <span className="animate-rise glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-frost/80">
            Testnet preview <span className="rounded-full bg-frost px-1.5 py-px text-[10px] font-semibold tracking-normal text-ink">v0.5</span>
          </span>
          <h1 className="animate-rise mt-6 text-balance text-[44px] font-medium leading-[1.02] tracking-[-0.035em] text-frost [animation-delay:80ms] sm:text-[68px]">
            Sell your work. <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.01em]">Keep</span> the secret.
          </h1>
          <p className="animate-rise mt-5 max-w-lg text-pretty text-[15px] text-frost/75 [animation-delay:160ms]">
            A private marketplace where files are encrypted on your device, buyers pay in shielded ZEC and the seller is paid only after the buyer accepts.
          </p>
          <div className="animate-rise mt-8 flex flex-wrap justify-center gap-3 [animation-delay:240ms]">
            <Link to="/market" className="inline-flex items-center gap-1.5 rounded-full bg-frost px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-white">
              Explore the market <ArrowRight className="size-4" />
            </Link>
            <Link to="/auth?mode=signup" className="glass inline-flex items-center rounded-full px-5 py-2.5 text-sm text-frost transition hover:bg-white/10">
              Get an alias
            </Link>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 overflow-hidden py-7 [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
          <div className="animate-drift flex w-max gap-14 pr-14">
            {[...stack, ...stack].map((s, i) => (
              <span key={i} className="whitespace-nowrap font-mono text-[13px] tracking-tight text-frost/45">{s}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const steps = [
  { title: 'Seal a capsule', body: 'Your file is chunked and encrypted in the browser. The server stores ciphertext and never receives the content key.' },
  { title: 'Negotiate privately', body: 'Offers, counters and encrypted conversations between participants only.' },
  { title: 'Fund in shielded ZEC', body: 'Checkout reserves the listing and issues a single-use address. Funds are held until confirmation.' },
  { title: 'Verify, then accept', body: 'The buyer decrypts locally, checks the SHA-256 and accepts. Only then is the payout released.' },
]

function OrderPanel() {
  return (
    <div className="glass w-full max-w-sm rounded-2xl p-5 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm text-frost"><Vault className="size-4 text-glacier" />Order details</p>
        <span className="font-mono text-[11px] text-frost/50">#A7F3-91C2</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="size-12 rounded-xl bg-[radial-gradient(circle_at_30%_30%,oklch(0.7_0.09_215),oklch(0.25_0.04_250))]" />
        <div>
          <p className="text-[15px] text-frost">Glacier Study No. 4</p>
          <div className="mt-1 flex gap-1.5">
            <span className="rounded-full bg-frost px-2 text-[10px] font-medium text-ink">Capsule</span>
            <span className="rounded-full bg-glacier/20 px-2 text-[10px] text-glacier">Funded</span>
          </div>
        </div>
      </div>
      <p className="mt-5 text-xs text-frost/50">Settlement</p>
      <div className="mt-2 space-y-2">
        {[
          ['Payment received', '10.500 ZEC · 2/2 conf.', true],
          ['Key envelope released', 'HPKE · buyer key pinned', true],
          ['Buyer verified SHA-256', 'awaiting acceptance', false],
        ].map(([a, b, done]) => (
          <div key={a as string} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2.5">
            <div>
              <p className="text-[13px] text-frost">{a}</p>
              <p className="font-mono text-[11px] text-frost/45">{b}</p>
            </div>
            <span className={cn('grid size-5 place-items-center rounded-full', done ? 'bg-glacier text-ink' : 'border border-frost/25')}>
              {done && <Check className="size-3" strokeWidth={3} />}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HowItWorks() {
  const [active, setActive] = useState(0)
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-24 sm:px-6">
      <SectionHead tag="How it works" title="From sealed file to settled sale in four steps" aside="No account email, no plaintext file on our disks and no payout until the buyer has verified what they bought." />
      <div className="mt-12 grid items-center gap-10 md:grid-cols-[1fr_1.15fr]">
        <ol>
          {steps.map((s, i) => (
            <li key={s.title} className="dotted-rule">
              <button onClick={() => setActive(i)} className="flex w-full items-start gap-3 py-5 text-left">
                <span className={cn('mt-0.5 size-4 shrink-0 rounded-[4px] border transition', i === active ? 'border-frost bg-frost' : 'border-frost/40')} />
                <span>
                  <span className={cn('block text-[15px] transition', i === active ? 'text-frost' : 'text-frost/70')}>{s.title}</span>
                  <span className={cn('grid text-[13px] text-muted-foreground transition-all duration-300', i === active ? 'mt-1.5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
                    <span className="overflow-hidden">{s.body}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
          <Link to="/market" className="mt-8 inline-flex items-center gap-1 rounded-full bg-frost px-4 py-1.5 text-[13px] font-medium text-ink">Try it now <ChevronRight className="size-4" /></Link>
        </ol>
        <div className="relative isolate flex min-h-[420px] items-center justify-end overflow-hidden rounded-2xl p-5 sm:p-8">
          <div className="absolute inset-0 -z-10 scale-125"><Landscape /></div>
          <OrderPanel />
        </div>
      </div>
    </section>
  )
}

const features = [
  {
    tab: 'Arcana Capsules', icon: FileLock2,
    lead: 'Client-side encrypted products with authenticated chunks and encrypted metadata.',
    rows: [['Content key', 'never leaves the seller device'], ['Envelope', 'HPKE to the buyer, prepared before checkout'], ['Release', 'gated on confirmed funding'], ['Integrity', 'per-chunk AES-GCM + file SHA-256']],
  },
  {
    tab: 'Encrypted negotiation', icon: MessageSquareLock,
    lead: 'Conversations visible only to the two participants, with sender authentication and replay protection.',
    rows: [['Participants', 'buyer + seller only'], ['Attachments', 'encrypted, size-bounded'], ['Lifetime', 'expiring and deletable'], ['Visible to us', 'price and state, never the text']],
  },
  {
    tab: 'Private sales', icon: Ticket,
    lead: 'One-time invitations: a hashed capability for a designated buyer, a fixed or negotiable price and an expiry.',
    rows: [['Capability', 'body-only, stored hashed'], ['Redemption', 'atomic and single-use'], ['Buyer', 'optionally designated'], ['Revocation', 'any time before redemption']],
  },
  {
    tab: 'Trade Passport', icon: Stamp,
    lead: 'Minimal Ed25519 attestations you choose to share, such as "completed 10+ trades", without exposing which trades.',
    rows: [['Disclosure', 'consent-based, threshold counts'], ['Binding', 'audience + holder possession'], ['Expiry', 'and revocation'], ['Keys', 'signing-key history published']],
  },
]

function Features() {
  const [i, setI] = useState(0)
  const f = features[i]
  return (
    <section className="mx-auto max-w-6xl px-4 pt-28 sm:px-6">
      <SectionHead tag="Features" title="A marketplace built so the operator can't snoop" aside="Every privacy feature is enforced cryptographically on the client, not only by access control on our servers." />
      <div className="mt-10 flex gap-1 overflow-x-auto rounded-xl bg-white/[0.03] p-1 [scrollbar-width:none]">
        {features.map((x, k) => (
          <button key={x.tab} onClick={() => setI(k)} className={cn('flex-1 whitespace-nowrap rounded-lg px-4 py-2.5 text-[13px] transition', k === i ? 'bg-secondary text-frost' : 'text-frost/55 hover:text-frost')}>
            <span className="mr-1.5 font-mono text-frost/40">0{k + 1}</span>{x.tab}
          </button>
        ))}
      </div>
      <div className="relative isolate mt-6 overflow-hidden rounded-2xl p-4 sm:p-10">
        <div className="absolute inset-0 -z-10"><Landscape variant="night" /></div>
        <div className="glass mx-auto grid max-w-4xl overflow-hidden rounded-2xl md:grid-cols-[200px_1fr]">
          <aside className="hidden border-r border-white/5 p-4 md:block">
            <Mark className="size-6" />
            <div className="mt-6 space-y-1 text-[13px]">
              {features.map((x, k) => (
                <div key={x.tab} className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2', k === i ? 'bg-white/[0.07] text-frost' : 'text-frost/45')}>
                  <x.icon className="size-4" />{x.tab}
                </div>
              ))}
            </div>
          </aside>
          <div key={i} className="animate-rise p-5 sm:p-7">
            <div className="flex items-center gap-2 text-frost"><f.icon className="size-5 text-glacier" /><p className="text-lg">{f.tab}</p></div>
            <p className="mt-2 max-w-md text-sm text-frost/65">{f.lead}</p>
            <div className="mt-6 divide-y divide-white/5 rounded-xl bg-black/20">
              {f.rows.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-3 text-[13px]">
                  <span className="text-frost/55">{k}</span>
                  <span className="text-right font-mono text-[12px] text-frost">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const modes = [
  { icon: Lock, name: 'Open listing', blurb: 'Public in the market and searchable.', items: ['Public search and category browse', 'Offers and counteroffers', 'Encrypted file or capsule delivery', 'Buyer acceptance before payout'], cta: 'List publicly' },
  { icon: KeyRound, name: 'Unlisted link', blurb: 'Hidden from search; shared by URL.', items: ['Everything in Open', 'Excluded from browse and search', 'Encrypted negotiation threads', 'Signed receipts and proofs', 'Share the link in your own channel'], cta: 'Create a link', featured: true },
  { icon: Ticket, name: 'Private invitation', blurb: 'One buyer, one use, one capability.', items: ['Single-use hashed capability', 'Designated buyer', 'Fixed or negotiable price', 'Expiry and revocation', 'Trade Passport for both sides'], cta: 'Invite a buyer' },
]

function Selling() {
  return (
    <section id="selling" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <SectionHead tag="Ways to sell" title="Choose how visible your work is" aside="Pick how many people can see the listing. Every option has the same escrow and buyer-acceptance protection." />
      <div className="mt-12 grid gap-4 md:grid-cols-3 md:items-end">
        {modes.map((m) => (
          <div key={m.name} className={cn('relative flex flex-col rounded-2xl p-6', m.featured ? 'bg-frost text-ink md:pb-8 md:pt-10' : 'border bg-card text-frost')}>
            {m.featured && <span className="absolute inset-x-0 top-0 rounded-t-2xl bg-glacier py-1 text-center text-[11px] font-medium text-ink">Most sellers start here</span>}
            <m.icon className={cn('size-6', m.featured ? 'text-ink' : 'text-frost/80')} />
            <p className="mt-5 text-[15px] font-medium">{m.name}</p>
            <p className={cn('mt-1 text-[13px]', m.featured ? 'text-ink/60' : 'text-muted-foreground')}>{m.blurb}</p>
            <div className={cn('my-5 h-px', m.featured ? 'bg-ink/10' : 'bg-white/10')} />
            <ul className="space-y-2.5 text-[13px]">
              {m.items.map((it) => (
                <li key={it} className="flex items-center gap-2">
                  <span className={cn('grid size-4 place-items-center rounded-[4px]', m.featured ? 'bg-ink text-frost' : 'bg-white/10')}><Check className="size-3" strokeWidth={3} /></span>{it}
                </li>
              ))}
            </ul>
            <Link to="/studio/new" className={cn('mt-8 inline-flex items-center justify-center gap-1 rounded-lg py-2.5 text-[13px] font-medium', m.featured ? 'bg-ink text-frost' : 'bg-frost text-ink')}>
              {m.cta} <ChevronRight className="size-4" />
            </Link>
            <p className={cn('mt-2 text-center text-[11px]', m.featured ? 'text-ink/50' : 'text-frost/40')}>Testnet ZEC · mock settlement</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const sees = [
  { who: 'Database observer', can: 'Ciphertext, listing prices, order states', cannot: 'Capsule content, conversation text, evidence' },
  { who: 'Platform operator', can: 'Offer amounts, timestamps, payout holds', cannot: 'Content keys or buyer private keys' },
  { who: 'Public visitor', can: 'Live listings and re-encoded previews', cannot: 'Buyers, offers or any transaction feed' },
  { who: 'Assigned reviewer', can: 'Dispute evidence the buyer chose to share', cannot: 'Anything not explicitly consented' },
]

function Privacy() {
  return (
    <section id="privacy" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <SectionHead tag="Privacy model" title="Who can see what" aside="This is the threat model in plain terms. The full model and the known gaps are in the protocol docs." />
      <div className="mt-12 grid overflow-hidden rounded-2xl border md:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col justify-between gap-10 bg-card p-7 sm:p-9">
          <div>
            <EyeOff className="size-6 text-glacier" />
            <p className="mt-6 text-[22px] leading-snug tracking-[-0.01em] text-frost sm:text-[26px]">
              “The server does not receive capsule plaintext keys or buyer private keys. An observer with only database and storage access cannot decrypt capsule content, conversations or reviewer evidence.”
            </p>
          </div>
          <p className="flex items-center gap-3 text-[13px] text-frost/60"><ShieldCheck className="size-4" />From the Gallery Arcana threat model</p>
        </div>
        <div className="relative isolate grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          <div className="absolute inset-0 -z-10 opacity-80"><Landscape /></div>
          {sees.map((s) => (
            <div key={s.who} className="rounded-xl bg-frost p-4 text-ink shadow-lg shadow-black/20">
              <p className="text-[13px] font-semibold">{s.who}</p>
              <p className="mt-3 text-[11px] uppercase tracking-wider text-ink/45">Can see</p>
              <p className="text-[13px] text-ink/80">{s.can}</p>
              <p className="mt-2 text-[11px] uppercase tracking-wider text-ink/45">Cannot see</p>
              <p className="text-[13px] text-ink/80">{s.cannot}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const faq = [
  ['Is this real money?', 'No. The current build uses a mock wallet on Zcash testnet. Real Zcash and mainnet remain disabled until the live-testnet acceptance gate passes.'],
  ['Do I need an email?', 'No. You need an alias and a passphrase of at least 12 characters. Sessions are HttpOnly cookies that you can rotate and revoke.'],
  ['What if the file is not what was described?', 'Funds stay on hold after payment. The buyer can open a dispute and share selected evidence with an assigned reviewer, who can release or refund.'],
  ['Does a proof mean I legally own it?', 'No. Signed receipts show a historical platform claim, and asset-control checks show technical control at one point in time. Neither is legal title.'],
]

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-28 sm:px-6">
      <h2 className="text-center text-[28px] tracking-[-0.02em] text-frost">Questions</h2>
      <div className="mt-8 divide-y divide-white/5 border-y">
        {faq.map(([q, a]) => (
          <details key={q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] text-frost">{q}<ChevronRight className="size-4 text-frost/40 transition group-open:rotate-90" /></summary>
            <p className="mt-2 text-sm text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function Cta() {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-28 sm:px-6">
      <div className="relative isolate overflow-hidden rounded-3xl px-6 py-20 text-center">
        <div className="absolute inset-0 -z-10"><Landscape /></div>
        <div className="absolute inset-0 -z-10 bg-ink/35" />
        <h2 className="mx-auto max-w-md text-[30px] leading-tight tracking-[-0.02em] text-frost sm:text-[38px]">Bring your work <span className="font-serif italic">into the vault</span></h2>
        <p className="mx-auto mt-3 max-w-sm text-sm text-frost/70">Seal a file, set a price and share it publicly, as an unlisted link or by private invitation.</p>
        <div className="mt-7 flex justify-center gap-3">
          <Link to="/studio/new" className="rounded-full bg-ink px-5 py-2 text-[13px] font-medium text-frost">Start selling</Link>
          <Link to="/market" className="rounded-full bg-frost px-5 py-2 text-[13px] font-medium text-ink">Browse the market</Link>
        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  return (
    <>
      <Hero />
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
