import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { ROLES } from '../lib/constants'

const DEMO_SESSION_KEY = 'agenda360.demoSession'

// ---------------------------------------------------------------------------
// Servico de autenticacao.
// MODO SUPABASE: usa supabase.auth (e-mail + senha) e a tabela `profiles`.
// MODO DEMO: login "faz de conta" com o usuario demo local.
// ---------------------------------------------------------------------------

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}

export const authService = {
  isDemo: !isSupabaseConfigured,

  async getCurrentUser() {
    if (!isSupabaseConfigured) {
      const active = localStorage.getItem(DEMO_SESSION_KEY)
      return active ? localStore.DEMO_USER : null
    }
    const { data } = await supabase.auth.getUser()
    if (!data?.user) return null
    const profile = await fetchProfile(data.user.id)
    return {
      id: data.user.id,
      email: data.user.email,
      full_name: profile?.full_name ?? data.user.email,
      role: profile?.role ?? ROLES.COLLABORATOR,
      default_workspace_id: profile?.default_workspace_id ?? null,
    }
  },

  async signIn(email, password) {
    if (!isSupabaseConfigured) {
      // Modo demo: aceita qualquer credencial e entra como admin local.
      localStorage.setItem(DEMO_SESSION_KEY, '1')
      return { user: localStore.DEMO_USER, error: null }
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) return { user: null, error: error.message }
    const profile = await fetchProfile(data.user.id)
    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name ?? data.user.email,
        role: profile?.role ?? ROLES.COLLABORATOR,
      },
      error: null,
    }
  },

  async signUp(email, password, fullName) {
    if (!isSupabaseConfigured) {
      localStorage.setItem(DEMO_SESSION_KEY, '1')
      return { user: localStore.DEMO_USER, error: null }
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (error) return { user: null, error: error.message }
    // O perfil e criado automaticamente por trigger no banco (ver schema.sql).
    return { user: data.user, error: null }
  },

  async signOut() {
    if (!isSupabaseConfigured) {
      localStorage.removeItem(DEMO_SESSION_KEY)
      return
    }
    await supabase.auth.signOut()
  },

  onAuthChange(callback) {
    if (!isSupabaseConfigured) {
      return { unsubscribe: () => {} }
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null)
    })
    return data.subscription
  },
}
