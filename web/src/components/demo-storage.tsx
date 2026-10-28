import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

/** Storage protection is best-effort: clearing site data still deletes the demo. */
export function DemoStorage() {
  const [persistent, setPersistent] = useState<boolean | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersistent).catch(() => {})
  }, [])
  const protect = async () => {
    setBusy(true)
    try {
      const granted = await navigator.storage?.persist?.() ?? false
      setPersistent(granted)
      setMessage(granted ? 'Storage protection enabled.' : 'This browser did not grant storage protection. Your progress still saves locally, but the browser may remove it when space is low.')
    } catch { setMessage('Storage protection is unavailable. Use a regular browser window and keep your key backup.') }
    finally { setBusy(false) }
  }
  return (
    <section className="mt-6 max-w-lg space-y-4 rounded-2xl border bg-card p-6">
      <div>
        <h2 className="text-fg">Your demo progress</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Your alias, listings, conversations and purchases save automatically in this browser. Return to this same site and browser profile to continue, or log in again with your alias and passphrase.</p>
      </div>
      <p className="text-[13px] text-muted-foreground">This demo does not sync across devices. Private browsing, clearing site data or resetting the demo can erase progress. Storage protection reduces automatic eviction; it does not make a backup.</p>
      <Button variant="outline" disabled={persistent === true || busy} onClick={protect}>{persistent ? 'Storage protection enabled' : busy ? 'Checking…' : 'Keep demo data on this device'}</Button>
      {message && <p role="status" className="text-[13px] text-muted-foreground">{message}</p>}
      <p className="text-[13px] text-muted-foreground">Keep your passphrase in a password manager. Back up your encryption keys separately in <Link to="/studio?tab=keys" className="text-signal hover:underline">Studio → Keys</Link>. A key backup does not contain your login passphrase or demo purchase history.</p>
    </section>
  )
}
