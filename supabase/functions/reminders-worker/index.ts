// ===========================================================================
// Edge Function: reminders-worker  (Sprint 2 / Etapa 1C — ENQUEUE)
// ---------------------------------------------------------------------------
// Handler HTTP FINO. Toda a logica de negocio vive em ./worker.ts (pura e
// testavel em Node). Aqui so ficam: autenticacao do agendador, montagem do
// client service_role e serializacao dos contadores.
//
// O QUE FAZ: transforma reminders VENCIDOS em notifications (status 'pending').
// NAO ENTREGA nada (WhatsApp/push/email sao etapas futuras).
//
// -------------------- AUTENTICACAO (decisao aprovada) ----------------------
// Esta funcao roda com `verify_jwt = false` (flag de deploy; ver README).
// Justificativa:
//   - Quem invoca e o AGENDADOR (pg_cron via pg_net), nao um usuario logado;
//     nao existe JWT de usuario a validar.
//   - `verify_jwt = true` so exigiria a ANON KEY, que e PUBLICA (vai no
//     frontend). Logo, verify_jwt NAO e um guard real de autorizacao aqui.
// Em vez disso exigimos um SEGREDO DEDICADO no header `x-reminders-secret`,
// comparado em tempo constante:
//   - Diferente do service_role (que NUNCA e exposto/verificado por request);
//   - Vive so como env/secret (nunca em codigo, nunca em VITE_*, nunca no
//     frontend); para o pg_cron, guardado no Vault (nunca plaintext no cron.job).
// Sem o segredo correto -> 401, sem tocar o banco.
//
// -------------------- SEGREDOS / ENV (apenas NOMES) ------------------------
//   SUPABASE_URL                 (injetado pela plataforma)
//   SUPABASE_SERVICE_ROLE_KEY    (backend-only; bypassa RLS p/ inserir notifs)
//   REMINDERS_WORKER_SECRET      (segredo dedicado do agendador; != service_role)
//   REMINDERS_WORKER_BATCH       (opcional; tamanho do lote, default 100)
// NENHUM valor e commitado. Ver README.md.
//
// Deploy (NAO executar agora): supabase functions deploy reminders-worker --no-verify-jwt
// ===========================================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { enqueueDueReminders, DEFAULT_BATCH_SIZE } from './worker.ts'

// Comparacao em tempo constante: evita vazar o segredo por timing. Compara
// bytes UTF-8; comprimentos diferentes -> false, sem short-circuit por tamanho
// que revele o comprimento do segredo.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  const len = Math.max(ab.length, bb.length)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  }
  return diff === 0
}

serve(async (req) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  // So aceitamos POST (invocacao do agendador). GET/HEAD/etc. -> 405.
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // 1) AUTORIZACAO: segredo dedicado, comparado em tempo constante.
  const expected = Deno.env.get('REMINDERS_WORKER_SECRET') ?? ''
  const provided = req.headers.get('x-reminders-secret') ?? ''
  if (!expected || !timingSafeEqual(provided, expected)) {
    // NUNCA logamos o segredo recebido/esperado.
    return json({ error: 'unauthorized' }, 401)
  }

  // 2) Client service_role (backend-only). Bypassa RLS: necessario porque
  //    `authenticated` e SELECT-only em notifications (migration 0011).
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceRole) return json({ error: 'server_misconfigured' }, 500)
  const db = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // 3) Tamanho do lote (opcional, via env).
  const batchEnv = Number(Deno.env.get('REMINDERS_WORKER_BATCH'))
  const batchSize = Number.isFinite(batchEnv) && batchEnv > 0 ? batchEnv : DEFAULT_BATCH_SIZE

  // 4) Executa o enqueue. Log estruturado -> stdout da Function (so contadores
  //    e ids tecnicos; jamais secrets/tokens/payload sensivel).
  try {
    const counters = await enqueueDueReminders(db, {
      batchSize,
      log: (entry) => console.log(JSON.stringify(entry)),
    })
    return json({ ok: true, ...counters })
  } catch (err) {
    console.log(JSON.stringify({ level: 'error', event: 'worker_failed', message: String((err as Error)?.message || err) }))
    return json({ ok: false, error: 'worker_failed' }, 500)
  }
})
