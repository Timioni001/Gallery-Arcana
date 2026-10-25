import { useState } from 'react'
import { Check } from 'lucide-react'
import { DotText } from './brand'
import { cn } from '@/lib/utils'

type Role = 'collector' | 'creator' | 'both'

/** Waitlist sign-up. Only the email and role are stored, with no IP address or tracking. */
export function Waitlist() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('collector')
  const [trap, setTrap] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setState('busy')
    try {
      const res = await fetch('/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json', 'x-arcana-action': '1' }, body: JSON.stringify({ email, role, website: trap }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not join right now')
      setState('done')
    } catch (err) { setState('error'); setMsg((err as Error).message) }
  }
  return (
    <section id="waitlist" className="mx-auto mt-28 max-w-6xl scroll-mt-20 px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-[28px] bg-fg px-6 py-16 text-surface sm:px-14 sm:py-20">
        <div className="pointer-events-none absolute -right-24 -top-24 size-[420px] rounded-full bg-[radial-gradient(circle,oklch(0.645_0.19_38/.35),transparent_65%)]" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-surface/25 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-surface/80">
              <span className="size-1.5 animate-pulse rounded-full bg-signal" />Early access · limited seats
            </span>
            <h2 className="dot-display mt-6 text-[44px] leading-[0.95] sm:text-[72px]"><DotText>Join the</DotText><br /><span className="text-signal"><DotText>waitlist.</DotText></span></h2>
            <p className="mt-6 max-w-md text-[15px] text-surface/70">Be first to trade on Gallery Arcana when shielded Zcash settlement goes live. Founding sellers get the first drops, and founding collectors get first claim on capsules.</p>
          </div>
          <div className="rounded-2xl bg-surface/[0.06] p-6 ring-1 ring-surface/10 sm:p-8">
            {state === 'done' ? (
              <div className="py-6 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-signal text-surface"><Check className="size-6" /></span>
                <p className="mt-4 text-[20px]">You're on the list.</p>
                <p className="mt-1 text-[13px] text-surface/60">We'll write once, when your access is ready. No newsletters, and your address is never shared or sold.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <label className="block font-mono text-[11px] uppercase tracking-wider text-surface/60" htmlFor="wl-email">Email</label>
                <input id="wl-email" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com"
                  className="h-12 w-full rounded-xl border border-surface/15 bg-transparent px-4 text-[15px] text-surface outline-none placeholder:text-surface/30 focus:border-signal" />
                <input aria-hidden tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} className="hidden" name="website" />
                <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface/[0.06] p-1 text-[13px]">
                  {(['collector', 'creator', 'both'] as const).map((r) => (
                    <button type="button" key={r} onClick={() => setRole(r)} className={cn('rounded-lg py-2 capitalize transition', role === r ? 'bg-surface text-fg' : 'text-surface/70 hover:text-surface')}>{r === 'both' ? 'Both' : `${r}`}</button>
                  ))}
                </div>
                <button disabled={state === 'busy'} className="h-12 w-full rounded-xl bg-signal text-[15px] font-medium text-surface transition hover:brightness-110 disabled:opacity-60">{state === 'busy' ? 'Joining…' : 'Join the waitlist'}</button>
                {state === 'error' && <p className="text-[12.5px] text-signal">{msg}</p>}
                <p className="text-[11.5px] text-surface/45">We store only your email and role. No IP address, no trackers, no third parties.</p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
