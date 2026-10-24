export const usd = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const categoryLabel: Record<string, string> = { digital: 'Digital', collectible: 'Collectible', onchain: 'On-chain', other: 'Other' }

export const statusTone: Record<string, string> = {
  live: 'text-glacier', paused: 'text-muted-foreground', reserved: 'text-steel', sold: 'text-muted-foreground',
  awaiting_payment: 'text-steel', funded: 'text-glacier', paid: 'text-emerald-700', disputed: 'text-amber-700',
  expired: 'text-muted-foreground', open: 'text-glacier', countered: 'text-steel', accepted: 'text-emerald-700',
}

export const sentence = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** Dollars typed by a person → integer cents, or null when unparseable. */
export function toCents(input: string): number | null {
  const m = /^\s*\$?(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(input)
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
}
