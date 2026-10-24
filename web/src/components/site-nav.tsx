import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Logo } from './brand'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

const links = [
  { to: '/market', label: 'Market' },
  { to: '/#how', label: 'How it works' },
  { to: '/#privacy', label: 'Privacy' },
  { to: '/#selling', label: 'Selling' },
]

export function SiteNav({ overlay = false }: { overlay?: boolean }) {
  const { account, setAccount } = useSession()
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const signOut = async () => { await api.logout().catch(() => {}); setAccount(null); nav('/') }
  return (
    <header className={cn('z-40 w-full', overlay ? 'absolute inset-x-0 top-0' : 'sticky top-0 border-b bg-background/80 backdrop-blur-xl')}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" aria-label="Gallery Arcana home"><Logo /></Link>
        <nav className="hidden items-center gap-7 text-[13px] text-frost/80 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('transition-colors hover:text-frost', isActive && l.to === '/market' && 'text-frost')}>{l.label}</NavLink>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          {account ? (
            <>
              <Link to="/studio" className="text-[13px] text-frost/80 hover:text-frost">@{account.alias}</Link>
              <button onClick={signOut} className="text-[13px] text-frost/60 hover:text-frost">Sign out</button>
              <Link to="/studio/new" className="rounded-full bg-frost px-4 py-1.5 text-[13px] font-medium text-ink transition hover:bg-white">List a work</Link>
            </>
          ) : (
            <>
              <Link to="/auth" className="text-[13px] text-frost/80 hover:text-frost">Log in</Link>
              <Link to="/auth?mode=signup" className="rounded-full bg-frost px-4 py-1.5 text-[13px] font-medium text-ink transition hover:bg-white">Get an alias</Link>
            </>
          )}
        </div>
        <button className="text-frost md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="glass mx-4 mb-3 rounded-2xl p-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm">
            {links.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)}>{l.label}</Link>)}
            <div className="hairline my-1" />
            {account
              ? <><Link to="/studio" onClick={() => setOpen(false)}>Studio · @{account.alias}</Link><button className="text-left text-muted-foreground" onClick={signOut}>Sign out</button></>
              : <Link to="/auth" onClick={() => setOpen(false)}>Log in / get an alias</Link>}
          </div>
        </div>
      )}
    </header>
  )
}
