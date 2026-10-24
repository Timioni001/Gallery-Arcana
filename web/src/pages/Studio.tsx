import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell, Notice } from '@/components/page-shell'
import { ListingArt } from '@/components/listing-art'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Listing, type Offer, type OrderSummary } from '@/lib/api'
import { sentence, shortDate, statusTone, toCents, usd } from '@/lib/format'
import { useSession } from '@/lib/session'
import { activePeerIdentity, sealKeyForBuyer } from '@/lib/vault'
import { usePinConfirm, useVault, VaultPanel } from '@/components/vault'
import { Messages } from '@/components/message-thread'
import { Proofs } from '@/components/proofs'
import { cn } from '@/lib/utils'

const tabs = ['listings', 'offers', 'messages', 'purchases', 'sales', 'proofs', 'keys', 'settings'] as const
type Tab = (typeof tabs)[number]

function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">{children}</div>
}
function Rows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-fg/5 overflow-hidden rounded-2xl border bg-card">{children}</div>
}

function Listings() {
  const [rows, setRows] = useState<Listing[] | null>(null)
  useEffect(() => { api.mine().then(setRows).catch(() => setRows([])) }, [])
  if (!rows) return <Skeleton className="h-48 rounded-2xl" />
  if (!rows.length) return <Empty>No listings yet. <Link className="text-signal" to="/studio/new">List your first work</Link></Empty>
  return (
    <Rows>
      {rows.map((l) => (
        <Link key={l.id} to={`/listing/${l.id}`} className="flex items-center gap-4 px-4 py-3 transition hover:bg-fg/[0.02]">
          <div className="size-12 shrink-0 overflow-hidden rounded-lg"><ListingArt listing={l} /></div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-fg">{l.title}</p>
            <p className="text-[12px] text-muted-foreground">{l.visibility} · {l.delivery} · rev {l.revision}</p>
          </div>
          <span className={cn('text-[12px] capitalize', statusTone[l.status])}>{l.status}</span>
          <span className="w-24 text-right font-mono text-[13px] text-fg">{usd(l.price_usd_cents)}</span>
        </Link>
      ))}
    </Rows>
  )
}

function Offers() {
  const [rows, setRows] = useState<Offer[] | null>(null)
  const [counter, setCounter] = useState<Record<string, string>>({})
  const load = () => api.offers().then(setRows).catch(() => setRows([]))
  useEffect(() => { void load() }, [])
  const vault = useVault()
  const pins = usePinConfirm()
  const [sealing, setSealing] = useState('')
  // Capsule sales need the content key sealed to this specific buyer before checkout.
  const seal = async (o: Offer) => {
    if (!vault.identity || !o.buyer_id) { toast.error('Set up your keys in Studio → Keys first'); return false }
    setSealing(o.id)
    try {
      const buyer = await activePeerIdentity(o.buyer_id)
      if (!buyer) throw new Error(`@${o.buyer_alias} has not created encryption keys yet`)
      if (!(await pins.confirm(vault.identity.public.accountId, buyer, o.buyer_alias ?? 'buyer'))) return false
      await sealKeyForBuyer(vault.identity, buyer, o.listing_id)
      toast.success(`Key sealed for @${o.buyer_alias}. Only their keys can open it.`)
      await load()
      return true
    } catch (e) { toast.error((e as Error).message); return false } finally { setSealing('') }
  }
  const act = async (o: Offer, action: string) => {
    if (action === 'accept' && o.crypto_mode === 'capsule-v1' && !o.capsule_ready && !(await seal(o))) return
    const counterUsdCents = action === 'counter' ? toCents(counter[o.id] ?? '') : undefined
    if (action === 'counter' && !counterUsdCents) return toast.error('Enter a counter amount')
    try { await api.actOnOffer(o.id, action, { counterUsdCents: counterUsdCents ?? undefined, expectedVersion: o.revision }); toast.success(sentence(action.replace('-', ' '))); await load() }
    catch (e) { toast.error((e as Error).message) }
  }
  if (!rows) return <Skeleton className="h-48 rounded-2xl" />
  if (!rows.length) return <Empty>No offers yet. Offers are private between buyer and seller.</Empty>
  return (
    <Rows>
      {rows.map((o) => (
        <div key={o.id} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <Link to={`/listing/${o.listing_id}`} className="truncate text-[14px] text-fg hover:underline">{o.listing_title}</Link>
            <p className="text-[12px] text-muted-foreground">{o.am_seller ? `From @${o.buyer_alias}` : 'Your offer'} · {shortDate(o.created_at)}
              {o.crypto_mode === 'capsule-v1' && <span className={cn('ml-2 inline-flex items-center gap-1', o.capsule_ready ? 'text-emerald-700' : 'text-signal')}><Lock className="size-3" />{o.capsule_ready ? 'Key sealed' : 'Key not sealed yet'}</span>}
            </p>
          </div>
          <p className="font-mono text-[13px] text-fg">{usd(o.amount_usd_cents)}{o.counter_usd_cents && <span className="text-stone"> / {usd(o.counter_usd_cents)}</span>}</p>
          <span className={cn('w-20 text-[12px]', statusTone[o.status])}>{sentence(o.status)}</span>
          {o.am_seller && o.status === 'open' && (
            <div className="flex items-center gap-2">
              <Button size="sm" disabled={sealing === o.id} onClick={() => act(o, 'accept')}>{o.crypto_mode === 'capsule-v1' && !o.capsule_ready ? 'Seal key & accept' : 'Accept'}</Button>
              <Input className="h-7 w-24 font-mono text-xs" placeholder="Counter $" value={counter[o.id] ?? ''} onChange={(e) => setCounter({ ...counter, [o.id]: e.target.value })} />
              <Button size="sm" variant="outline" onClick={() => act(o, 'counter')}>Counter</Button>
              <Button size="sm" variant="ghost" onClick={() => act(o, 'decline')}>Decline</Button>
            </div>
          )}
          {o.am_seller && o.crypto_mode === 'capsule-v1' && !o.capsule_ready && ['accepted', 'countered'].includes(o.status) && (
            <Button size="sm" variant="outline" disabled={sealing === o.id} onClick={() => seal(o)}><KeyRound className="size-3.5" />Seal key</Button>
          )}
          {o.am_buyer && o.status === 'countered' && <div className="flex gap-2"><Button size="sm" onClick={() => act(o, 'accept-counter')}>Accept counter</Button><Button size="sm" variant="ghost" onClick={() => act(o, 'decline-counter')}>Decline</Button></div>}
          {o.am_buyer && o.status === 'accepted' && <Link to={`/listing/${o.listing_id}`} className={buttonVariants({ size: 'sm' })}>Checkout</Link>}
        </div>
      ))}
      {pins.dialog}
    </Rows>
  )
}

function Orders({ kind }: { kind: 'purchases' | 'sales' }) {
  const [rows, setRows] = useState<OrderSummary[] | null>(null)
  useEffect(() => { (kind === 'purchases' ? api.orders() : api.sales()).then(setRows).catch(() => setRows([])) }, [kind])
  if (!rows) return <Skeleton className="h-48 rounded-2xl" />
  if (!rows.length) return <Empty>{kind === 'purchases' ? <>No purchases yet. <Link className="text-signal" to="/market">Browse the market</Link></> : 'No sales yet.'}</Empty>
  return (
    <Rows>
      {rows.map((o) => {
        const inner = (
          <>
            <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-fg">{o.title}</p><p className="text-[12px] text-muted-foreground">{shortDate(o.created_at)}</p></div>
            <span className={cn('text-[12px]', statusTone[o.status])}>{sentence(o.status)}</span>
            <span className="w-24 text-right font-mono text-[13px] text-fg">{usd(o.price_usd_cents)}</span>
          </>
        )
        return kind === 'purchases'
          ? <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-fg/[0.02]">{inner}</Link>
          : <div key={o.id} className="flex items-center gap-4 px-4 py-3.5">{inner}</div>
      })}
    </Rows>
  )
}

function Settings() {
  const { account, refresh } = useSession()
  const [address, setAddress] = useState('')
  const save = async () => {
    try { await api.setPayout(address.trim()); toast.success('Payout address saved'); setAddress(''); await refresh() } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <div className="max-w-lg space-y-4 rounded-2xl border bg-card p-6">
      <div>
        <p className="text-fg">Payout address</p>
        <p className="mt-1 text-[13px] text-muted-foreground">{account?.hasPayout ? 'A payout address is set. Saving a new one replaces it.' : 'Required before you can list. Testnet addresses only.'}</p>
      </div>
      <Input className="h-11 font-mono" placeholder="utest1… / ztestsapling1… / tm…" value={address} onChange={(e) => setAddress(e.target.value)} />
      <Button className="h-10" disabled={!address.trim()} onClick={save}>Save address</Button>
    </div>
  )
}

export default function Studio() {
  const { account, ready } = useSession()
  const [params, setParams] = useSearchParams()
  const tab = (tabs.includes(params.get('tab') as Tab) ? params.get('tab') : 'listings') as Tab
  if (ready && !account) return <Navigate to="/auth?next=/studio" replace />
  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="eyebrow">Studio</span>
          <h1 className="mt-4 text-[34px] tracking-[-0.025em] text-fg">@{account?.alias ?? '…'}</h1>
        </div>
        <Link to="/studio/new" className={cn(buttonVariants(), 'h-10 rounded-full px-4')}><Plus className="size-4" />New listing</Link>
      </div>
      {account && !account.hasPayout && <div className="mt-6"><Notice>Add a testnet payout address in <button className="text-signal" onClick={() => setParams({ tab: 'settings' })}>Settings</button> before listing.</Notice></div>}
      <div className="mt-8 flex gap-1 overflow-x-auto border-b [scrollbar-width:none]">
        {tabs.map((t) => (
          <button key={t} onClick={() => setParams({ tab: t })} className={cn('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] capitalize transition', t === tab ? 'border-signal text-fg' : 'border-transparent text-fg/55 hover:text-fg')}>{t}</button>
        ))}
      </div>
      <div className="mt-6">
        {tab === 'listings' && <Listings />}
        {tab === 'offers' && <Offers />}
        {tab === 'purchases' && <Orders kind="purchases" />}
        {tab === 'sales' && <Orders kind="sales" />}
        {tab === 'settings' && <Settings />}
        {tab === 'keys' && <VaultPanel />}
        {tab === 'messages' && <Messages />}
        {tab === 'proofs' && <Proofs />}
      </div>
    </PageShell>
  )
}
