import { NavLink } from 'react-router-dom'
import { Gavel, Home, Store, UserRound } from 'lucide-react'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

/** Thumb-reach navigation on phones; hidden from the sm breakpoint up. */
export function MobileTabbar() {
  const { account } = useSession()
  const tabs = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/market', label: 'Market', icon: Store },
    { to: '/auctions', label: 'Auctions', icon: Gavel },
    account ? { to: '/studio', label: 'Studio', icon: UserRound } : { to: '/auth', label: 'Sign in', icon: UserRound },
  ]
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-50 border-t bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden">
      <ul className="grid grid-cols-4">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink to={t.to} end={t.end} className={({ isActive }) => cn('flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'text-signal' : 'text-fg/60')}>
              <t.icon className="size-5" />{t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
