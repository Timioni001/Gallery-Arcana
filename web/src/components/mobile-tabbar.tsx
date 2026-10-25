import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Compass, Gavel, Home, UserRound } from 'lucide-react'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

/**
 * Floating pill navigation on phones (hidden from sm up). The active destination
 * expands into a labelled black pill; the rest stay icon-only with accessible
 * names. Four destinations, 48px targets, safe-area aware, hides while scrolling
 * down and returns on scroll up.
 */
export function MobileTabbar() {
  const { account } = useSession()
  const { pathname } = useLocation()
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let last = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (Math.abs(y - last) > 8) { setHidden(y > last && y > 120); last = y }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => setHidden(false), [pathname])

  const tabs = [
    { to: '/', label: 'Home', icon: Home, end: true },
    { to: '/market', label: 'Discover', icon: Compass },
    { to: '/auctions', label: 'Auctions', icon: Gavel },
  ]
  return (
    <nav aria-label="Primary" className={cn('fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-300 sm:hidden',
      hidden && 'translate-y-[130%]')}>
      <ul className="flex items-center gap-1.5 rounded-full border border-black/5 bg-white/85 p-1.5 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink to={t.to} end={t.end} aria-label={t.label}
              className={({ isActive }) => cn('flex h-12 items-center justify-center rounded-full transition-all duration-300',
                isActive ? 'gap-2 bg-[#141414] pl-1.5 pr-5 text-white' : 'w-14 bg-black/[0.06] text-black/45 active:bg-black/10')}>
              {({ isActive }) => isActive
                ? <><span className="grid size-9 place-items-center rounded-full bg-white text-[#141414]"><t.icon className="size-[18px]" /></span><span className="text-[15px] font-medium">{t.label}</span></>
                : <t.icon className="size-[22px]" />}
            </NavLink>
          </li>
        ))}
        <li>
          <NavLink to={account ? '/studio' : '/auth'} aria-label={account ? `Studio, @${account.alias}` : 'Sign in'}
            className={({ isActive }) => cn('grid size-12 place-items-center rounded-full bg-[#141c33] text-white ring-offset-2 ring-offset-white transition', isActive && 'ring-2 ring-signal')}>
            {account
              ? <span className="text-[15px] font-semibold uppercase">{account.alias.slice(0, 1)}</span>
              : <UserRound className="size-5 text-white/80" />}
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}
