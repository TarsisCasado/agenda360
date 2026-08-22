// ===========================================================================
// Edge Function: push-delivery-worker (Sprint 2 / Etapa 1D — DELIVERY)
// ---------------------------------------------------------------------------
// Handler HTTP FINO. Toda a logica de negocio vive em ./deliver.ts (pura,
// testavel em Node) e ./webPush.ts (protocolo Web Push, Web Crypto pura).
//
// O QUE FAZ: entrega notifications(channel='push', status='pending',
// scheduled_for<=now) como notificacoes nativas via Web Push (RFC 8030),
// cifradas (RFC 8291) e assinadas com VAPID (RFC 8292). NAO cria reminders
// nem notifications — isso e do reminders-worker (funcao separada, intacta).
//
// -------------------- AUTENTICACAO (mesmo padrao do reminders-worker) -----
// verify_jwt = false (flag de deploy). Quem invoca e o agendador (pg_cron via
// pg_net), nao um usuario logado. Guard efetivo: segredo dedicado no header
// `x-push-worker-secret`, comparado em tempo constante.
//
// -------------------- SEGREDOS / ENV (apenas NOMES) ------------------------
//   SUPABASE_URL                 (injetado pela plataforma)
//   SUPABASE_SERVICE_ROLE_KEY    (backend-only; bypassa RLS)
//   PUSH_WORKER_SECRET           (segredo dedicado do agendador; != service_role)
//   VAPID_PUBLIC_KEY             (nao secreta, mas mantida so no backend por padrao)
//   VAPID_PRIVATE_KEY            (SECRETA — nunca em VITE_*, nunca no frontend)
//   VAPID_SUBJECT                (ex.: mailto:ops@dominio.com — exigido pela RFC 8292)
//   PUSH_WORKER_BATCH            (opcional; default 50)
//   PUSH_WORKER_MAX_ATTEMPTS     (opcional; default 5)
// NENHUM valor e commitado. Ver README.md.
//
// Deploy (NAO executar agora): supabase functions deploy push-delivery-worker --no-verify-jwt
// ===========================================================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { deliverDuePushNotifications, DEFAULT_BATCH_SIZE, DEFAULT_MAX_ATTEMPTS } from './deliver.ts'
import { sendWebPush } from './webPush.ts'

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

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // 1) AUTORIZACAO: segredo dedicado, comparado em tempo constante.
  const expected = Deno.env.get('PUSH_WORKER_SECRET') ?? ''
  const provided = req.headers.get('x-push-worker-secret') ?? ''
  if (!expected || !timingSafeEqual(provided, expected)) {
    return json({ error: 'unauthorized' }, 401)
  }

  // 2) Client service_role (backend-only). Necessario: authenticated e
  //    SELECT-only em notifications e nao le/escreve push_subscriptions de outro user.
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? ''
  if (!url || !serviceRole || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return json({ error: 'server_misconfigured' }, 500)
  }
  const db = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const batchEnv = Number(Deno.env.get('PUSH_WORKER_BATCH'))
  const batchSize = Number.isFinite(batchEnv) && batchEnv > 0 ? batchEnv : DEFAULT_BATCH_SIZE
  const maxAttemptsEnv = Number(Deno.env.get('PUSH_WORKER_MAX_ATTEMPTS'))
  const maxAttempts = Number.isFinite(maxAttemptsEnv) && maxAttemptsEnv > 0 ? maxAttemptsEnv : DEFAULT_MAX_ATTEMPTS

  try {
    const counters = await deliverDuePushNotifications(db, {
      batchSize,
      maxAttempts,
      vapid: { publicKey: vapidPublicKey, privateKey: vapidPrivateKey, subject: vapidSubject },
      sendPush: sendWebPush,
      log: (entry) => console.log(JSON.stringify(entry)),
    })
    return json({ ok: true, ...counters })
  } catch (err) {
    console.log(
      JSON.stringify({ level: 'error', event: 'worker_failed', message: String((err as Error)?.message || err) }),
    )
    return json({ ok: false, error: 'worker_failed' }, 500)
  }
})
