import { cn } from '@/lib/utils'

// Isometric line art: x runs down-right, y down-left, z up.
type P = [number, number, number]
const iso = ([x, y, z]: P) => `${((x - y) * 0.866).toFixed(1)},${((x + y) * 0.5 - z).toFixed(1)}`
const poly = (pts: P[]) => pts.map(iso).join(' ')
const F = { top: 'var(--surface)', left: 'oklch(0.94 0.008 85)', right: 'oklch(0.9 0.01 80)' }

function Box({ x, y, z = 0, w, d, h, shadow = true, tops = F.top }: { x: number; y: number; z?: number; w: number; d: number; h: number; shadow?: boolean; tops?: string }) {
  return (
    <g strokeLinejoin="round">
      {shadow && <polygon points={poly([[x - 8, y - 8, 0], [x + w + 8, y - 8, 0], [x + w + 8, y + d + 8, 0], [x - 8, y + d + 8, 0]])} fill="none" stroke="currentColor" strokeOpacity=".35" strokeDasharray="3 4" />}
      <polygon points={poly([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={F.left} />
      <polygon points={poly([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={F.right} />
      <polygon points={poly([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={tops} />
    </g>
  )
}

function Tile({ x, y, lit }: { x: number; y: number; lit?: boolean }) {
  return (
    <g>
      <Box x={x} y={y} w={70} d={70} h={22} />
      {lit && (
        <>
          <polygon points={poly([[x + 18, y + 18, 22], [x + 52, y + 18, 22], [x + 52, y + 52, 22], [x + 18, y + 52, 22]])} fill="var(--signal)" />
          <polygon points={poly([[x + 26, y + 26, 22], [x + 44, y + 26, 22], [x + 44, y + 44, 22], [x + 26, y + 44, 22]])} fill="none" stroke="var(--surface)" strokeWidth="1.2" />
        </>
      )}
    </g>
  )
}

/** A capsule vault on a belt: plain tiles go in, signed and paid tiles come out. */
export function IsoVault({ className }: { className?: string }) {
  const V = { x: 0, y: -30, w: 210, d: 210, h: 105 }
  return (
    <svg viewBox="-420 -250 1060 640" className={cn('h-auto w-full text-fg', className)} aria-hidden>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeOpacity=".22" strokeWidth="1.4" />
        </pattern>
      </defs>
      <g fill="none" stroke="currentColor" strokeWidth="1.3">
        {/* belt */}
        <polygon points={poly([[-520, 40, 0], [760, 40, 0], [760, 140, 0], [-520, 140, 0]])} fill="var(--surface)" />
        <Tile x={-430} y={55} />
        <Tile x={-290} y={55} />
        <Tile x={330} y={55} lit />
        <Tile x={470} y={55} lit />
        {/* base plate */}
        <polygon points={poly([[V.x - 30, V.y - 30, 0], [V.x + V.w + 30, V.y - 30, 0], [V.x + V.w + 30, V.y + V.d + 30, 0], [V.x - 30, V.y + V.d + 30, 0]])} fill="url(#hatch)" />
        <Box x={V.x - 14} y={V.y - 14} w={V.w + 28} d={V.d + 28} h={10} shadow={false} />
        {/* vault body */}
        <Box x={V.x} y={V.y} z={10} w={V.w} d={V.d} h={V.h} shadow={false} />
        {/* window and sealed capsule inside */}
        <polygon points={poly([[V.x + 34, V.y + 34, V.h + 10], [V.x + V.w - 34, V.y + 34, V.h + 10], [V.x + V.w - 34, V.y + V.d - 34, V.h + 10], [V.x + 34, V.y + V.d - 34, V.h + 10]])} fill="oklch(0.92 0.01 80)" />
        <Box x={V.x + 70} y={V.y + 70} z={V.h - 6} w={70} d={70} h={34} shadow={false} />
        {[[16, 16], [V.w - 16, 16], [16, V.d - 16], [V.w - 16, V.d - 16]].map(([a, b], i) => {
          const [cx, cy] = iso([V.x + a, V.y + b, V.h + 10]).split(',').map(Number)
          return <g key={i}><ellipse cx={cx} cy={cy} rx="7" ry="4" fill="var(--surface)" /><circle cx={cx} cy={cy - 1} r="1.6" fill="currentColor" /></g>
        })}
        {/* output slot */}
        <polygon points={poly([[V.x + V.w, V.y + 120, 30], [V.x + V.w, V.y + 190, 30], [V.x + V.w, V.y + 190, 82], [V.x + V.w, V.y + 120, 82]])} fill="oklch(0.27 0.02 50)" />
        {/* key envelope card with signal controls */}
        <g transform="translate(-40 40)">
          <Box x={-170} y={250} w={150} d={80} h={8} />
          <polygon points={poly([[-150, 262, 8], [-95, 262, 8], [-95, 318, 8], [-150, 318, 8]])} fill="var(--signal)" />
          <polygon points={poly([[-80, 268, 8], [-35, 268, 8], [-35, 284, 8], [-80, 284, 8]])} fill="var(--surface)" />
          <polygon points={poly([[-80, 298, 8], [-35, 298, 8], [-35, 314, 8], [-80, 314, 8]])} fill="var(--signal)" />
        </g>
      </g>
    </svg>
  )
}
