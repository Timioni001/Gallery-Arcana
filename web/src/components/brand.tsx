import { cn } from '@/lib/utils'

/** Vault seen from above: a chunky rounded cross with a signal-orange core. */
export function Mark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden>
      <g className={inverted ? 'fill-surface' : 'fill-fg'}>
        <rect x="10.5" y="4" width="11" height="8" rx="2.5" />
        <rect x="4" y="10.5" width="24" height="11" rx="3.5" />
        <rect x="10.5" y="20" width="11" height="8" rx="2.5" />
      </g>
      <circle cx="16" cy="16" r="3" className="fill-signal" />
    </svg>
  )
}

/**
 * Custom "arcana" wordmark: geometric letters where the r's shoulder runs
 * straight into the c — one continuous stroke, the hidden thread.
 */
export function Wordmark({ className }: { className?: string }) {
  const a = (cx: number) => `M${cx + 11.5} 25a11.5 11.5 0 1 1 0-.01M${cx + 11.5} 12V40`
  return (
    <svg viewBox="-4 4 180 42" className={cn('h-6 w-auto', className)} role="img" aria-label="arcana">
      <g fill="none" stroke="currentColor" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={a(15)} />
        <path d="M38 40V13" />
        <path d={a(93)} />
        <path d="M116 40V13M116 24c0-8 5-11.5 11-11.5s11 3.5 11 11.5V40" />
        <path d={a(154)} />
        <path d="M74.6 33.6A11.5 11.5 0 1 1 67 13.5" />
      </g>
      <path d="M38 25c0-8 6-11.5 13-11.5h16a11.5 11.5 0 0 1 7.6 2.9" fill="none" stroke="var(--signal)" strokeWidth="7.5" strokeLinecap="round" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <Mark className="size-6" />
      <Wordmark className="h-[19px]" />
    </span>
  )
}

/** Dot-matrix text whose full stops become signal-orange square pixels. */
export function DotText({ children }: { children: string }) {
  return (
    <>
      {children.split('.').map((part, i, all) => (
        <span key={i}>{part}{i < all.length - 1 && <i aria-hidden className="ml-[0.06em] inline-block size-[0.15em] bg-signal not-italic" />}</span>
      ))}
    </>
  )
}
