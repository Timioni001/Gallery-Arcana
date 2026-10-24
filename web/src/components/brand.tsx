import { cn } from '@/lib/utils'

/** The vault arch: an open "A" whose crossbar is a glacier arc. */
export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <rect width="32" height="32" rx="9" className="fill-frost" />
      <path d="M8.5 23.5 16 8.5l7.5 15" fill="none" className="stroke-ink" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.2 18.6c2.8-2.2 6.8-2.2 9.6 0" fill="none" stroke="oklch(0.55 0.09 220)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Custom "arcana" wordmark: monoline geometric letters where the r's shoulder
 * runs straight into the c — one continuous stroke, the hidden thread.
 */
export function Wordmark({ className, thread = true }: { className?: string; thread?: boolean }) {
  const a = (cx: number) => `M${cx + 11.5} 25a11.5 11.5 0 1 1 0-.01M${cx + 11.5} 12V40`
  return (
    <svg viewBox="-4 4 180 42" className={cn('h-6 w-auto', className)} role="img" aria-label="arcana">
      <g fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
        <path d={a(15)} />
        <path d="M38 40V13" />
        <path d={a(93)} />
        <path d="M116 40V13M116 24c0-8 5-11.5 11-11.5s11 3.5 11 11.5V40" />
        <path d={a(154)} />
        <path d="M74.6 33.6A11.5 11.5 0 1 1 67 13.5" />
      </g>
      <path d="M38 25c0-8 6-11.5 13-11.5h16a11.5 11.5 0 0 1 7.6 2.9" fill="none" stroke={thread ? 'var(--glacier)' : 'currentColor'} strokeWidth="7" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-frost', className)}>
      <Mark />
      <Wordmark className="h-[18px]" />
    </span>
  )
}
