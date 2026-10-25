import { useEffect, useState } from 'react'
import { FileLock2 } from 'lucide-react'
import { toast } from 'sonner'
import * as sdk from '@arcana/client-crypto'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import { Fingerprint, usePinConfirm, useVault, VaultGate } from './vault'

/** Consent-based dispute evidence, sealed to the assigned reviewer's key and to nobody else. */
export function EvidencePanel({ orderId }: { orderId: string }) {
  const vault = useVault()
  const pins = usePinConfirm()
  const [reviewer, setReviewer] = useState<sdk.PublicIdentity | null | undefined>(undefined)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [consent, setConsent] = useState(false)
  const [sent, setSent] = useState<string[]>([])
  useEffect(() => { api.reviewer(orderId).then((r) => setReviewer(r.reviewerIdentity)).catch(() => setReviewer(null)) }, [orderId])

  const submit = async () => {
    if (!vault.identity || !reviewer) return
    try {
      if (file && file.size > 32768) throw new Error('Evidence attachments are limited to 32 KB')
      if (!(await pins.confirm(vault.identity.public.accountId, reviewer, 'reviewer'))) return
      const attachments = file ? [await sdk.attachment(file.name, new Uint8Array(await file.arrayBuffer()))] : undefined
      const envelope = await sdk.sealEnvelope(vault.identity, reviewer, reviewer.fingerprint, {
        origin: vault.identity.public.origin, purpose: 'evidence', resourceId: orderId, nonce: crypto.randomUUID(),
        senderAccountId: vault.identity.public.accountId, recipientAccountId: reviewer.accountId, expiresAt: new Date(Date.now() + 29 * 86400000).toISOString(),
      }, sdk.encode({ text: text.trim(), attachments }))
      const r = await api.submitEvidence(orderId, envelope)
      setSent((s) => [...s, r.ciphertextSha256]); setText(''); setFile(null); setConsent(false)
      toast.success('Evidence sealed to the reviewer')
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="mt-6 border-t pt-6">
      <p className="flex items-center gap-2 text-fg"><FileLock2 className="size-4 text-signal" />Dispute evidence</p>
      {reviewer === undefined ? null : reviewer === null ? (
        <p className="mt-1 text-[13px] text-fg/60">Funds are frozen. Once an independent reviewer is assigned, you can share selected evidence encrypted to them alone.</p>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-[13px] text-fg/60">Only the assigned reviewer (<Fingerprint value={reviewer.fingerprint} />) can open what you send. The operator sees only that evidence exists.</p>
          <VaultGate vault={vault} purpose="seal evidence" />
          <Textarea rows={4} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe what is wrong. Include only what you are willing to disclose." />
          <input type="file" className="text-[12.5px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <label className="flex items-start gap-2 text-[12.5px] text-fg/70"><input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I consent to disclosing this evidence to the assigned reviewer for this dispute.</label>
          <Button className="h-9" disabled={!consent || !text.trim() || !vault.identity} onClick={submit}>Seal &amp; send</Button>
          {sent.map((h) => <p key={h} className="font-mono text-[11px] text-fg/50">sent · ciphertext {h.slice(0, 16)}…</p>)}
        </div>
      )}
      {pins.dialog}
    </div>
  )
}
