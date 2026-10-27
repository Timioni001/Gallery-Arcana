import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

// The brief requires live and mock settlement to be distinguishable at all
// times, so the nav always states which one this deployment is running.
export function NetworkBadge({ className }: { className?: string }) {
  const [state, setState] = useState<'mock' | 'demo' | 'live' | 'regtest' | 'offline' | null>(null)
  useEffect(() => {
    api.health().then((h) => setState(h.mode === 'demo' ? 'demo' : h.mode === 'mock' ? 'mock' : h.network === 'regtest' ? 'regtest' : 'live')).catch(() => setState('offline'))
  }, [])
  if (!state) return null
  const label = { demo: 'Demo · simulated in your browser', mock: 'Testnet · mock settlement', live: 'Zcash testnet · live (in progress)', regtest: 'Local regtest · real Zallet, no value', offline: 'API offline · preview' }[state]
  return (
    <span title={state === 'mock' ? 'Payments are simulated. No blockchain transaction is sent.' : undefined}
      className={cn('inline-flex items-center gap-1.5 rounded-full border border-fg/15 bg-surface px-2 py-0.5 font-mono text-[10px] text-fg/70', className)}>
      <span className={cn('size-1.5 rounded-full', state === 'live' ? 'bg-emerald-600' : state === 'mock' || state === 'demo' || state === 'regtest' ? 'animate-pulse bg-signal' : 'bg-stone')} />
      {label}
    </span>
  )
}
