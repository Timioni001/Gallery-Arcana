import type { ReactNode } from 'react'
import { SiteNav } from './site-nav'
import { SiteFooter } from './site-footer'

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto min-h-[60vh] max-w-6xl px-4 pt-10 sm:px-6">{children}</main>
      <SiteFooter />
    </>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-signal/20 bg-signal/[0.06] px-4 py-3 text-[13px] text-fg/80">{children}</div>
}
