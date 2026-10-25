import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Lock, MessageSquareLock, Paperclip, Send, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import * as sdk from '@arcana/client-crypto'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api, type Conversation } from '@/lib/api'
import { shortDate } from '@/lib/format'
import { peerKey } from '@/lib/vault'
import { cn } from '@/lib/utils'
import { Fingerprint, usePinConfirm, useVault, VaultGate } from './vault'

type Plain = { id: string; sequence: number; mine: boolean; at: string; text?: string; attachments?: { name: string; bytes: string; sha256: string }[]; error?: string }

/** Opens (or reuses) the buyer's encrypted thread with the seller of a listing. */
export function MessageThreadButton({ listingId, sellerAlias }: { listingId: string; sellerAlias: string }) {
  const nav = useNavigate()
  const vault = useVault()
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      const existing = (await api.conversations()).find((c) => c.listing_id === listingId && c.am_buyer)
      const conv = existing ?? await api.openConversation(listingId)
      nav(`/studio?tab=messages&c=${conv.id}`)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  if (vault.state && vault.state.state !== 'ready') return <VaultGate vault={vault} purpose="message the seller with end-to-end encryption" />
  return (
    <Button variant="outline" className="h-10 w-full" disabled={busy || !vault.identity} onClick={go}>
      <MessageSquareLock className="size-4" />Message @{sellerAlias} privately
    </Button>
  )
}

function Thread({ conv, onClosed }: { conv: Conversation; onClosed: () => void }) {
  const vault = useVault()
  const pins = usePinConfirm()
  const [peer, setPeer] = useState<sdk.PublicIdentity | null>(null)
  const [mine, setMine] = useState<sdk.PublicIdentity | null>(null)
  const [msgs, setMsgs] = useState<Plain[]>([])
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [problem, setProblem] = useState('')
  const seen = useRef(new Set<string>())
  const last = useRef(0)
  const me = vault.identity

  // Resolve both participant keys exactly as the server pinned them for this conversation.
  useEffect(() => {
    if (!me) return
    seen.current = new Set(); last.current = 0; setMsgs([]); setPeer(null); setProblem('')
    const myKeyId = conv.am_buyer ? conv.buyer_key_id : conv.seller_key_id
    if (me.public.keyId !== myKeyId) { setProblem('This thread was opened with keys this browser no longer holds. Restore the matching vault backup to read it.'); return }
    const peerId = conv.am_buyer ? conv.seller_id : conv.buyer_id
    const peerKeyId = conv.am_buyer ? conv.seller_key_id : conv.buyer_key_id
    void (async () => {
      try {
        const p = await peerKey(peerId, peerKeyId)
        if (!(await pins.confirm(me.public.accountId, p, conv.counterpart_alias))) { setProblem('You did not trust this key, so the thread stays closed.'); return }
        setMine(me.public); setPeer(p)
      } catch (e) { setProblem((e as Error).message) }
    })()
  }, [conv, me, pins.confirm])

  const poll = useCallback(async () => {
    if (!me || !peer) return
    const rows = await api.messages(conv.id, last.current)
    const fresh: Plain[] = []
    for (const r of rows) {
      last.current = Math.max(last.current, r.sequence)
      if (seen.current.has(r.id)) continue // replayed ids are dropped client-side as well
      seen.current.add(r.id)
      const sender = r.sender_id === me.public.accountId ? me.public : peer
      try {
        const p = await sdk.openConversation(me, sender, sender.fingerprint, conv.id, r.envelope)
        fresh.push({ id: r.id, sequence: r.sequence, mine: sender === me.public, at: r.created_at, text: p.text, attachments: p.attachments })
      } catch { fresh.push({ id: r.id, sequence: r.sequence, mine: false, at: r.created_at, error: 'Could not authenticate or decrypt this message' }) }
    }
    if (fresh.length) setMsgs((m) => [...m, ...fresh])
  }, [conv.id, me, peer])
  useEffect(() => { void poll(); const t = setInterval(() => void poll(), 4000); return () => clearInterval(t) }, [poll])

  const send = async () => {
    if (!me || !peer || !mine || (!text.trim() && !files.length)) return
    try {
      const attachments = await Promise.all(files.map(async (f) => sdk.attachment(f.name, new Uint8Array(await f.arrayBuffer()))))
      const buyer = conv.am_buyer ? mine : peer, seller = conv.am_buyer ? peer : mine
      const body = await sdk.encryptConversation(me, buyer, seller, { buyer: buyer.fingerprint, seller: seller.fingerprint }, conv.id, { text: text.trim(), attachments: attachments.length ? attachments : undefined }, new Date(conv.expires_at).toISOString())
      await api.postMessage(conv.id, body)
      setText(''); setFiles([]); await poll()
    } catch (e) { toast.error((e as Error).message) }
  }
  const remove = async () => {
    if (!confirm('Delete this conversation for both participants? This cannot be undone.')) return
    try { await api.closeConversation(conv.id); toast.success('Conversation deleted'); onClosed() } catch (e) { toast.error((e as Error).message) }
  }
  const download = (a: { name: string; bytes: string }) => {
    const url = URL.createObjectURL(new Blob([sdk.unb64(a.bytes).slice()])); const el = document.createElement('a'); el.href = url; el.download = a.name; el.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-[460px] flex-col rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div>
          <Link to={`/listing/${conv.listing_id}`} className="text-[14px] text-fg hover:underline">{conv.listing_title}</Link>
          <p className="text-[12px] text-fg/55">with @{conv.counterpart_alias} · expires {shortDate(conv.expires_at)}{peer && <> · key <Fingerprint value={peer.fingerprint} /></>}</p>
        </div>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={remove}><Trash2 className="size-3.5" />Delete</Button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {problem && <p className="text-[13px] text-destructive">{problem}</p>}
        {!problem && !msgs.length && <p className="py-10 text-center text-[13px] text-fg/50"><Lock className="mx-auto mb-2 size-4" />Messages are encrypted to both participants' keys. The market sees only who wrote and when, never the contents.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={cn('max-w-[80%] rounded-2xl px-4 py-2.5 text-[13.5px]', m.mine ? 'ml-auto bg-fg text-surface' : 'bg-paper text-fg', m.error && 'border border-destructive/40 bg-transparent text-destructive')}>
            {m.error ?? <p className="whitespace-pre-wrap">{m.text}</p>}
            {m.attachments?.map((a) => (
              <button key={a.sha256} onClick={() => download(a)} className={cn('mt-2 flex items-center gap-1.5 text-[12px] underline', m.mine ? 'text-surface/80' : 'text-fg/70')}><Paperclip className="size-3" />{a.name}</button>
            ))}
            <p className={cn('mt-1 text-[10.5px]', m.mine ? 'text-surface/50' : 'text-fg/40')}>{new Date(m.at).toLocaleString()}</p>
          </div>
        ))}
      </div>
      {!problem && (
        <div className="border-t p-3">
          {files.length > 0 && <p className="mb-2 text-[12px] text-fg/60">{files.map((f) => f.name).join(', ')}</p>}
          <div className="flex items-end gap-2">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} placeholder="Write a private message…" className="min-h-0 flex-1 resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send() }} />
            <label className="grid size-9 cursor-pointer place-items-center rounded-lg border text-fg/60 hover:text-fg" title="Attach files up to 32 KB each">
              <Paperclip className="size-4" />
              <input type="file" multiple className="sr-only" onChange={(e) => {
                const picked = [...(e.target.files ?? [])]
                if (picked.some((f) => f.size > 32768)) toast.error('Encrypted attachments are limited to 32 KB each')
                setFiles(picked.filter((f) => f.size <= 32768).slice(0, 8))
              }} />
            </label>
            <Button className="h-9" disabled={!peer} onClick={send}><Send className="size-3.5" /></Button>
          </div>
        </div>
      )}
      {pins.dialog}
    </div>
  )
}

/** Studio tab: list of active encrypted conversations plus the open thread. */
export function Messages() {
  const vault = useVault()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Conversation[] | null>(null)
  const load = () => api.conversations().then(setRows).catch(() => setRows([]))
  useEffect(() => { void load() }, [])
  const active = rows?.find((c) => c.id === params.get('c')) ?? rows?.[0]
  if (vault.state && vault.state.state !== 'ready') return <VaultGate vault={vault} purpose="read and send encrypted messages" />
  if (!rows) return <Skeleton className="h-64 rounded-2xl" />
  if (!rows.length) return <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">No conversations yet. Open one from any listing with “Message privately”.</div>
  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="divide-y overflow-hidden rounded-2xl border bg-card">
        {rows.map((c) => (
          <button key={c.id} onClick={() => setParams({ tab: 'messages', c: c.id })} className={cn('block w-full px-4 py-3 text-left transition hover:bg-paper', c.id === active?.id && 'bg-paper')}>
            <p className="truncate text-[13.5px] text-fg">{c.listing_title}</p>
            <p className="text-[12px] text-fg/55">@{c.counterpart_alias} · {c.am_buyer ? 'buying' : 'selling'} · {c.sequence} msg</p>
          </button>
        ))}
      </div>
      {active && vault.identity && <Thread key={active.id} conv={active} onClosed={() => { setParams({ tab: 'messages' }); void load() }} />}
    </div>
  )
}
