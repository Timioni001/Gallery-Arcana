import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Paperclip } from 'lucide-react'
import * as sdk from '@arcana/client-crypto'
import { PageShell, Notice } from '@/components/page-shell'
import { DotText } from '@/components/brand'
import { api } from '@/lib/api'
import { peerKey } from '@/lib/vault'
import { Fingerprint, useVault, VaultGate } from '@/components/vault'

type Item = { id: string; from: string; text?: string; attachments?: { name: string; bytes: string }[]; error?: string; expires: string }

/** Reviewer workspace: evidence is decrypted only here, with the reviewer's own keys. */
export default function Review() {
  const { orderId = '' } = useParams()
  const vault = useVault()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!vault.identity) return
    const me = vault.identity
    api.evidence(orderId).then(async (rows) => {
      const out: Item[] = []
      for (const r of rows) {
        try {
          const sender = await peerKey(r.submitter_id, r.envelope.senderKeyId)
          const p = sdk.decode(await sdk.openEnvelope(me, sender, sender.fingerprint, r.envelope, { purpose: 'evidence', resourceId: orderId, allowExpired: true }))
          out.push({ id: r.id, from: sender.fingerprint, text: p.text, attachments: p.attachments, expires: r.expires_at })
        } catch { out.push({ id: r.id, from: r.submitter_id, error: 'Could not authenticate or decrypt', expires: r.expires_at }) }
      }
      setItems(out)
    }).catch(() => setError('You are not the assigned reviewer for this order, or it has no evidence.'))
  }, [orderId, vault.identity])
  const save = (a: { name: string; bytes: string }) => { const u = URL.createObjectURL(new Blob([sdk.unb64(a.bytes).slice()])); const el = document.createElement('a'); el.href = u; el.download = a.name; el.click(); URL.revokeObjectURL(u) }

  return (
    <PageShell>
      <span className="eyebrow">Reviewer</span>
      <h1 className="dot-display mt-5 text-[34px] leading-none text-fg"><DotText>Sealed evidence.</DotText></h1>
      <p className="mt-3 max-w-xl text-[14px] text-fg/60">Order {orderId.slice(0, 8)}. Evidence is decrypted in this browser with your reviewer keys. Record your decision with the operator, who resolves it through the loopback admin endpoint.</p>
      <div className="mt-8 max-w-2xl space-y-3">
        <VaultGate vault={vault} purpose="open evidence sealed to you" />
        {error && <Notice>{error}</Notice>}
        {items?.length === 0 && <Notice>No evidence has been shared yet.</Notice>}
        {items?.map((i) => (
          <div key={i.id} className="rounded-2xl border bg-card p-5 text-[13.5px]">
            <p className="text-[12px] text-fg/50">From key <Fingerprint value={i.from} /> · available until {new Date(i.expires).toLocaleDateString()}</p>
            {i.error ? <p className="mt-2 text-destructive">{i.error}</p> : <p className="mt-2 whitespace-pre-wrap text-fg">{i.text}</p>}
            {i.attachments?.map((a) => <button key={a.name} onClick={() => save(a)} className="mt-2 flex items-center gap-1.5 text-[12px] text-fg/70 underline"><Paperclip className="size-3" />{a.name}</button>)}
          </div>
        ))}
      </div>
    </PageShell>
  )
}
