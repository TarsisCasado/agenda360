import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authService, decideAuthChange } from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const current = await authService.getCurrentUser()
    // `transient` = erro de transporte ao restaurar. NAO derruba um usuario ja
    // valido por causa de rede: preserva o atual e apenas encerra o loading.
    if (current && current.transient) {
      setLoading(false)
      return
    }
    setUser(current)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    // Reage ao EVENTO, sem revalidar por rede a cada disparo. SIGNED_OUT limpa
    // imediatamente; um evento com sessao seta a partir da propria sessao; um
    // evento transitorio (refresh que falhou offline) e ignorado — o usuario
    // permanece autenticado.
    const sub = authService.onAuthChange(async (event, session) => {
      const decision = decideAuthChange(event, session)
      if (decision.action === 'clear') setUser(null)
      else if (decision.action === 'set') setUser(await authService.buildUser(decision.authUser))
      // 'ignore': nao mexe no usuario atual
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
