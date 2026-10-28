import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button, buttonVariants } from '@/components/ui/button'

/** Render locally: sending an invoice to a remote QR service would leak payment metadata. */
export function PaymentRequest({ uri, expiresAt, mode }: { uri: string; expiresAt: string; mode: string }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const expired = !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= now
  // Only allow the expected custom protocol; never render an arbitrary API-provided href.
  const valid = /^zcash:[^\s<>]+$/.test(uri) && new TextEncoder().encode(uri).length <= 1800
  const simulated = mode === 'mock' || mode === 'demo'
  const enabled = valid && !expired && mode === 'zallet'
  return (
    <div className="mt-5 flex flex-col items-center gap-4 rounded-xl border bg-surface p-4">
      {valid && !expired && <QRCodeSVG value={uri} size={224} level="M" marginSize={4} bgColor="#ffffff" fgColor="#111111" title={simulated ? 'Simulated ZIP-321 payment request' : 'ZIP-321 payment request'} className="max-w-full" />}
      {enabled ? <a className={buttonVariants({ size: 'lg' })} href={uri} referrerPolicy="no-referrer">Open in wallet</a> : <Button size="lg" disabled>Open in wallet</Button>}
      <p className="max-w-sm text-center text-[12px] text-fg/60" role="status">
        {expired ? 'This invoice has expired. Do not send payment.' : !valid ? 'Wallet request unavailable. Use the invoice details below.' : simulated ? 'Simulated invoice — no real ZEC. Wallet launch is disabled in demo and mock mode.' : mode !== 'zallet' ? 'Checking settlement mode before opening a wallet.' : 'Scan with a compatible Zcash wallet, or open it on this device. Check the network, amount and memo in your wallet before approving.'}
      </p>
    </div>
  )
}
