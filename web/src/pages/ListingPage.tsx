import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileLock2, Link2, Lock, Package, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell, Notice } from '@/components/page-shell'
import { ListingArt } from '@/components/listing-art'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError, type Listing, type Offer } from '@/lib/api'
import { categoryLabel, sentence, shortDate, toCents, usd } from '@/lib/format'
import { saveReceipt } from '@/lib/receipts'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { useVault, VaultGate } from '@/components/vault'
import { MessageThreadButton } from '@/components/message-thread'
import { InvitationPanel } from '@/components/invitation-panel'

const delivery = {
  download: { icon: Lock, text: 'Encrypted file, delivered after your payment confirms' },
  manual: { icon: Package, text: 'Hand delivery, coordinated with the seller' },
  external: { icon: Link2, text: 'Off-platform transfer such as a domain, repository or token' },
}

export default function ListingPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { account } = useSession()
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [offers, setOffers] = useState<Offer[]>([])
  const [offerOpen, setOfferOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api.listing(id).then(setListing).catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'This listing is unavailable.' : 'Could not reach the API.'))
  useEffect(() => { void load() }, [id])
  useEffect(() => { if (account) api.offers().then((o) => setOffers(o.filter((x) => x.listing_id === id && x.am_buyer))).catch(() => {}) }, [account, id])

  const accepted = offers.find((o) => o.status === 'accepted')
  const open = offers.find((o) => ['open', 'countered'].includes(o.status))
  const capsuleReady = offers.some((o) => o.capsule_ready && ['open', 'countered', 'accepted'].includes(o.status))
  const vault = useVault()
  const requestAtAsk = async () => {
    if (!listing) return
    setBusy(true)
    try { await api.offer(id, listing.price_usd_cents); toast.success('Request sent. The seller seals your key next.'); setOffers((await api.offers()).filter((x) => x.listing_id === id && x.am_buyer)) }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const checkout = async (offerId?: string) => {
    if (!account) return nav(`/auth?next=/listing/${id}`)
    setBusy(true)
    try {
      const r = await api.checkout(id, offerId)
      saveReceipt(r.orderId, r.receiptCode)
      nav(`/orders/${r.orderId}`, { state: { receiptCode: r.receiptCode, fresh: true } })
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const makeOffer = async () => {
    const cents = toCents(amount)
    if (!cents || cents < 50) return toast.error('Enter an amount of at least $0.50')
    setBusy(true)
    try {
      await api.offer(id, cents)
      toast.success('Offer sent privately to the seller')
      setOfferOpen(false); setAmount('')
      setOffers((await api.offers()).filter((x) => x.listing_id === id && x.am_buyer))
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const respond = async (o: Offer, action: string) => {
    try { await api.actOnOffer(o.id, action, { expectedVersion: o.revision }); setOffers((await api.offers()).filter((x) => x.listing_id === id && x.am_buyer)); toast.success(sentence(action.replace('-', ' '))) }
    catch (e) { toast.error((e as Error).message) }
  }
  const toggle = async () => {
    if (!listing) return
    try { await api.setStatus(listing.id, listing.status === 'live' ? 'paused' : 'live'); await load() } catch (e) { toast.error((e as Error).message) }
  }

  if (error) return <PageShell><p className="py-24 text-center text-muted-foreground">{error} <Link className="text-signal" to="/market">Back to market</Link></p></PageShell>
  if (!listing) return <PageShell><div className="grid gap-10 md:grid-cols-2"><Skeleton className="aspect-[4/5] rounded-2xl" /><div className="space-y-4"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-32" /></div></div></PageShell>

  const D = delivery[listing.delivery]
  const automatic = listing.delivery === 'download'
  const capsule = listing.crypto_mode === 'capsule-v1'
  const buyable = listing.status === 'live' && !listing.is_seller

  return (
    <PageShell>
      <Link to="/market" className="inline-flex items-center gap-1.5 text-[13px] text-fg/60 hover:text-fg"><ArrowLeft className="size-4" />Market</Link>
      <div className="mt-6 grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-14">
        <div className="aspect-[4/5] overflow-hidden rounded-2xl border bg-muted"><ListingArt listing={listing} /></div>
        <div className="md:pt-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-fg/75">{categoryLabel[listing.category]}</span>
            {capsule && <span className="inline-flex items-center gap-1 rounded-full border border-signal/30 px-2.5 py-0.5 text-signal"><FileLock2 className="size-3" />Arcana Capsule</span>}
            {listing.visibility === 'unlisted' && <span className="rounded-full bg-fg/[0.06] px-2.5 py-0.5 text-fg/75">Unlisted</span>}
            {listing.status !== 'live' && <span className="rounded-full bg-stone/20 px-2.5 py-0.5 capitalize text-stone">{listing.status}</span>}
          </div>
          <h1 className="mt-4 text-[32px] leading-tight tracking-[-0.025em] text-fg sm:text-[40px]">{listing.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">by @{listing.seller_alias} · listed {shortDate(listing.created_at)}</p>
          <p className="mt-8 font-mono text-[28px] text-fg">{usd(listing.price_usd_cents)}</p>
          <p className="text-xs text-muted-foreground">Paid in testnet ZEC at checkout's fixed quote</p>

          {listing.description && <p className="mt-8 whitespace-pre-line text-[15px] leading-relaxed text-fg/80">{listing.description}</p>}

          <div className="mt-8 space-y-3 rounded-2xl border bg-card p-5 text-[13px]">
            <p className="flex items-start gap-2.5 text-fg/80"><D.icon className="mt-0.5 size-4 shrink-0 text-signal" />{D.text}</p>
            <p className="flex items-start gap-2.5 text-fg/80"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-signal" />The seller is paid only after you verify the file and accept, or after a dispute is resolved</p>
          </div>

          <div className="mt-8 space-y-3">
            {listing.is_seller ? (
              <div className="flex gap-3">
                <Button variant="outline" className="h-11 flex-1" onClick={toggle} disabled={!['live', 'paused'].includes(listing.status)}>{listing.status === 'live' ? 'Pause listing' : 'Make live'}</Button>
                <Link to="/studio" className={cn(buttonVariants(), 'h-11 flex-1')}>Open studio</Link>
              </div>
            ) : (
              capsule ? (
                <div className="space-y-3">
                  {account && <VaultGate vault={vault} purpose="buy a capsule (the seller seals the key to you)" />}
                  {capsuleReady && buyable && (
                    <Button className="h-11 w-full" disabled={busy} onClick={() => checkout(accepted?.id)}>
                      <Lock className="size-4" />{accepted ? `Checkout · ${usd(accepted.counter_usd_cents ?? accepted.amount_usd_cents)}` : `Buy now · ${usd(listing.price_usd_cents)}`}
                    </Button>
                  )}
                  {!capsuleReady && (open || accepted) && (
                    <div className="rounded-xl border bg-surface p-4 text-[13px] text-fg/70">
                      <p className="text-fg">Waiting for @{listing.seller_alias}</p>
                      <p className="mt-1">They accept your request and seal the content key to your fingerprint. Checkout opens here as soon as the key is sealed.</p>
                    </div>
                  )}
                  {!open && !accepted && (
                    <div className="flex gap-3">
                      <Button className="h-11 flex-1" disabled={!buyable || busy || (!!account && !vault.identity)} onClick={() => (account ? requestAtAsk() : nav(`/auth?next=/listing/${id}`))}>Request to buy</Button>
                      <Button variant="outline" className="h-11 flex-1" disabled={!buyable || (!!account && !vault.identity)} onClick={() => (account ? setOfferOpen(true) : nav(`/auth?next=/listing/${id}`))}>Make an offer</Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">Capsules are sealed for one buyer. Your request lets the seller encrypt the content key to your keys. Neither the market nor anyone else can open it.</p>
                </div>
              ) : (
              <>
                {accepted && automatic && buyable && (
                  <Button className="h-11 w-full" disabled={busy} onClick={() => checkout(accepted.id)}>Checkout at your accepted offer · {usd(accepted.counter_usd_cents ?? accepted.amount_usd_cents)}</Button>
                )}
                <div className="flex gap-3">
                  {automatic && <Button className="h-11 flex-1" disabled={!buyable || busy} onClick={() => checkout()}>Buy now</Button>}
                  <Button variant="outline" className="h-11 flex-1" disabled={!buyable || !!open} onClick={() => (account ? setOfferOpen(true) : nav(`/auth?next=/listing/${id}`))}>Make an offer</Button>
                </div>
                {!automatic && <p className="text-xs text-muted-foreground">This item is delivered outside the app, so it can be negotiated here but can't be checked out automatically.</p>}
              </>
              )
            )}
          </div>

          {listing.is_seller && listing.status === 'live' && capsule && <div className="mt-6"><InvitationPanel listing={listing} onChanged={() => void load()} /></div>}
          {account && !listing.is_seller && listing.status === 'live' && <div className="mt-6"><MessageThreadButton listingId={listing.id} sellerAlias={listing.seller_alias ?? 'seller'} /></div>}
          {offers.length > 0 && (
            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.14em] text-fg/45">Your offers</p>
              <div className="mt-3 divide-y divide-fg/5 rounded-xl border">
                {offers.map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
                    <div>
                      <p className="font-mono text-fg">{usd(o.amount_usd_cents)}{o.counter_usd_cents && <span className="text-stone"> → counter {usd(o.counter_usd_cents)}</span>}</p>
                      <p className="text-muted-foreground">{sentence(o.status)}</p>
                    </div>
                    <div className="flex gap-2">
                      {o.status === 'countered' && <><Button size="sm" onClick={() => respond(o, 'accept-counter')}>Accept counter</Button><Button size="sm" variant="ghost" onClick={() => respond(o, 'decline-counter')}>Decline</Button></>}
                      {o.status === 'open' && <Button size="sm" variant="ghost" onClick={() => respond(o, 'withdraw')}>Withdraw</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!account && <div className="mt-6"><Notice><Link className="text-signal" to={`/auth?next=/listing/${id}`}>Log in with your alias</Link> to buy or make an offer. No email required.</Notice></div>}
        </div>
      </div>

      <Dialog open={offerOpen} onOpenChange={setOfferOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make a private offer</DialogTitle>
            <DialogDescription>Only the seller sees it. Asking price is {usd(listing.price_usd_cents)}.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg/50">$</span>
            <Input autoFocus inputMode="decimal" placeholder="0.00" className="h-11 pl-7 font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && makeOffer()} />
          </div>
          <DialogFooter><Button className="h-10 w-full sm:w-auto" disabled={busy} onClick={makeOffer}>Send offer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
