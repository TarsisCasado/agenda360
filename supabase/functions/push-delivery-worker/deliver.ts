// ===========================================================================
// push-delivery-worker — LOGICA PURA de ENTREGA (Sprint 2 / Etapa 1D)
// ---------------------------------------------------------------------------
// Entrega notifications(channel='push', status='pending', scheduled_for<=now)
// como Web Push nativo. Sem imports Deno de proposito: recebe um `db`
// (client supabase-js) e um `sendPush` injetados — roda no handler
// (service_role) e e testavel em Node com fakes.
//
// ORDEM DE SEGURANCA (evita envio duplicado entre execucoes proximas):
//   1) CLAIM atomico: status 'pending' -> 'processing' (ou 'processing'
//      ESTAGNADO ha mais de STALE_MINUTES, cobrindo crash/timeout no meio do
//      lote) com guarda otimista por `attempts`. So quem ganha a corrida do
//      UPDATE processa; a outra execucao recebe 0 linhas e pula.
//   2) SO ENTAO enviamos o push (efeito colateral irreversivel).
//   3) status final ('sent' | volta 'pending' p/ retry | 'failed') e escrito
//      depois do envio, nunca antes.
// ===========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SendPushFn = (subscription: any, payload: Record<string, unknown>, vapid: any, opts?: any) => Promise<{
  ok: boolean
  status: number
  expired: boolean
  error?: string
}>

export const DEFAULT_BATCH_SIZE = 50
export const DEFAULT_MAX_ATTEMPTS = 5
export const DEFAULT_STALE_MINUTES = 5
export const DEFAULT_TTL_SECONDS = 24 * 60 * 60

type LogFn = (entry: Record<string, unknown>) => void

interface DeliverOptions {
  now?: string | number | Date
  batchSize?: number
  maxAttempts?: number
  staleMinutes?: number
  ttlSeconds?: number
  vapid: { publicKey: string; privateKey: string; subject: string }
  sendPush: SendPushFn
  log?: LogFn
}

interface Counters {
  found: number
  sent: number
  retried: number
  failed: number
  skipped: number
  disabled_subscriptions: number
  errors: number
}

function buildPayload(notification: { id: string; task_id: string | null; scheduled_for: string | null }, task: any) {
  const title = 'Agenda 360'
  const timeLabel = task?.start_time ? String(task.start_time).slice(0, 5) : null
  const categoryName = task?.category?.name ?? null
  const line1 = task?.title || 'Lembrete de atividade'
  const line2 = [timeLabel, categoryName].filter(Boolean).join(' • ')
  const body = line2 ? `${line1}\n${line2}` : line1
  const url = task?.id
    ? `/dia?date=${encodeURIComponent(task.date)}&task=${encodeURIComponent(task.id)}`
    : '/dia'

  return {
    title,
    body,
    // PNG (nao SVG): suporte mais confiavel para icone/badge de notificacao
    // entre plataformas (varios navegadores/OS nao rasterizam SVG aqui).
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `agenda360-notification-${notification.id}`,
    data: {
      url,
      taskId: task?.id ?? notification.task_id ?? null,
      notificationId: notification.id,
      scheduledFor: notification.scheduled_for,
    },
  }
}

// `db` e duck-typed: apenas o subconjunto de supabase-js que usamos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deliverDuePushNotifications(db: any, opts: DeliverOptions): Promise<Counters> {
  const batchSize = opts.batchSize && opts.batchSize > 0 ? opts.batchSize : DEFAULT_BATCH_SIZE
  const maxAttempts = opts.maxAttempts && opts.maxAttempts > 0 ? opts.maxAttempts : DEFAULT_MAX_ATTEMPTS
  const staleMinutes = opts.staleMinutes && opts.staleMinutes > 0 ? opts.staleMinutes : DEFAULT_STALE_MINUTES
  const ttlSeconds = opts.ttlSeconds && opts.ttlSeconds > 0 ? opts.ttlSeconds : DEFAULT_TTL_SECONDS
  const now = opts.now ? new Date(opts.now) : new Date()
  const nowIso = now.toISOString()
  const staleBeforeIso = new Date(now.getTime() - staleMinutes * 60_000).toISOString()
  const log: LogFn = typeof opts.log === 'function' ? opts.log : () => {}
  const counters: Counters = {
    found: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    disabled_subscriptions: 0,
    errors: 0,
  }

  // Elegibilidade: pending vencidos + processing ESTAGNADO (recuperacao de
  // crash/timeout no meio de um lote anterior).
  const { data: due, error } = await db
    .from('notifications')
    .select('id, workspace_id, task_id, user_id, scheduled_for, attempts, status')
    .eq('channel', 'push')
    .or(`status.eq.pending,and(status.eq.processing,claimed_at.lt.${staleBeforeIso})`)
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(batchSize)

  if (error) {
    throw new Error(`falha ao buscar notifications pendentes: ${error.message || error.code}`)
  }

  counters.found = due.length
  if (due.length === 0) return counters

  // Batch: tasks + subscriptions vivas dos destinatarios (evita N+1).
  const taskIds = [...new Set(due.map((n: any) => n.task_id).filter(Boolean))]
  const userIds = [...new Set(due.map((n: any) => n.user_id).filter(Boolean))]

  const tasksById = new Map<string, any>()
  if (taskIds.length > 0) {
    const { data: tasks, error: tErr } = await db
      .from('tasks')
      .select('id, title, date, start_time, category:categories(name)')
      .in('id', taskIds)
    if (tErr) throw new Error(`falha ao buscar tasks: ${tErr.message || tErr.code}`)
    for (const t of tasks) tasksById.set(t.id, t)
  }

  const subsByUser = new Map<string, any[]>()
  if (userIds.length > 0) {
    const { data: subs, error: sErr } = await db
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .in('user_id', userIds)
      .is('disabled_at', null)
    if (sErr) throw new Error(`falha ao buscar push_subscriptions: ${sErr.message || sErr.code}`)
    for (const s of subs) {
      const arr = subsByUser.get(s.user_id) ?? []
      arr.push(s)
      subsByUser.set(s.user_id, arr)
    }
  }

  for (const n of due) {
    // 1) CLAIM atomico (guarda otimista por attempts + condicao pending/stale).
    const claimedAttempts = (n.attempts ?? 0) + 1
    const claim = await db
      .from('notifications')
      .update({ status: 'processing', claimed_at: nowIso, attempts: claimedAttempts })
      .eq('id', n.id)
      .eq('attempts', n.attempts ?? 0)
      .or(`status.eq.pending,and(status.eq.processing,claimed_at.lt.${staleBeforeIso})`)
      .select('id')

    if (claim.error) {
      counters.errors += 1
      log({ level: 'error', event: 'claim_failed', notification_id: n.id, code: claim.error.code })
      continue
    }
    if (!claim.data || claim.data.length === 0) {
      // Outra execucao ja reivindicou esta linha: idempotencia OK, so pula.
      counters.skipped += 1
      log({ level: 'info', event: 'skip_already_claimed', notification_id: n.id })
      continue
    }

    // 2) Envio (efeito colateral) — SO depois do claim confirmado.
    const subs = n.user_id ? subsByUser.get(n.user_id) ?? [] : []
    const task = n.task_id ? tasksById.get(n.task_id) : null
    const payload = buildPayload(n, task)

    const results: Array<{ sub: any; ok: boolean; status: number; expired: boolean; error?: string }> = []
    for (const sub of subs) {
      const r = await opts.sendPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload,
        opts.vapid,
        { ttlSeconds },
      )
      results.push({ sub, ...r })
      // DIAGNOSTICO TEMPORARIO (investigacao "ultima milha" Safari/macOS):
      // prova, por notification, que o Push Service (ex.: web.push.apple.com)
      // respondeu — e SOMENTE isso. status='sent' nunca significou "o Safari
      // exibiu a notificacao"; sempre significou "o Push Service aceitou (2xx)
      // o envio", que e opaco quanto a decriptacao/exibicao no dispositivo.
      log({
        level: 'info',
        event: 'push_send_result',
        notification_id: n.id,
        subscription_id: sub.id,
        endpoint_host: (() => {
          try {
            return new URL(sub.endpoint).host
          } catch {
            return null
          }
        })(),
        ok: r.ok,
        status: r.status,
        expired: r.expired,
        response_headers: r.responseHeaders ?? null,
        response_body_snippet: r.responseBodySnippet ?? null,
        error: r.error ?? null,
      })
      if (r.expired) {
        const dis = await db
          .from('push_subscriptions')
          .update({ disabled_at: nowIso, disabled_reason: `http_${r.status}` })
          .eq('id', sub.id)
        if (!dis.error) counters.disabled_subscriptions += 1
      }
    }

    const anySuccess = results.some((r) => r.ok)

    // 3) Status final.
    if (anySuccess) {
      const upd = await db
        .from('notifications')
        .update({ status: 'sent', sent_at: nowIso, last_error: null })
        .eq('id', n.id)
      if (upd.error) {
        counters.errors += 1
        log({ level: 'error', event: 'mark_sent_failed', notification_id: n.id, code: upd.error.code })
      } else {
        counters.sent += 1
      }
      continue
    }

    const lastError =
      subs.length === 0
        ? 'no_active_subscription'
        : results
            .map((r) => r.error || `http_${r.status}`)
            .join(';')
            .slice(0, 500)

    if (claimedAttempts >= maxAttempts) {
      const upd = await db.from('notifications').update({ status: 'failed', last_error: lastError }).eq('id', n.id)
      if (upd.error) {
        counters.errors += 1
        log({ level: 'error', event: 'mark_failed_failed', notification_id: n.id, code: upd.error.code })
      } else {
        counters.failed += 1
        log({ level: 'warn', event: 'delivery_failed_final', notification_id: n.id, attempts: claimedAttempts })
      }
    } else {
      const upd = await db.from('notifications').update({ status: 'pending', last_error: lastError }).eq('id', n.id)
      if (upd.error) {
        counters.errors += 1
        log({ level: 'error', event: 'mark_retry_failed', notification_id: n.id, code: upd.error.code })
      } else {
        counters.retried += 1
        log({ level: 'info', event: 'delivery_retry_scheduled', notification_id: n.id, attempts: claimedAttempts })
      }
    }
  }

  return counters
}
