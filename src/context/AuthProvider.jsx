import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AuthContext } from './authContext'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.error(error)
      setProfile(null)
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    let mounted = true

    const safeFinishLoading = () => {
      if (mounted) setLoading(false)
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!mounted) return
        setSession(s)
        return loadProfile(s?.user?.id)
      })
      .catch((err) => {
        console.error('getSession failed:', err)
      })
      .finally(safeFinishLoading)

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return
      setSession(s)
      setLoading(true)
      loadProfile(s?.user?.id)
        .catch((err) => console.error('loadProfile failed:', err))
        .finally(safeFinishLoading)
    })

    const failSafe = window.setTimeout(safeFinishLoading, 12000)

    return () => {
      mounted = false
      window.clearTimeout(failSafe)
      subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const refreshProfile = useCallback(() => loadProfile(session?.user?.id), [loadProfile, session])

  const value = useMemo(
    () => ({
      session,
      profile,
      loading,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
