import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'

const UPDATED = '25 October 2026'

type Terms = { platformFeeBps?: number; minConfirmations?: number; escrow?: { reviewHours: number; disputeDecisionDays: number; demoReviewMinutes?: number } }

/** Live values from GET /api/terms, so the policy text always matches what the server enforces. */
function useTerms() {
  const [t, setT] = useState<Terms>({})
  useEffect(() => { fetch('/api/terms').then((r) => r.json()).then(setT).catch(() => {}) }, [])
  return t
}

function Doc({ tag, title, intro, toc, children }: { tag: string; title: string; intro: string; toc: [string, string][]; children: ReactNode }) {
  return (
    <PageShell>
      <div className="grid gap-10 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Sections" className="hidden lg:block">
          <ul className="sticky top-24 space-y-2 text-[13px] text-fg/60">
            {toc.map(([id, label]) => <li key={id}><a href={`#${id}`} className="hover:text-fg">{label}</a></li>)}
          </ul>
        </nav>
        <article className="max-w-2xl text-[15px] leading-relaxed text-fg/80 [&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:text-[22px] [&_h2]:tracking-[-0.015em] [&_h2]:text-fg [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
          <span className="eyebrow">{tag}</span>
          <h1 className="mt-4 text-[34px] leading-tight tracking-[-0.025em] text-fg sm:text-[42px]">{title}</h1>
          <p className="font-mono text-[12px] text-fg/45">Last updated {UPDATED}</p>
          <p className="text-[16px] text-fg/70">{intro}</p>
          {children}
        </article>
      </div>
    </PageShell>
  )
}

export function TermsPage() {
  const t = useTerms(), e = t.escrow
  const hours = e?.reviewHours ?? 72, days = e?.disputeDecisionDays ?? 14
  const fee = t.platformFeeBps === undefined ? null : `${(t.platformFeeBps / 100).toFixed(2).replace(/\.00$/, '')}%`
  return (
    <Doc tag="Terms" title="Terms of service" intro="These terms explain how buying, selling and escrow work on Gallery Arcana. They are written to match what the software enforces."
      toc={[['status', 'Testnet status'], ['accounts', 'Accounts'], ['use', 'Acceptable use'], ['selling', 'Selling'], ['payments', 'Payments'], ['escrow', 'Escrow'], ['disputes', 'Disputes'], ['fees', 'Fees'], ['auctions', 'Auctions'], ['proofs', 'Receipts and proofs'], ['liability', 'Liability'], ['changes', 'Changes']]}>
      <h2 id="status">1. Testnet status</h2>
      <p>Gallery Arcana is a preview. Payments use Zcash testnet or a simulated wallet, and testnet coins have no value. Real-money (mainnet) settlement is disabled. The public demo runs entirely in your browser and simulates payments and other users.</p>

      <h2 id="accounts">2. Accounts</h2>
      <ul>
        <li>An account is an alias and a passphrase. We don't ask for your name, email or ID.</li>
        <li>You are responsible for your passphrase and for backing up your browser key vault. We cannot recover encryption keys we never had.</li>
        <li>Receipt codes act like keys to an order. Keep them private; you can issue a new one at any time, which disables the old one.</li>
      </ul>

      <h2 id="use">3. Acceptable use</h2>
      <p>Lawful digital commerce only. You may not list or trade anything illegal where you or the buyer live, including stolen data or credentials, malware, material that infringes someone else's rights, or anything involving the exploitation of people. We may remove listings and close accounts that break these terms.</p>

      <h2 id="selling">4. Selling</h2>
      <ul>
        <li>You must have the right to sell what you list. Descriptions and previews must be accurate.</li>
        <li>For file sales, the file's SHA-256 fingerprint is recorded when the buyer checks out. The buyer receives exactly those bytes.</li>
        <li>Onchain assets and digital property can be listed and negotiated, but their transfer happens outside the platform and is not covered by automatic escrow release.</li>
      </ul>

      <h2 id="payments">5. Payments</h2>
      <ul>
        <li>Prices are set in US dollars. At checkout we quote an exact ZEC amount, a single-use shielded address and a memo. The invoice expires if it isn't paid in time.</li>
        <li>A payment counts once it has {t.minConfirmations ?? 2} confirmations.</li>
        <li>Underpayments, late payments and overpayments are never kept: the excess or the full amount can be reclaimed with your receipt code.</li>
      </ul>

      <h2 id="escrow">6. Escrow</h2>
      <p>Every file purchase is held in escrow. Here is exactly what happens to your money:</p>
      <ul>
        <li><b className="font-medium text-fg">Held.</b> Once your payment is confirmed, the order is funded and the full amount is held. The seller is not paid yet.</li>
        <li><b className="font-medium text-fg">Review window: {hours} hours.</b> You download the file, your browser checks its fingerprint, and you accept. Accepting releases the payment to the seller straight away.</li>
        <li><b className="font-medium text-fg">Automatic release.</b> If the review window ends with no acceptance and no dispute, the payment releases to the seller automatically. Silence counts as acceptance, so check your purchase promptly.</li>
        <li><b className="font-medium text-fg">Dispute.</b> Opening a dispute before the window ends freezes the funds. Disputes can't be opened after the window closes.</li>
        <li><b className="font-medium text-fg">Fixed per order.</b> The window is set when your order is funded. Later changes to these terms don't shorten it.</li>
      </ul>
      {e?.demoReviewMinutes && <p className="rounded-xl border bg-surface px-4 py-3 text-[13px]">In the public demo the review window is shortened to {e.demoReviewMinutes} minutes so you can watch an automatic release happen.</p>}

      <h2 id="disputes">7. Disputes</h2>
      <ul>
        <li>Explain the problem and, if you like, attach evidence. Evidence is encrypted to the assigned reviewer only.</li>
        <li>A reviewer decides within {days} days: release the payment to the seller, or refund the full amount you paid.</li>
        <li>Partial refunds are not offered. Every decision records the evidence it was based on.</li>
      </ul>

      <h2 id="fees">8. Fees</h2>
      <p>The platform fee is {fee ?? 'shown at checkout'} and applies to completed sales only. Refunds and cancelled orders pay no fee, and buyers pay no fee. Each order keeps the fee it was created with. The current fee and its history are published at <code className="font-mono text-[13px]">/api/terms</code>.</p>

      <h2 id="auctions">9. Auctions</h2>
      <p>Auctions use sealed bids. Other bidders see only how many bids there are. The highest bid wins and pays the second-highest bid or the reserve, whichever is higher. A winning bid is a commitment to buy at that price. In the demo, rival bidders are simulated and nothing is charged.</p>

      <h2 id="proofs">10. Receipts and proofs</h2>
      <p>When an order completes, the platform signs a receipt stating how it completed: accepted by the buyer, released automatically, or released by a reviewer. A receipt proves the transaction happened on Gallery Arcana. It does not prove legal ownership of the asset.</p>

      <h2 id="liability">11. Liability</h2>
      <p>The service is provided as is, during a testnet preview, without warranties. We aren't responsible for assets transferred outside the platform, for losses caused by lost passphrases, keys or receipt codes, or for the legality of a listing in your country.</p>

      <h2 id="changes">12. Changes</h2>
      <p>We may update these terms. The date at the top shows the latest version. Changes never alter the escrow window or the fee of an order that already exists. See also our <Link to="/privacy" className="text-signal">privacy policy</Link>.</p>
    </Doc>
  )
}

export function PrivacyPage() {
  const t = useTerms(), days = t.escrow?.disputeDecisionDays ?? 14
  return (
    <Doc tag="Privacy" title="Privacy policy" intro="Gallery Arcana is built to know as little about you as possible. This policy lists what we store, what we can't see, and when data is deleted."
      toc={[['short', 'The short version'], ['collect', 'What we store'], ['cannot', 'What we cannot see'], ['escrow', 'Escrow and disputes'], ['zcash', 'Zcash payments'], ['retention', 'Retention'], ['cookies', 'Cookies'], ['sharing', 'Sharing'], ['demo', 'The public demo'], ['choices', 'Your choices']]}>
      <h2 id="short">1. The short version</h2>
      <ul>
        <li>No real names, emails, phone numbers or ID checks are needed to trade.</li>
        <li>File contents and chat messages are encrypted in your browser. We never receive the keys.</li>
        <li>Payments are shielded Zcash. Amounts and addresses are hidden on chain.</li>
        <li>We never sell data. There are no ads and no third-party analytics.</li>
      </ul>

      <h2 id="collect">2. What we store</h2>
      <ul>
        <li><b className="font-medium text-fg">Account:</b> your alias, a salted hash of your passphrase, and your public encryption keys.</li>
        <li><b className="font-medium text-fg">Listings:</b> title, description, price, public preview (with image metadata stripped) and the encrypted file.</li>
        <li><b className="font-medium text-fg">Orders:</b> price, status, timestamps (funded, accepted, disputed, released), the file fingerprint, and the payment address and memo for that invoice.</li>
        <li><b className="font-medium text-fg">Offers:</b> offer and counteroffer amounts. These are readable by the operator so settlement can be checked.</li>
        <li><b className="font-medium text-fg">Waitlist:</b> your email and whether you collect, create or both. Nothing else.</li>
        <li><b className="font-medium text-fg">Abuse protection:</b> rate-limit counters keyed by a hash of your IP address, deleted within about an hour of each window ending.</li>
      </ul>

      <h2 id="cannot">3. What we cannot see</h2>
      <ul>
        <li>The contents of capsule files: they're encrypted before upload and each buyer gets a sealed key.</li>
        <li>The text and attachments of encrypted conversations.</li>
        <li>Dispute evidence, which is encrypted to the assigned reviewer only.</li>
        <li>Your wallet balance or history. We only see payments sent to the single-use invoice address.</li>
      </ul>

      <h2 id="escrow">4. Escrow and disputes</h2>
      <p>While an order is in escrow we keep the order record so we can release or refund it. If you open a dispute, the reason you give is stored with the order, and any evidence is readable only by the reviewer it's encrypted to. Evidence expires after at most 30 days, and a decision is due within {days} days.</p>

      <h2 id="zcash">5. Zcash payments</h2>
      <p>Shielded transactions hide the sender, recipient and amount on the blockchain. Observers see only that a transaction happened. Shielding doesn't hide what the marketplace itself records about an order, listed above.</p>

      <h2 id="retention">6. Retention</h2>
      <ul>
        <li>Sessions expire automatically and are deleted.</li>
        <li>30 days after an order settles or is refunded, we remove the link between it and the buyer, delete the payment notes and dispute evidence, and keep only what's needed to honour receipt codes.</li>
        <li>Orders under review or with an outstanding refund are kept until they're resolved.</li>
        <li>Expired invitations, passports, challenges, conversations and key envelopes are deleted on schedule.</li>
      </ul>

      <h2 id="cookies">7. Cookies</h2>
      <p>We set one cookie: your session. It's HttpOnly, SameSite=Strict and Secure over HTTPS. There are no tracking or advertising cookies.</p>

      <h2 id="sharing">8. Sharing</h2>
      <p>We don't sell or rent data, and identity disclosure is never sold. Sellers see the title, price and status of their sales, not who bought them. We'd only disclose records if legally required, and we can only disclose what we have, which is the list above.</p>

      <h2 id="demo">9. The public demo</h2>
      <p>The demo runs entirely in your browser. Accounts, listings, orders and keys are stored in your browser's IndexedDB and never leave your device. The only exception is the waitlist form: it sends your email and role to our Cloudflare-hosted storage. You can wipe your demo data at any time with <b className="font-medium text-fg">Reset my data</b> in the footer.</p>

      <h2 id="choices">10. Your choices</h2>
      <ul>
        <li>Issue a new receipt code at any time. The old one stops working.</li>
        <li>Back up or delete your browser key vault.</li>
      </ul>
      <p>See also our <Link to="/terms" className="text-signal">terms of service</Link>, including how <Link to="/terms#escrow" className="text-signal">escrow</Link> works.</p>
    </Doc>
  )
}
