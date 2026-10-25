import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from './brand'
import { NetworkBadge } from './network-badge'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const links = [
  { to: '/market', label: 'Market' },
  { to: '/auctions', label: 'Auctions' },
  { to: '/#collection', label: 'Collection' },
  { to: '/#how', label: 'How it works' },
  { to: '/#privacy', label: 'Privacy' },
  { to: '/#selling', label: 'Selling' },
  { to: '/observer', label: 'Observer view' },
]

export function SiteNav() {
  const { account, setAccount } = useSession()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const signOut = async () => { await api.logout().catch(() => {}); setAccount(null); nav('/') }
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-paper/85 backdrop-blur-xl">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
        <nav className="hidden items-center gap-5 text-[13px] text-fg/75 lg:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('transition-colors hover:text-fg', isActive && !l.to.includes('#') && 'text-fg')}>{l.label}</NavLink>
          ))}
        </nav>
        <button className="-ml-2 grid size-10 place-items-center justify-self-start text-fg lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <Link to="/" aria-label="Gallery Arcana home" className="justify-self-center"><Logo /></Link>
        <div className="flex items-center justify-end gap-4 text-[13px]">
          <NetworkBadge className="hidden xl:inline-flex" />
          {account ? (
            <>
              <Link to="/studio" className="hidden text-fg/75 hover:text-fg sm:inline">@{account.alias}</Link>
              <button onClick={signOut} className="hidden text-fg/55 hover:text-fg md:inline">Sign out</button>
              <Link to="/studio/new" className="rounded-lg bg-secondary px-3.5 py-2 font-medium text-fg transition hover:bg-[oklch(0.9_0.01_80)]">List a work</Link>
            </>
          ) : (
            <>
              <Link to="/auth" className="hidden text-fg/75 hover:text-fg sm:inline">Sign in</Link>
              <Link to="/auth?mode=signup" className="rounded-lg bg-secondary px-3.5 py-2 font-medium text-fg transition hover:bg-[oklch(0.9_0.01_80)]">Get started</Link>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="glass mx-4 mb-3 rounded-2xl p-4 lg:hidden">
          <div className="flex flex-col text-[15px] [&>a]:py-2.5 [&>button]:py-2.5">
            <NetworkBadge className="mb-1 self-start" />
            {links.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)}>{l.label}</Link>)}
            <Link to="/verify" onClick={() => setOpen(false)}>Verify a receipt</Link>
            <div className="hairline my-1" />
            {account
              ? <><Link to="/studio" onClick={() => setOpen(false)}>Studio · @{account.alias}</Link><button className="text-left text-muted-foreground" onClick={signOut}>Sign out</button></>
              : <Link to="/auth" onClick={() => setOpen(false)}>Sign in</Link>}
          </div>
        </div>
      )}
    </header>
  )
}
