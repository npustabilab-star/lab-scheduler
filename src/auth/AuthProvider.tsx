import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'

type AuthValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const apply = async (s: Session | null) => {
      const p = s ? await loadProfile(s.user.id) : null
      if (cancelled) return
      setSession(s)
      setProfile(p)
      setLoading(false)
    }
    // Never await supabase calls inside the callback itself (auth lock deadlock): defer.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setTimeout(() => void apply(s), 0)
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const p = data.session ? await loadProfile(data.session.user.id) : null
    setSession(data.session)
    setProfile(p)
  }, [])

  const value = useMemo(() => ({ session, profile, loading, refresh }), [session, profile, loading, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
