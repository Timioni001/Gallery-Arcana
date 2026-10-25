import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Copy, FolderGit2, Globe, Stamp, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import * as sdk from '@arcana/client-crypto'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, type OrderSummary } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useVault, VaultGate } from './vault'

const copy = (v: string) => { void navigator.clipboard.writeText(v); toast.success('Copied') }

function Card({ title, icon: Icon, children, sub }: { title: string; sub: string; icon: typeof Stamp; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6">
      <p className="flex items-center gap-2 text-[15px] text-fg"><Icon className="size-4 text-signal" />{title}</p>
      <p className="mt-1 max-w-xl text-[13px] text-fg/60">{sub}</p>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Passports() {
  const vault = useVault()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [kind, setKind] = useState<'completed_acquisition' | 'seller_deliveries'>('completed_acquisition')
  const [orderId, setOrderId] = useState('')
  const [minimum, setMinimum] = useState(1)
  const [disclose, setDisclose] = useState(false)
  const [audience, setAudience] = useState('')
  const [hours, setHours] = useState(24)
  const [proof, setProof] = useState<{ claim: { id: string; audience: string; holderFingerprint: string } } | null>(null)
  const [nonce, setNonce] = useState('')
  const [presentation, setPresentation] = useState('')
  useEffect(() => { api.orders().then((o) => setOrders(o.filter((x) => x.status === 'paid'))).catch(() => {}) }, [])

  const issue = async () => {
    try {
      const p = await api.issuePassport(kind === 'completed_acquisition' ? { kind, orderId, audience, hours } : { kind, minimum, discloseCount: disclose, audience, hours })
      setProof(p as never); setPresentation(''); toast.success('Passport issued and signed')
    } catch (e) { toast.error((e as Error).message) }
  }
  const present = async () => {
    if (!proof || !vault.identity) return
    try { setPresentation(JSON.stringify(await sdk.passportPresentation(vault.identity, proof, nonce.trim()), null, 2)) } catch (e) { toast.error((e as Error).message) }
  }
  const revoke = async () => {
    if (!proof) return
    try { await api.revokePassport(proof.claim.id); toast.success('Passport revoked'); setProof(null) } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <Card icon={Stamp} title="Trade Passport" sub="Prove one fact, such as a completed purchase or 10+ deliveries, to one named audience, without publishing your history. Each passport is bound to your key fingerprint and expires.">
      <VaultGate vault={vault} purpose="bind a passport to your keys" />
      {vault.identity && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex gap-1.5">
              {([['completed_acquisition', 'A purchase I completed'], ['seller_deliveries', 'Deliveries as seller']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setKind(v)} className={cn('rounded-full px-3 py-1 text-[12.5px]', kind === v ? 'bg-fg text-surface' : 'bg-fg/[0.05] text-fg/70')}>{l}</button>
              ))}
            </div>
            {kind === 'completed_acquisition' ? (
              <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="h-10 w-full rounded-lg border bg-surface px-3 text-[13px]">
                <option value="">Choose a completed purchase…</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.title} · {shortDate(o.created_at)}</option>)}
              </select>
            ) : (
              <div className="flex items-center gap-3 text-[13px]">
                <Label>At least</Label><Input type="number" min={1} className="h-9 w-24" value={minimum} onChange={(e) => setMinimum(Math.max(1, Number(e.target.value)))} />
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={disclose} onChange={(e) => setDisclose(e.target.checked)} />reveal exact count</label>
              </div>
            )}
            <Input className="h-10" placeholder="Audience, e.g. the verifier's name or site" maxLength={120} value={audience} onChange={(e) => setAudience(e.target.value)} />
            <div className="flex items-center gap-3 text-[13px]"><Label>Valid for</Label><Input type="number" min={1} max={168} className="h-9 w-20" value={hours} onChange={(e) => setHours(Number(e.target.value))} /> hours</div>
            <Button className="h-10" disabled={!audience || (kind === 'completed_acquisition' && !orderId)} onClick={issue}>Issue passport</Button>
          </div>
          {proof && (
            <div className="space-y-3">
              <div className="flex items-center justify-between"><p className="text-[13px] text-fg">Signed passport</p><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => copy(JSON.stringify(proof))}><Copy className="size-3.5" /></Button><Button size="sm" variant="ghost" className="text-destructive" onClick={revoke}>Revoke</Button></div></div>
              <pre className="max-h-40 overflow-auto rounded-xl bg-paper p-3 font-mono text-[10.5px] text-fg/70">{JSON.stringify(proof, null, 2)}</pre>
              <p className="text-[12px] text-fg/60">To prove you are the holder, sign the verifier's one-time nonce:</p>
              <div className="flex gap-2"><Input className="h-9 font-mono text-[12px]" placeholder="Verifier nonce" value={nonce} onChange={(e) => setNonce(e.target.value)} /><Button size="sm" className="h-9" disabled={!nonce} onClick={present}>Sign</Button></div>
              {presentation && <pre onClick={() => copy(presentation)} className="max-h-32 cursor-copy overflow-auto rounded-xl bg-paper p-3 font-mono text-[10.5px] text-fg/70">{presentation}</pre>}
              <p className="text-[12px] text-fg/50">The verifier checks both at <Link to="/verify" className="text-signal">/verify</Link>.</p>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

type Challenge = { challengeId: string; kind: string; subject: string; statement: string; record?: string; path?: string; branch?: string; value?: string; signatureStandard?: string }
declare global { interface Window { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } } }

function AssetControl() {
  const [kind, setKind] = useState<'dns' | 'github' | 'evm'>('dns')
  const [subject, setSubject] = useState('')
  const [ch, setCh] = useState<Challenge | null>(null)
  const [signature, setSignature] = useState('')
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const load = () => api.controlVerifications().then(setRows).catch(() => {})
  useEffect(() => { void load() }, [])
  const create = async () => {
    try { setCh(await api.controlChallenge({ kind, subject: subject.trim() }) as unknown as Challenge); setSignature('') } catch (e) { toast.error((e as Error).message) }
  }
  const signWithWallet = async () => {
    if (!ch || !window.ethereum) return toast.error('No browser wallet found. Sign the statement elsewhere and paste the signature.')
    try {
      const hex = '0x' + [...new TextEncoder().encode(ch.statement)].map((b) => b.toString(16).padStart(2, '0')).join('')
      setSignature(String(await window.ethereum.request({ method: 'personal_sign', params: [hex, ch.subject.split(':').pop()] })))
    } catch (e) { toast.error((e as Error).message) }
  }
  const verify = async () => {
    if (!ch) return
    try { await api.verifyControl(ch.challengeId, signature || undefined); toast.success('Control verified at this moment'); setCh(null); await load() } catch (e) { toast.error((e as Error).message) }
  }
  const placeholders = { dns: 'example.com', github: 'owner/repository', evm: '0x… wallet address' }
  return (
    <Card icon={Globe} title="Asset-control checks" sub="Show that you technically control a domain, a public GitHub repository or an EVM wallet right now. This is useful before selling digital property, but it is not proof of legal ownership or licensing rights.">
      <div className="flex flex-wrap gap-1.5">
        {([['dns', 'Domain', Globe], ['github', 'GitHub repo', FolderGit2], ['evm', 'EVM wallet', Wallet]] as const).map(([v, l, I]) => (
          <button key={v} onClick={() => { setKind(v); setCh(null) }} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px]', kind === v ? 'bg-fg text-surface' : 'bg-fg/[0.05] text-fg/70')}><I className="size-3.5" />{l}</button>
        ))}
      </div>
      <div className="mt-3 flex gap-2"><Input className="h-10 font-mono text-[13px]" placeholder={placeholders[kind]} value={subject} onChange={(e) => setSubject(e.target.value)} /><Button className="h-10" disabled={!subject.trim()} onClick={create}>Start</Button></div>
      {ch && (
        <div className="mt-4 space-y-2 rounded-xl bg-paper p-4 text-[13px]">
          {ch.kind === 'dns' && <><p>Add a DNS TXT record, then verify:</p><p className="font-mono text-[12px]">Name: <b>{ch.record}</b></p><p onClick={() => copy(ch.value!)} className="cursor-copy break-all font-mono text-[12px]">Value: <b>{ch.value}</b></p></>}
          {ch.kind === 'github' && <><p>Commit this file to the <b>{ch.branch}</b> branch of the public repository, then verify:</p><p className="font-mono text-[12px]">{ch.path}</p><p onClick={() => copy(ch.value!)} className="cursor-copy break-all font-mono text-[12px]">{ch.value}</p></>}
          {ch.kind === 'evm' && <>
            <p>Sign this statement with the wallet ({ch.signatureStandard}):</p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-fg/70">{ch.statement}</pre>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={signWithWallet}><Wallet className="size-3.5" />Sign with browser wallet</Button></div>
            <Input className="h-9 font-mono text-[11px]" placeholder="0x… signature" value={signature} onChange={(e) => setSignature(e.target.value)} />
          </>}
          <Button size="sm" className="mt-2" disabled={ch.kind === 'evm' && !signature} onClick={verify}>Verify now</Button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="mt-5 divide-y rounded-xl border">
          {rows.map((r) => (
            <div key={String(r.id)} className="flex items-center justify-between px-4 py-2.5 text-[13px]">
              <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-emerald-700" /><span className="font-mono">{String(r.subject)}</span><span className="text-fg/45">{String(r.kind)}</span></span>
              <span className="text-[12px] text-fg/50">verified {shortDate(String(r.verified_at))} · valid until {shortDate(String(r.expires_at))}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function Proofs() {
  return <div className="space-y-4"><Passports /><AssetControl /></div>
}
