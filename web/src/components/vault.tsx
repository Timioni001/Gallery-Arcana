import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, KeyRound, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSession } from '@/lib/session'
import { api } from '@/lib/api'
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
  const loadAccount = async () => {
    setBusy(true)
    try {
      const result = await api.vaultBackup()
      if (!result.backup) throw new Error('No account backup saved. Use your downloaded file instead.')
      setFile(new File([JSON.stringify(result.backup)], 'account-backup.json', { type: 'application/json' }))
      toast.success('Encrypted account backup loaded. Enter your recovery key to open it.')
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const restore = async () => {
    if (!account || !file) return
    setBusy(true)
    try { const r = await importBackup(account, await file.text(), key); toast.success(`Vault restored with ${r.capsules} capsule key${r.capsules === 1 ? '' : 's'}`); onOpenChange(false); onDone() }
    catch (e) { toast.error(e instanceof DOMException ? 'Wrong recovery key or damaged backup' : (e as Error).message || 'Wrong recovery key or damaged backup') } finally { setBusy(false) }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore your vault</DialogTitle>
          <DialogDescription>Choose a backup file or load your encrypted account backup, then enter its separate recovery key. Your login passphrase cannot decrypt it.</DialogDescription>
        </DialogHeader>
        <input type="file" accept="application/json,.json" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-[13px]" />
        {import.meta.env.VITE_DEMO !== '1' && <Button variant="outline" disabled={busy} onClick={loadAccount}>Load account backup</Button>}
        {file && <p className="text-xs text-muted-foreground">Selected: {file.name}</p>}
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
          <p className="mt-1 text-[13px] text-fg/65">To {purpose}, this browser needs your private encryption keys. They are generated here; backups leave only as encrypted ciphertext.</p>
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
  const [saving, setSaving] = useState(false)
  const [cloudOpen, setCloudOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const removeAccountBackup = async () => {
    setDeleting(true)
    try {
      const current = await api.vaultBackup()
      if (!current.backup) throw new Error('No account backup saved')
      await api.deleteVaultBackup(current.revision)
      setRemoveOpen(false)
      toast.success('Account backup removed. Downloaded files and local keys are unaffected.')
    } catch (e) { toast.error((e as Error).message) } finally { setDeleting(false) }
  }

  const backup = async (toAccount = false) => {
    if (!account) return
    setSaving(true)
    try {
      const current = toAccount ? await api.vaultBackup() : null
      const { recoveryKey, blob } = await exportBackup(account)
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `arcana-vault-${account.alias}.json`; a.click(); URL.revokeObjectURL(a.href)
      setRecovery(recoveryKey)
      setCloudOpen(false)
      if (current) {
        await api.saveVaultBackup(JSON.parse(await blob.text()), current.revision)
        toast.success('Encrypted backup saved to your account. Keep the new recovery key safe.')
      }
      setCloudOpen(false)
    } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
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
            <Button className="h-9" disabled={saving} onClick={() => backup()}><Download className="size-3.5" />Download backup</Button>
            {import.meta.env.VITE_DEMO !== '1' && <Button variant="outline" className="h-9" disabled={saving} onClick={() => setCloudOpen(true)}>Save account backup</Button>}
            <Button variant="outline" className="h-9" onClick={() => setRestoring(true)}><Upload className="size-3.5" />Restore</Button>
            <Button variant="ghost" className="h-9 text-destructive" onClick={() => setResetOpen(true)}><RotateCcw className="size-3.5" />Reset keys</Button>
          </div>
          {recovery && (
            <div className="mt-5 rounded-xl border border-signal/30 bg-signal/[0.05] p-4 text-[13px]">
              <p className="font-medium text-fg">Recovery key, shown once</p>
              <p className="mt-1 text-fg/65">Store it apart from the backup file, for example on paper or in a password manager. Each new backup has a new recovery key. You need both to restore your keys. Download a fresh backup after every new capsule.</p>
              <p className="mt-3 select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-[12px] text-fg">{recovery}</p>
            </div>
          )}
        </div>
      )}
      {import.meta.env.VITE_DEMO !== '1' && <div className="rounded-2xl border bg-card p-6 text-[13px] text-muted-foreground">
        <p>Your account activity is stored by the backend. To use encrypted purchases and messages on another device, sign in and restore your key backup. Backups are snapshots; save a new one after creating capsules or changing keys.</p>
        <Button variant="ghost" className="mt-3 text-destructive" disabled={deleting} onClick={() => setRemoveOpen(true)}>Remove account backup</Button>
      </div>}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove account backup?</DialogTitle><DialogDescription>This removes the encrypted copy stored with your account. Keep a downloaded backup and its recovery key before removing your only recovery copy. Local keys are unaffected.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="destructive" disabled={deleting} onClick={removeAccountBackup}>Remove stored backup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cloudOpen} onOpenChange={setCloudOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save an encrypted account backup</DialogTitle><DialogDescription>This replaces your previous account backup and creates a new recovery key. Only ciphertext is uploaded. A copy is also downloaded. Keep the new recovery key separately; we cannot recover it for you.</DialogDescription></DialogHeader>
          <DialogFooter><Button disabled={saving} onClick={() => backup(true)}>{saving ? 'Saving…' : 'Encrypt & save backup'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
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
