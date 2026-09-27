import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { fusoValido } from '../lib/timezone'

// ---------------------------------------------------------------------------
// profileService — leitura/escrita do que pertence ao USUARIO (nao ao
// workspace). Hoje: o fuso horario, que o motor de lembretes usa para
// converter "14:00" no instante real.
//
// Nenhuma coluna nova: `profiles.timezone` ja existe desde a migration 0012.
// ---------------------------------------------------------------------------
export const profileService = {
  async getTimezone(userId) {
    if (!userId) return null
    if (!isSupabaseConfigured) {
      return localStore.table('profiles').find((p) => p.id === userId)?.timezone || null
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    return data?.timezone || null
  },

  // Escreve so um fuso IANA valido. Um valor invalido (dado corrompido, string
  // vazia) faria o motor calcular errado ou lancar — melhor recusar aqui.
  async setTimezone(userId, timezone) {
    if (!userId || !fusoValido(timezone)) return { ok: false, reason: 'invalido' }
    if (!isSupabaseConfigured) {
      const rows = localStore.table('profiles')
      const idx = rows.findIndex((p) => p.id === userId)
      if (idx === -1) return { ok: false, reason: 'sem_perfil' }
      rows[idx] = { ...rows[idx], timezone }
      localStore.setTable('profiles', rows)
      return { ok: true }
    }
    const { error } = await supabase.from('profiles').update({ timezone }).eq('id', userId)
    if (error) throw error
    return { ok: true }
  },
}
