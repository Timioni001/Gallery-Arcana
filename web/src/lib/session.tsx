import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Account } from './api'

type Session = { account: Account | null; online: boolean; ready: boolean; refresh: () => Promise<void>; setAccount: (a: Account | null) => void }
const Ctx = createContext<Session>({ account: null, online: false, ready: false, refresh: async () => {}, setAccount: () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [online, setOnline] = useState(false)
  const [ready, setReady] = useState(false)
  const refresh = useCallback(async () => {
    try { setAccount((await api.me()).account); setOnline(true) } catch { setOnline(false) } finally { setReady(true) }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  return <Ctx.Provider value={{ account, online, ready, refresh, setAccount }}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
