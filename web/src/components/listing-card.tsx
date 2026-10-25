import { Link } from 'react-router-dom'
import { Lock, Package, Link2 } from 'lucide-react'
import type { Listing } from '@/lib/api'
import { usd } from '@/lib/format'
import { ListingArt } from './listing-art'

const deliveryIcon = { download: Lock, manual: Package, external: Link2 }
const deliveryLabel = { download: 'Encrypted file', manual: 'Hand delivery', external: 'Off-platform transfer' }

export function ListingCard({ listing, demo }: { listing: Listing; demo?: boolean }) {
  const Icon = deliveryIcon[listing.delivery]
  const body = (
    <>
      <div className="aspect-[4/5] overflow-hidden rounded-xl border bg-surface">
        <ListingArt listing={listing} className="transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-fg">{listing.title}</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">@{listing.seller_alias ?? 'seller'}</p>
        </div>
        <p className="shrink-0 font-mono text-[13px] text-fg">{usd(listing.price_usd_cents)}</p>
      </div>
      <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-fg/55">
        <Icon className="size-3.5" />{deliveryLabel[listing.delivery]}
        {listing.crypto_mode === 'capsule-v1' && <span className="ml-1 rounded-full border border-signal/30 px-1.5 text-[10px] text-signal">Capsule</span>}
        {listing.status !== 'live' && <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] capitalize">{listing.status}</span>}
      </p>
    </>
  )
  return demo
    ? <div className="group">{body}</div>
    : <Link to={`/listing/${listing.id}`} className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link>
}
