import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ImageUp, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { PageShell, Notice } from '@/components/page-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, type Category } from '@/lib/api'
import { toCents } from '@/lib/format'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

type Delivery = 'download' | 'manual' | 'external'
type Visibility = 'public' | 'unlisted'

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button type="button" key={v} onClick={() => onChange(v)} className={cn('rounded-full px-3.5 py-1.5 text-[13px] transition', v === value ? 'bg-frost text-ink' : 'bg-white/[0.04] text-frost/70 hover:text-frost')}>{label}</button>
      ))}
    </div>
  )
}

function Drop({ label, hint, icon: Icon, accept, file, onFile }: { label: string; hint: string; icon: typeof Lock; accept?: string; file: File | null; onFile: (f: File | null) => void }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed bg-card px-4 py-8 text-center transition hover:border-glacier/40">
      <Icon className="size-5 text-glacier" />
      <span className="text-[13px] text-frost">{file ? file.name : label}</span>
      <span className="text-[12px] text-muted-foreground">{file ? `${(file.size / 1e6).toFixed(2)} MB` : hint}</span>
      <input type="file" className="sr-only" accept={accept} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </label>
  )
}

export default function NewListing() {
  const { account, ready } = useSession()
  const nav = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState<Category>('digital')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [delivery, setDelivery] = useState<Delivery>('download')
  const [preview, setPreview] = useState<File | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState('')

  if (ready && !account) return <Navigate to="/auth?next=/studio/new" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cents = toCents(price)
    if (!cents || cents < 50) return toast.error('Price must be at least $0.50')
    if (delivery === 'download' && !file) return toast.error('Attach the file buyers will receive')
    try {
      let previewKey: string | undefined, fileKey: string | undefined
      if (preview) { setBusy('Cleaning preview metadata…'); previewKey = (await api.upload('previews', preview)).key }
      if (file && delivery === 'download') { setBusy('Encrypting file…'); fileKey = (await api.upload('private', file)).key }
      setBusy('Publishing…')
      const r = await api.createListing({ title, description: description || undefined, category, visibility, delivery, previewKey, fileKey, priceUsdCents: cents })
      toast.success('Listing published')
      nav(`/listing/${r.listingId}`)
    } catch (err) { toast.error((err as Error).message) } finally { setBusy('') }
  }

  return (
    <PageShell>
      <span className="eyebrow">New listing</span>
      <h1 className="mt-4 text-[34px] tracking-[-0.025em] text-frost">List a work</h1>
      {account && !account.hasPayout && <div className="mt-6"><Notice>Set a payout address in Studio → Settings first. The API rejects listings without one.</Notice></div>}
      <form onSubmit={submit} className="mt-8 grid gap-10 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="space-y-2"><Label htmlFor="t">Title</Label><Input id="t" className="h-11" required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="d">Description</Label><Textarea id="d" rows={6} maxLength={2500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the buyer receives, formats, licence…" /></div>
          <div className="space-y-2">
            <Label htmlFor="p">Price (USD)</Label>
            <div className="relative max-w-48"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-frost/50">$</span><Input id="p" inputMode="decimal" className="h-11 pl-7 font-mono" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" /></div>
            <p className="text-xs text-muted-foreground">Quoted in testnet ZEC at checkout.</p>
          </div>
          <div className="space-y-2"><Label>Category</Label><Choice value={category} onChange={setCategory} options={[['digital', 'Digital'], ['collectible', 'Collectible'], ['onchain', 'On-chain'], ['other', 'Other']]} /></div>
          <div className="space-y-2"><Label>Visibility</Label><Choice value={visibility} onChange={setVisibility} options={[['public', 'Public'], ['unlisted', 'Unlisted link']]} /></div>
          <div className="space-y-2"><Label>Delivery</Label><Choice value={delivery} onChange={setDelivery} options={[['download', 'Encrypted file'], ['manual', 'Hand delivery'], ['external', 'Off-platform']]} /></div>
        </div>
        <div className="space-y-4">
          <Drop label="Public preview" hint="PNG, JPEG or WebP up to 5 MB. Metadata is stripped." icon={ImageUp} accept="image/png,image/jpeg,image/webp" file={preview} onFile={setPreview} />
          {delivery === 'download' && <Drop label="Private file" hint="Up to 25 MB. Encrypted at rest and only released after funding." icon={Lock} file={file} onFile={setFile} />}
          <Button type="submit" className="h-11 w-full" disabled={!!busy}>{busy || 'Publish listing'}</Button>
        </div>
      </form>
    </PageShell>
  )
}
