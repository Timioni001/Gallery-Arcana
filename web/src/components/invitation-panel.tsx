import { useEffect, useState } from 'react'
import { Copy, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Listing, type Offer } from '@/lib/api'
import { toCents } from '@/lib/format'
import { activePeerIdentity, sealKeyForBuyer } from '@/lib/vault'
import { usePinConfirm, useVault } from './vault'

/** Seller tool for one-time private sales and exclusive drops. */
export function InvitationPanel({ listing, onChanged }: { listing: Listing; onChanged: () => void }) {
  const [buyers, setBuyers] = useState<Offer[]>([])
  const [buyerId, setBuyerId] = useState('')
  const [price, setPrice] = useState('')
  const [hours, setHours] = useState(24)
  const [link, setLink] = useState('')
  const [inviteId, setInviteId] = useState('')
  const vault = useVault()
  const pins = usePinConfirm()
  useEffect(() => {
    api.offers().then((o) => {
      const seen = new Set<string>()
      setBuyers(o.filter((x) => x.am_seller && x.listing_id === listing.id && x.buyer_id && !seen.has(x.buyer_id) && seen.add(x.buyer_id)))
    }).catch(() => {})
  }, [listing.id])
  const capsule = listing.crypto_mode === 'capsule-v1'

  const create = async () => {
    const cents = price ? toCents(price) : undefined
    if (price && !cents) return toast.error('Enter a valid price')
    try {
      const r = await api.createInvitation(listing.id, { buyerId: buyerId || undefined, priceUsdCents: cents ?? undefined, hours })
      const id = r.invitationId ?? r.id ?? ''
      setInviteId(id)
      setLink(`${window.location.origin}/invite/${id}#${r.capability}`)
      // A designated buyer of a capsule can have their key sealed immediately.
      if (capsule && buyerId && vault.identity) {
        const offer = buyers.find((b) => b.buyer_id === buyerId)
        const buyer = await activePeerIdentity(buyerId)
        if (buyer && await pins.confirm(vault.identity.public.accountId, buyer, offer?.buyer_alias ?? 'buyer')) await sealKeyForBuyer(vault.identity, buyer, listing.id)
      }
      toast.success('Invitation created. The listing is now invitation-only.')
      onChanged()
    } catch (e) { toast.error((e as Error).message) }
  }
  const revoke = async () => {
    try { await api.revokeInvitation(inviteId); setLink(''); setInviteId(''); toast.success('Invitation revoked') } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="rounded-2xl border bg-card p-5">
      <p className="flex items-center gap-2 text-[14px] text-fg"><Ticket className="size-4 text-signal" />Private invitation</p>
      <p className="mt-1 text-[12.5px] text-fg/60">Creates a one-time link that expires. The listing becomes unlisted and invitation-only, so it is hidden from search and everyone else.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <select value={buyerId} onChange={(e) => setBuyerId(e.target.value)} className="h-9 rounded-lg border bg-surface px-2 text-[13px] sm:col-span-3">
          <option value="">Anyone with the link</option>
          {buyers.map((b) => <option key={b.buyer_id!} value={b.buyer_id!}>Only @{b.buyer_alias}</option>)}
        </select>
        <Input className="h-9 font-mono text-[13px] sm:col-span-2" placeholder="Private price $ (optional)" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input type="number" min={1} max={168} className="h-9 text-[13px]" value={hours} onChange={(e) => setHours(Number(e.target.value))} title="Hours until expiry" />
      </div>
      <Button className="mt-3 h-9" onClick={create}>Create link</Button>
      {link && (
        <div className="mt-4 space-y-2">
          <div className="flex gap-2"><Input readOnly className="h-9 font-mono text-[11px]" value={link} onFocus={(e) => e.target.select()} /><Button size="sm" variant="outline" className="h-9" onClick={() => { void navigator.clipboard.writeText(link); toast.success('Copied') }}><Copy className="size-3.5" /></Button></div>
          <p className="text-[12px] text-fg/50">Send it through a private channel. The secret is after the #, so it never reaches our server logs. <button className="text-destructive underline" onClick={revoke}>Revoke</button></p>
        </div>
      )}
      {pins.dialog}
    </div>
  )
}
