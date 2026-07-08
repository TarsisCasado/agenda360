import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authService } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const current = await authService.getCurrentUser()
    setUser(current)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const sub = authService.onAuthChange(async () => {
      await refresh()
    })
    return () => sub?.unsubscribe?.()
  }, [refresh])

  const signIn = useCallback(async (email, password) => {
    const { user: u, error } = await authService.signIn(email, password)
    if (!error && u) setUser(await authService.getCurrentUser())
    return { error }
  }, [])

  const signUp = useCallback(async (email, password, fullName) => {
    const { error } = await authService.signUp(email, password, fullName)
    if (!error) await refresh()
    return { error }
  }, [refresh])

  const signOut = useCallback(async () => {
    await authService.signOut()
    setUser(null)
  }, [])

  const value = {
    user,
    loading,
    isDemo: authService.isDemo,
    signIn,
    signUp,
    signOut,
    refresh,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
