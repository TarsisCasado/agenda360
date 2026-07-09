import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Inicializacao do cliente Supabase.
//
// A aplicacao funciona em dois modos, detectados automaticamente:
//   - MODO SUPABASE: quando VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estao
//     preenchidas e validas.
//   - MODO DEMO: sem backend, guardando tudo no localStorage do navegador.
//
// A deteccao e defensiva: valores vazios, com espacos/quebras de linha (comum
// ao colar do painel) ou invalidos NAO derrubam a aplicacao — caem no modo demo
// com um aviso claro no console.
// ---------------------------------------------------------------------------

// .trim() remove espacos e \n acidentais ao colar as credenciais.
const rawUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const rawKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

function isValidHttpUrl(value) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// So consideramos "configurado" se houver URL http(s) valida + chave nao vazia.
const hasCredentials = rawUrl.length > 0 && rawKey.length > 0
const urlIsValid = hasCredentials && isValidHttpUrl(rawUrl)

let client = null
let configured = false

if (hasCredentials && !urlIsValid) {
  // Credenciais presentes porem invalidas: avisa e cai no modo demo em vez de
  // quebrar a aplicacao com um erro de inicializacao.
  console.error(
    '[Agenda360] VITE_SUPABASE_URL invalida:',
    JSON.stringify(rawUrl),
    '\nEsperado algo como https://SEU-PROJETO.supabase.co. Rodando em MODO DEMO.',
  )
} else if (urlIsValid) {
  try {
    client = createClient(rawUrl, rawKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
    configured = true
  } catch (err) {
    console.error(
      '[Agenda360] Falha ao inicializar o Supabase. Rodando em MODO DEMO.',
      err,
    )
    client = null
    configured = false
  }
}

export const supabase = client
export const isSupabaseConfigured = configured

// Diagnostico util durante a integracao (nao expoe a chave completa).
if (import.meta.env.DEV) {
  if (configured) {
    console.info(
      `[Agenda360] MODO SUPABASE ativo · url=${rawUrl} · key=${rawKey.slice(0, 8)}…`,
    )
  } else {
    console.info('[Agenda360] MODO DEMO ativo (Supabase nao configurado).')
  }
}
