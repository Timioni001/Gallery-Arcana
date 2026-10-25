import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, KeyRound, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSession } from '@/lib/session'
import type { Identity, PublicIdentity } from '@arcana/client-crypto'
import { checkPin, createIdentity, exportBackup, importBackup, pinPeer, resetIdentity, shortFingerprint, vaultState, type PinCheck, type VaultState } from '@/lib/vault'
import { cn } from '@/lib/utils'

type Vault = { account: ReturnType<typeof useSession>['account']; state: VaultState | null; error: string; refresh: () => Promise<void>; identity: Identity | null }
const VaultCtx = createContext<Vault | null>(null)

/** One vault state for the whole app, so every gate updates when keys are created or restored. */
export function VaultProvider({ children }: { children: ReactNode }) {
  const { account } = useSession()
  const [state, setState] = useState<VaultState | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    if (!account) { setState(null); return }
    try { setState(await vaultState(account)); setError('') } catch (e) { setError((e as Error).message) }
  }, [account])
  useEffect(() => { void refresh() }, [refresh])
  const value = useMemo(() => ({ account, state, error, refresh, identity: state?.state === 'ready' ? state.identity : null }), [account, state, error, refresh])
  return <VaultCtx.Provider value={value}>{children}</VaultCtx.Provider>
}

export function useVault() {
  const v = useContext(VaultCtx)
  if (!v) throw new Error('useVault outside VaultProvider')
  return v
}

/** Fingerprint shown in readable groups, to compare with a counterparty out of band. */
export function Fingerprint({ value, className }: { value: string; className?: string }) {
  return <span title={value} className={cn('font-mono text-[11px] tracking-wide text-fg/70', className)}>{shortFingerprint(value)}</span>
}

function RestoreDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { account } = useSession()
  const [file, setFile] = useState<File | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const restore = async () => {
    if (!account || !file) return
    setBusy(true)
    try { const r = await importBackup(account, await file.text(), key); toast.success(`Vault restored with ${r.capsules} capsule key${r.capsules === 1 ? '' : 's'}`); onOpenChange(false); onDone() }
    catch (e) { toast.error((e as Error).message || 'Wrong recovery key or damaged backup') } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore your vault</DialogTitle>
          <DialogDescription>Choose the backup file and enter the recovery key you saved when you created it.</DialogDescription>
        </DialogHeader>
        <input type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
        <Input className="h-10 font-mono" placeholder="Recovery key" value={key} onChange={(e) => setKey(e.target.value)} />
        <DialogFooter><Button disabled={busy || !file || !key} onClick={restore}>Restore</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Inline prompt for any page that needs the local encryption identity.
 * Renders nothing once the vault is ready.
 */
export function VaultGate({ vault, purpose }: { vault: ReturnType<typeof useVault>; purpose: string }) {
  const [busy, setBusy] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const { account, state, refresh } = vault
  if (!account || !state || state.state === 'ready') return null
  const create = async () => {
    setBusy(true)
    try { await createIdentity(account); toast.success('Encryption keys created in this browser'); await refresh() }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-2xl border border-signal/25 bg-signal/[0.05] p-5">
      <p className="flex items-center gap-2 text-[14px] text-fg"><KeyRound className="size-4 text-signal" />Encryption keys needed</p>
      {state.state === 'none' ? (
        <>
          <p className="mt-1 text-[13px] text-fg/65">To {purpose}, this browser needs your private encryption keys. They are generated here and never leave your device.</p>
          <Button className="mt-4 h-9" disabled={busy} onClick={create}>{busy ? 'Generating…' : 'Create my keys'}</Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-fg/65">Your account has keys (<Fingerprint value={state.fingerprint} />), but {state.state === 'missing-local' ? 'they are not in this browser' : 'this browser holds an older key'}. Restore them from your vault backup, or reset them in Studio → Keys.</p>
          <Button variant="outline" className="mt-4 h-9" onClick={() => setRestoring(true)}><Upload className="size-3.5" />Restore backup</Button>
          <RestoreDialog open={restoring} onOpenChange={setRestoring} onDone={refresh} />
        </>
      )}
    </div>
  )
}

/** Studio panel: identity status, backup, restore and explicit reset. */
export function VaultPanel() {
  const vault = useVault()
  const { account, state, refresh } = vault
  const [recovery, setRecovery] = useState('')
  const [restoring, setRestoring] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [pass, setPass] = useState('')

  const backup = async () => {
    if (!account) return
    try {
      const { recoveryKey, blob } = await exportBackup(account)
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `arcana-vault-${account.alias}.json`; a.click(); URL.revokeObjectURL(a.href)
      setRecovery(recoveryKey)
    } catch (e) { toast.error((e as Error).message) }
  }
  const reset = async () => {
    if (!account) return
    try { await resetIdentity(account, pass); setResetOpen(false); setPass(''); toast.success('New keys created. Back them up now.'); await refresh() }
    catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <VaultGate vault={vault} purpose="sell capsules, read encrypted messages or open purchases" />
      {state?.state === 'ready' && (
        <div className="rounded-2xl border bg-card p-6">
          <p className="flex items-center gap-2 text-fg"><ShieldCheck className="size-4 text-emerald-700" />Keys active in this browser</p>
          <p className="mt-2 text-[13px] text-fg/60">Fingerprint: <Fingerprint value={state.identity.public.fingerprint} /></p>
          <p className="mt-1 text-[12px] text-fg/50">Share this with a counterparty through another channel so they can confirm it's really you.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="h-9" onClick={backup}><Download className="size-3.5" />Download backup</Button>
            <Button variant="outline" className="h-9" onClick={() => setRestoring(true)}><Upload className="size-3.5" />Restore</Button>
            <Button variant="ghost" className="h-9 text-destructive" onClick={() => setResetOpen(true)}><RotateCcw className="size-3.5" />Reset keys</Button>
          </div>
          {recovery && (
            <div className="mt-5 rounded-xl border border-signal/30 bg-signal/[0.05] p-4 text-[13px]">
              <p className="font-medium text-fg">Recovery key, shown once</p>
              <p className="mt-1 text-fg/65">Store it apart from the backup file, for example on paper. You need both to restore your keys. Download a fresh backup after every new capsule.</p>
              <p className="mt-3 select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-[12px] text-fg">{recovery}</p>
            </div>
          )}
        </div>
      )}
      <RestoreDialog open={restoring} onOpenChange={setRestoring} onDone={refresh} />
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset encryption keys</DialogTitle>
            <DialogDescription>This breaks continuity. Pending key envelopes, conversations and passports tied to your old keys stop working, and counterparties will see a new fingerprint. Enter your passphrase to confirm.</DialogDescription>
          </DialogHeader>
          <Input type="password" className="h-10" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Passphrase" />
          <DialogFooter><Button variant="destructive" disabled={pass.length < 12} onClick={reset}>Reset and create new keys</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Trust-on-first-use confirmation. A new peer fingerprint is shown for
 * out-of-band comparison; a changed one is flagged before anything is sealed.
 */
export function usePinConfirm() {
  const [pending, setPending] = useState<{ alias: string; check: PinCheck; resolve: (ok: boolean) => void } | null>(null)
  const confirm = useCallback(async (ownerId: string, peer: PublicIdentity, alias: string) => {
    const check = await checkPin(ownerId, peer)
    if (check.status === 'match') return true
    const ok = await new Promise<boolean>((resolve) => setPending({ alias, check, resolve }))
    if (ok) await pinPeer(ownerId, peer)
    return ok
  }, [])
  const close = (ok: boolean) => { pending?.resolve(ok); setPending(null) }
  const dialog = (
    <Dialog open={!!pending} onOpenChange={(o) => { if (!o) close(false) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{pending?.check.status === 'changed' ? `@${pending?.alias}'s key changed` : `Confirm @${pending?.alias}'s key`}</DialogTitle>
          <DialogDescription>
            {pending?.check.status === 'changed'
              ? 'This fingerprint differs from the one you trusted before. They may have reset their keys, or someone may be impersonating them. Check with them through another channel before continuing.'
              : 'This is your first encrypted exchange with this account. If you can, compare this fingerprint with them through another channel.'}
          </DialogDescription>
        </DialogHeader>
        {pending && (
          <div className="space-y-2 rounded-xl bg-paper p-4">
            {pending.check.previous && <p className="text-[12px] text-fg/55">Previously: <Fingerprint value={pending.check.previous} className="line-through" /></p>}
            <p className="text-[12px] text-fg/55">Fingerprint: <Fingerprint value={pending.check.fingerprint} className="text-fg" /></p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
          <Button onClick={() => close(true)}>Trust this key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return { confirm, dialog }
}
