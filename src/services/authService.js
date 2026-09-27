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

// Monta o usuario da app a partir do usuario do Auth + perfil. `authUser` ja
// veio de uma sessao valida (getSession/evento); o perfil e ENRIQUECIMENTO —
// se a rede cair ao busca-lo, o usuario continua autenticado com defaults.
// Erro de transporte no perfil NUNCA transforma sessao valida em logout.
function mapUser(authUser, profile) {
  return {
    id: authUser.id,
    email: authUser.email,
    full_name: profile?.full_name ?? authUser.email,
    role: profile?.role ?? ROLES.COLLABORATOR,
    default_workspace_id: profile?.default_workspace_id ?? null,
    // Fonte unica do fuso do usuario (0012). O motor de lembretes le daqui.
    timezone: profile?.timezone ?? 'America/Sao_Paulo',
  }
}

// Decide o que um evento do gotrue significa para o app, SEM ir a rede.
//   SIGNED_OUT            -> limpar (logout real, imediato)
//   evento com sessao     -> setar a partir da PROPRIA sessao recebida
//   evento sem sessao     -> ignorar (transitorio: refresh que falhou etc.)
// Assim uma piscada de rede nao dispara revalidacao remota nem derruba o user.
export function decideAuthChange(event, session) {
  if (event === 'SIGNED_OUT') return { action: 'clear' }
  if (session?.user) return { action: 'set', authUser: session.user }
  return { action: 'ignore' }
}

export const authService = {
  isDemo: !isSupabaseConfigured,

  // Enriquecimento tolerante a rede: monta o usuario a partir de uma sessao ja
  // valida. `fetchProfile` devolve null em erro (nao lanca), entao offline o
  // usuario sai com defaults — nunca null.
  async buildUser(authUser) {
    if (!authUser) return null
    let profile = null
    try {
      profile = await fetchProfile(authUser.id)
    } catch {
      profile = null
    }
    return mapUser(authUser, profile)
  },

  async getCurrentUser() {
    if (!isSupabaseConfigured) {
      const active = localStorage.getItem(DEMO_SESSION_KEY)
      return active ? localStore.DEMO_USER : null
    }
    try {
      // getSession(): LOCAL, nao vai a rede — le a sessao persistida. Erro de
      // transporte na restauracao deixa de virar logout. A validade do token
      // continua governada pelo gotrue (autoRefresh + evento SIGNED_OUT); nao
      // damos por valido nenhum token que o proprio Supabase invalidou.
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        // Erro inesperado ao LER a sessao local: preserva o usuario atual em
        // vez de desloga-lo (marcador tratado no AuthContext).
        console.error('[Agenda360] getSession falhou:', error?.message || error)
        return { transient: true }
      }
      if (!data?.session?.user) return null // sem sessao real -> Login
      return await this.buildUser(data.session.user)
    } catch (err) {
      // Falha de transporte inesperada: NAO desloga uma sessao possivelmente
      // valida — sinaliza transitorio para o AuthContext preservar o user.
      console.error('[Agenda360] getCurrentUser falhou (transitorio):', err?.message || err)
      return { transient: true }
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

  // Encaminha (event, session) — quem consome decide via decideAuthChange, sem
  // revalidar por rede a cada evento.
  onAuthChange(callback) {
    if (!isSupabaseConfigured) {
      return { unsubscribe: () => {} }
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session)
    })
    return data.subscription
  },
}
