import { useState } from 'react'
import { BadgeCheck, RefreshCw, XCircle } from 'lucide-react'
import * as sdk from '@arcana/client-crypto'
import { PageShell } from '@/components/page-shell'
import { DotText } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Outcome = { ok: boolean; lines: string[] } | null

function Result({ r }: { r: Outcome }) {
  if (!r) return null
  return (
    <div className={cn('mt-4 rounded-xl border p-4 text-[13px]', r.ok ? 'border-emerald-700/30 bg-emerald-700/[0.05]' : 'border-destructive/30 bg-destructive/[0.05]')}>
      <p className={cn('flex items-center gap-2 font-medium', r.ok ? 'text-emerald-700' : 'text-destructive')}>{r.ok ? <BadgeCheck className="size-4" /> : <XCircle className="size-4" />}{r.ok ? 'Valid' : 'Not valid'}</p>
      <ul className="mt-2 space-y-1 text-fg/70">{r.lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  )
}
const parse = (t: string) => { try { return JSON.parse(t) } catch { return undefined } }

/** Public verification. Needs no account, so any counterparty or third party can check a claim. */
export default function Verify() {
  const [receipt, setReceipt] = useState('')
  const [rRes, setRRes] = useState<Outcome>(null)
  const [passport, setPassport] = useState('')
  const [audience, setAudience] = useState('')
  const [nonce, setNonce] = useState(() => sdk.b64(crypto.getRandomValues(new Uint8Array(32))))
  const [presentation, setPresentation] = useState('')
  const [pRes, setPRes] = useState<Outcome>(null)

  const checkReceipt = async () => {
    const proof = parse(receipt)
    if (!proof) return setRRes({ ok: false, lines: ['That is not valid JSON'] })
    const { valid } = await api.verifyProof(proof).catch(() => ({ valid: false }))
    setRRes({ ok: valid, lines: valid ? ['Ed25519 signature matches the published Gallery Arcana key', 'Shows a platform acquisition record. It is not legal title or onchain settlement.'] : ['Signature or format did not verify'] })
  }
  const checkPassport = async () => {
    const proof = parse(passport)
    if (!proof) return setPRes({ ok: false, lines: ['Passport is not valid JSON'] })
    const res = await api.verifyPassport(proof, audience.trim()).catch(() => ({ valid: false }))
    const lines: string[] = []
    if (!res.valid) return setPRes({ ok: false, lines: ['Signature, audience, expiry or revocation check failed'] })
    const claim = (res as { claim?: sdk.TradeClaim }).claim
    if (claim) lines.push(claim.kind === 'completed_acquisition' ? 'Holder completed at least one acquisition' : `Holder completed ${claim.disclosedCount ?? `at least ${claim.minimum}`} deliveries as seller`, `Audience “${claim.audience}”, expires ${new Date(claim.expiresAt).toLocaleString()}`)
    const pres = parse(presentation)
    if (!pres) return setPRes({ ok: false, lines: [...lines, 'Holder proof missing. Without it anyone who copied the passport could present it.'] })
    const holder = await sdk.verifyPassportPresentation(proof, nonce, pres).catch(() => false)
    setPRes({ ok: holder, lines: [...lines, holder ? 'Holder signed your one-time nonce with the bound key' : 'Holder proof did not match this passport or nonce'] })
  }

  return (
    <PageShell>
      <span className="eyebrow">Verify</span>
      <h1 className="dot-display mt-5 text-[34px] leading-none text-fg sm:text-[48px]"><DotText>Check a claim.</DotText></h1>
      <p className="mt-4 max-w-xl text-[15px] text-fg/65">You don't need an account. Check signed purchase receipts and Trade Passports against Gallery Arcana's published keys. The holder discloses only what's inside.</p>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-[15px] text-fg">Purchase receipt</p>
          <p className="mt-1 text-[13px] text-fg/60">Paste the signed receipt JSON the buyer shared with you.</p>
          <Textarea rows={8} className="mt-4 font-mono text-[11px]" value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder='{"claim": …, "signature": …}' />
          <Button className="mt-3 h-10" disabled={!receipt} onClick={checkReceipt}>Verify receipt</Button>
          <Result r={rRes} />
        </section>
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-[15px] text-fg">Trade Passport</p>
          <p className="mt-1 text-[13px] text-fg/60">Give the holder this nonce. They sign it in Studio → Proofs, which shows the passport is theirs.</p>
          <div className="mt-4 flex gap-2">
            <Input readOnly className="h-9 font-mono text-[11px]" value={nonce} onFocus={(e) => e.target.select()} />
            <Button size="sm" variant="outline" className="h-9" onClick={() => setNonce(sdk.b64(crypto.getRandomValues(new Uint8Array(32))))}><RefreshCw className="size-3.5" /></Button>
          </div>
          <Input className="mt-3 h-9" placeholder="Audience you are verifying as" value={audience} onChange={(e) => setAudience(e.target.value)} />
          <Textarea rows={4} className="mt-3 font-mono text-[11px]" value={passport} onChange={(e) => setPassport(e.target.value)} placeholder="Passport JSON" />
          <Textarea rows={3} className="mt-3 font-mono text-[11px]" value={presentation} onChange={(e) => setPresentation(e.target.value)} placeholder="Holder proof JSON" />
          <Button className="mt-3 h-10" disabled={!passport || !audience} onClick={checkPassport}>Verify passport</Button>
          <Result r={pRes} />
        </section>
      </div>
    </PageShell>
  )
}
