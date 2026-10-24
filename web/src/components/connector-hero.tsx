import { DotText, Mark } from './brand'

const pill = (x: number, y: number, label: string, tone: 'solid' | 'mint' | 'faint' = 'solid') => (
  <g key={label} transform={`translate(${x} ${y})`} opacity={tone === 'faint' ? 0.45 : 1}>
    <rect x={-label.length * 3.9 - 12} y="-11" width={label.length * 7.8 + 24} height="22" rx="11"
      fill={tone === 'mint' ? 'oklch(0.95 0.03 160)' : 'var(--surface)'} stroke="currentColor" strokeOpacity=".45" />
    <text textAnchor="middle" dy="4" fontSize="11" fontFamily="var(--font-mono)" fill="currentColor">{label}</text>
  </g>
)
const dot = (x: number, y: number, hollow = false) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill={hollow ? 'var(--paper)' : 'currentColor'} stroke="currentColor" strokeWidth="1.2" />

/** Center vault tile wired to the parties of a trade, PlayerZero-style. */
export function ConnectorHero() {
  return (
    <div className="relative mx-auto h-[300px] w-full max-w-6xl sm:h-[460px]">
      <svg viewBox="0 0 1200 460" className="absolute inset-0 hidden size-full text-fg sm:block" aria-hidden>
        <g stroke="currentColor" strokeOpacity=".3" strokeWidth="1.2">
          <line x1="20" y1="90" x2="430" y2="90" /><line x1="770" y1="90" x2="1180" y2="90" />
          <line x1="20" y1="370" x2="430" y2="370" /><line x1="770" y1="370" x2="1180" y2="370" />
        </g>
        <g fill="none" stroke="var(--signal)" strokeWidth="1.6" strokeLinecap="round">
          <path d="M430 90C485 90 492 150 522 168" /><path d="M770 90C715 90 708 150 678 168" />
          <path d="M430 370C485 370 492 310 522 292" /><path d="M770 370C715 370 708 310 678 292" />
        </g>
        <g fill="none" stroke="var(--signal)" strokeWidth="1.6" strokeDasharray="2 10" strokeLinecap="round" className="animate-dash" opacity=".7">
          <line x1="300" y1="90" x2="430" y2="90" /><line x1="770" y1="370" x2="900" y2="370" />
        </g>
        {[dot(30, 90, true), dot(250, 90), dot(430, 90), dot(770, 90), dot(1030, 90), dot(160, 370), dot(430, 370), dot(770, 370), dot(1160, 370, true)]}
        {[pill(150, 90, 'Seller'), pill(940, 90, 'Capsule'), pill(90, 370, 'Offer'), pill(250, 370, 'Escrow', 'mint'),
          pill(880, 370, 'Receipt'), pill(990, 370, 'Passport'), pill(1110, 90, 'Buyer key', 'faint')]}
      </svg>
      <div className="absolute left-1/2 top-1/2 grid size-[170px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[36px] bg-[oklch(0.88_0.01_80)] shadow-[inset_0_2px_0_oklch(1_0_0/60%),0_30px_60px_-30px_oklch(0.2_0.02_60/50%)] sm:size-[190px]">
        <div className="grid size-[124px] place-items-center rounded-[26px] bg-surface shadow-[inset_0_-2px_0_oklch(0.2_0.01_70/8%)] sm:size-[140px]">
          <Mark className="size-16 sm:size-[72px]" />
        </div>
      </div>
      <h1 className="pointer-events-none absolute inset-x-0 top-1/2 hidden -translate-y-1/2 grid-cols-[1fr_230px_1fr] items-center text-fg sm:grid">
        <span className="dot-display text-center text-[38px] leading-none md:text-[48px] lg:text-[62px]"><DotText>Seal. Sell.</DotText></span>
        <span />
        <span className="dot-display text-center text-[38px] leading-none md:text-[48px] lg:text-[62px]"><DotText>Settle.</DotText></span>
      </h1>
    </div>
  )
}
