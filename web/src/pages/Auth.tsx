import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Landscape } from '@/components/landscape'
import { Logo } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'

export default function Auth() {
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'login')
  const [alias, setAlias] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const { setAccount } = useSession()
  const nav = useNavigate()
  const next = params.get('next')?.startsWith('/') ? params.get('next')! : '/studio'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const r = mode === 'signup' ? await api.signup(alias, pass) : await api.login(alias, pass)
      setAccount(r.account)
      toast.success(mode === 'signup' ? `Welcome, @${r.account.alias}` : `Signed in as @${r.account.alias}`)
      nav(next)
    } catch (err) { toast.error((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        <Landscape className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 to-transparent" />
        <p className="absolute bottom-12 left-12 max-w-sm font-serif text-[40px] leading-[1.05] text-frost">An alias, a passphrase and nothing else.</p>
      </div>
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/"><Logo /></Link>
        <div className="m-auto w-full max-w-sm py-12">
          <div className="flex rounded-full bg-white/[0.04] p-1 text-[13px]">
            {(['login', 'signup'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cn('flex-1 rounded-full py-1.5 transition', mode === m ? 'bg-frost text-ink' : 'text-frost/60')}>{m === 'login' ? 'Log in' : 'Create alias'}</button>
            ))}
          </div>
          <h1 className="mt-8 text-[28px] tracking-[-0.02em] text-frost">{mode === 'login' ? 'Welcome back' : 'Claim an alias'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{mode === 'login' ? 'Use the alias and passphrase you chose.' : 'No email or phone. Write your passphrase down, because it cannot be recovered.'}</p>
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="alias">Alias</Label>
              <Input id="alias" className="h-11" autoComplete="username" required minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_\-]{2,23}" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="e.g. halden" />
              {mode === 'signup' && <p className="text-xs text-muted-foreground">3–24 characters: letters, numbers, - or _. It must start with a letter.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">Passphrase</Label>
              <Input id="pass" className="h-11" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={12} maxLength={200} value={pass} onChange={(e) => setPass(e.target.value)} />
              {mode === 'signup' && <p className="text-xs text-muted-foreground">At least 12 characters. A few random words works well.</p>}
            </div>
            <Button type="submit" className="h-11 w-full" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create alias'}</Button>
          </form>
        </div>
        <p className="text-center text-xs text-frost/40">Testnet preview · sessions are HttpOnly, rotating and revocable</p>
      </div>
    </div>
  )
}
