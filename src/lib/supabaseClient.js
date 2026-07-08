import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// A aplicacao funciona em dois modos:
//  - MODO SUPABASE: quando as variaveis de ambiente estao configuradas.
//  - MODO DEMO: sem backend, guardando tudo no localStorage do navegador.
//
// isSupabaseConfigured permite que os services escolham a fonte de dados.
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
