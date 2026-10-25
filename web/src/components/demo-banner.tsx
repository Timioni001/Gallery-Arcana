import { useState } from 'react'

/** Shown only in demo builds: everything runs in this browser and payments are simulated. */
export function DemoBanner() {
  const [busy, setBusy] = useState(false)
  if (import.meta.env.VITE_DEMO !== '1') return null
  const reset = async () => {
    if (!confirm('Reset the demo? This clears every account, listing and key stored in this browser.')) return
    setBusy(true); await (await import('@/demo/server')).resetDemo()
  }
  return (
    <div className="bg-fg px-4 py-2 text-center text-[12px] text-surface">
      <b className="font-medium">Live demo.</b> The marketplace runs entirely in your browser. Payments are simulated and the sample sellers respond automatically.
      Encryption, sealed keys and signatures are real. Try it: create an alias, request <i>Glacier Study No. 4</i>, then decrypt it.
      <button disabled={busy} onClick={reset} className="ml-2 underline opacity-80 hover:opacity-100">Reset demo</button>
    </div>
  )
}
