import { cn } from '@/lib/utils'

/** The Zcash mark: a gold disc with the barred Z. */
export function ZcashLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label="Zcash" className={cn('size-6 shrink-0', className)}>
      <circle cx="50" cy="50" r="50" fill="#F4B728" />
      <path fill="#1a1a1a" d="M46 15h8v11h18v11L45 64h27v11H54v10h-8V75H28V64l27-27H28V26h18z" />
    </svg>
  )
}

/** Pill used wherever the page credits Zcash. */
export function PoweredByZcashBadge({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <a href="https://z.cash" target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-[13px] font-medium transition',
      dark ? 'border-white/20 bg-white/5 text-white hover:bg-white/10' : 'border-[#F4B728]/60 bg-[#F4B728]/10 text-fg hover:bg-[#F4B728]/20', className)}>
      <ZcashLogo className="size-7" />Powered by Zcash
    </a>
  )
}
