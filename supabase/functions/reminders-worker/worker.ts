// ===========================================================================
// reminders-worker — LOGICA PURA de ENQUEUE (Sprint 2 / Etapa 1C)
// ---------------------------------------------------------------------------
// Transforma reminders VENCIDOS em notifications persistidas (status
// 'pending'). NAO entrega nada (WhatsApp/push/email/Gemini/voz sao etapas
// futuras). Sem imports Deno de proposito: recebe um `db` (client supabase-js,
// tipado por uso) injetado — assim roda no handler (service_role) e e testavel
// em Node com um client falso.
//
// SEMANTICA DE reminders.sent (decisao aprovada):
//   sent = true  => reminder JA foi PROCESSADO/ENFILEIRADO (a notification
//                   correspondente ja existe). NAO significa entrega ao
//                   usuario — a entrega vive exclusivamente em
//                   notifications.status (pending -> processing -> sent/failed/
//                   cancelled).
//
// ORDEM OBRIGATORIA (nunca inverter):
//   1) garantir/criar a notification (idempotente via UNIQUE(reminder_id,
//      channel) da 0012);
//   2) SO ENTAO marcar reminder.sent = true.
//   Se cair entre 1 e 2, a proxima execucao converge pela UNIQUE (23505) sem
//   duplicar. O estado "sent=true sem notification" e impossivel por construcao.
// ===========================================================================

// Limite por execucao: mantem tempo/memoria da Edge Function previsiveis e
// evita varreduras gigantes; o excedente e drenado nas execucoes seguintes
// (o agendador roda com frequencia). Ordenamos por remind_at ASC (mais antigos
// primeiro) para que nada "envelheca" indefinidamente.
export const DEFAULT_BATCH_SIZE = 100

// Logger estruturado injetavel. NUNCA recebe secrets/tokens/Authorization.
type LogFn = (entry: Record<string, unknown>) => void

interface EnqueueOptions {
  now?: string | number | Date
  batchSize?: number
  log?: LogFn
}

interface Counters {
  found: number
  enqueued: number
  already_exists: number
  skipped: number
  errors: number
  // Quantas notifications NOVAS (nao already_exists) desta execucao sao
  // channel='push' — e o sinal que decide o disparo imediato (ver
  // maybeTriggerPushDelivery). NAO conta already_exists: se ja existia,
  // ou uma execucao anterior ja disparou, ou o cron ja esta ciente dela.
  push_enqueued: number
}

// `db` e duck-typed: apenas o subconjunto de supabase-js que usamos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enqueueDueReminders(db: any, opts: EnqueueOptions = {}): Promise<Counters> {
  const batchSize = opts.batchSize && opts.batchSize > 0 ? opts.batchSize : DEFAULT_BATCH_SIZE
  const nowIso = (opts.now ? new Date(opts.now) : new Date()).toISOString()
  const log: LogFn = typeof opts.log === 'function' ? opts.log : () => {}
  const counters: Counters = {
    found: 0,
    enqueued: 0,
    already_exists: 0,
    skipped: 0,
    errors: 0,
    push_enqueued: 0,
  }

  // Elegibilidade (confirmada contra o schema real): sent=false AND
  // cancelled_at IS NULL AND remind_at <= agora. Futuros/cancelados/enviados
  // ficam de fora pela propria consulta.
  const { data: due, error } = await db
    .from('reminders')
    .select('id, workspace_id, task_id, recipient_id, type, remind_at')
    .eq('sent', false)
    .is('cancelled_at', null)
    .lte('remind_at', nowIso)
    .order('remind_at', { ascending: true })
    .limit(batchSize)

  if (error) {
    // Falha de leitura aborta a execucao (surfada ao chamador/logs da Function).
    throw new Error(`falha ao buscar reminders vencidos: ${error.message || error.code}`)
  }

  counters.found = due.length

  for (const r of due) {
    // Reminder legado sem destinatario: NAO criamos notification para NULL.
    // Fica como `skipped` observavel e o reminder permanece NAO processado
    // (sent=false) ate definirmos uma politica de legado.
    if (!r.recipient_id) {
      counters.skipped += 1
      log({ level: 'warn', event: 'skip_no_recipient', reminder_id: r.id, workspace_id: r.workspace_id })
      continue
    }

    // Snapshot: a notification herda DIRETAMENTE do reminder — nada e
    // recalculado a partir da task (usuario/workspace/canal/horario/timezone).
    const notification = {
      reminder_id: r.id,
      workspace_id: r.workspace_id,
      task_id: r.task_id ?? null, // task_id NULL nao impede a notification
      user_id: r.recipient_id,
      channel: r.type, // mesmo enum alert_type; sem conversao
      scheduled_for: r.remind_at, // preserva o instante planejado (auditoria)
      status: 'pending',
      payload: {}, // minimo; o worker de entrega enriquece depois
    }

    // 1) NOTIFICATION-FIRST (idempotente).
    const ins = await db.from('notifications').insert(notification)
    if (ins.error) {
      if (ins.error.code === '23505') {
        // Ja existe (execucao anterior caiu, ou concorrencia): estado
        // idempotente valido. Seguimos para marcar sent=true e convergir.
        counters.already_exists += 1
      } else {
        // Outro erro: NAO marcar sent=true; o reminder sera reprocessado.
        counters.errors += 1
        log({ level: 'error', event: 'insert_notification_failed', reminder_id: r.id, code: ins.error.code })
        continue
      }
    } else {
      counters.enqueued += 1
      if (notification.channel === 'push') counters.push_enqueued += 1
    }

    // 2) SO AGORA marcar como processado. O `.eq('sent', false)` evita corrida
    // com outra instancia que ja tenha marcado.
    const upd = await db.from('reminders').update({ sent: true }).eq('id', r.id).eq('sent', false)
    if (upd.error) {
      counters.errors += 1
      log({ level: 'error', event: 'mark_sent_failed', reminder_id: r.id, code: upd.error.code })
      // A notification ja existe; a proxima execucao converge pela UNIQUE.
    }
  }

  return counters
}

// ===========================================================================
// DISPARO IMEDIATO do push-delivery-worker (Sprint 2 / Etapa 1E — LATENCIA)
// ---------------------------------------------------------------------------
// O cron do push-delivery-worker (migration 0016) roda 1/min — ate 60s de
// latencia entre a notification 'pending' nascer e ser entregue. Quando este
// enqueue acabou de criar notification(s) de push NOVAS, disparamos o
// push-delivery-worker IMEDIATAMENTE, sem esperar o proximo tick.
//
// GARANTIAS (todas por construcao, nao por try/catch acidental):
//   - BEST-EFFORT: qualquer falha (rede, timeout, 401, 5xx) e ENGOLIDA aqui.
//     Nunca lanca, nunca faz o reminders-worker retornar erro por causa disto.
//   - NUNCA toca em `notifications`/`reminders` — quem decide pending/
//     processing/sent/failed continua sendo exclusivamente o
//     push-delivery-worker (claim atomico dele, intacto, ver deliver.ts).
//     Logo, uma falha no disparo NUNCA marca nada como failed.
//   - NAO aumenta a frequencia dos crons: e uma chamada HTTP extra e pontual,
//     nao um novo agendamento. O cron de 1/min continua sendo o fallback/
//     retry — se o disparo falhar ou o processo cair, a notification
//     continua 'pending' e o proximo tick entrega normalmente.
//   - NO MAXIMO 1 chamada por execucao do reminders-worker, mesmo que N
//     notifications de push tenham sido criadas no mesmo lote (o
//     push-delivery-worker ja processa em lote — sem duplicidade logica).
// ===========================================================================

export interface TriggerOptions {
  url: string
  secret: string
  fetchImpl?: typeof fetch
  log?: LogFn
  timeoutMs?: number
}

export interface TriggerResult {
  attempted: boolean
  ok: boolean
  status?: number
  error?: string
}

const DEFAULT_TRIGGER_TIMEOUT_MS = 5000

// Faz a chamada HTTP em si. So exportada separada para o caso (raro) de
// alguem precisar disparar fora do fluxo de enqueue; o caminho normal e via
// maybeTriggerPushDelivery, abaixo.
export async function triggerPushDelivery(opts: TriggerOptions): Promise<TriggerResult> {
  const log: LogFn = typeof opts.log === 'function' ? opts.log : () => {}
  const doFetch = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TRIGGER_TIMEOUT_MS

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await doFetch(opts.url, {
      method: 'POST',
      headers: { 'x-push-worker-secret': opts.secret, 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    })
    log({ level: 'info', event: 'push_delivery_triggered', status: res.status, ok: res.ok })
    return { attempted: true, ok: res.ok, status: res.status }
  } catch (err) {
    // Rede/timeout/qualquer falha: engolida de proposito (best-effort). O
    // cron entrega depois; isto NUNCA vira erro do reminders-worker.
    log({
      level: 'warn',
      event: 'push_delivery_trigger_failed',
      message: String((err as Error)?.message || err),
    })
    return { attempted: true, ok: false, error: String((err as Error)?.message || err) }
  } finally {
    clearTimeout(timer)
  }
}

// Decide SE dispara (so quando ha push novo neste lote) e delega o disparo em
// si. E o ponto de entrada que o handler (index.ts) chama — mantem a decisao
// pura/testavel, sem precisar de um fake de Deno.serve para testar.
export async function maybeTriggerPushDelivery(
  counters: Pick<Counters, 'push_enqueued'>,
  opts: TriggerOptions,
): Promise<TriggerResult> {
  const log: LogFn = typeof opts.log === 'function' ? opts.log : () => {}
  if (!counters.push_enqueued || counters.push_enqueued <= 0) {
    return { attempted: false, ok: false }
  }
  if (!opts.url || !opts.secret) {
    log({ level: 'warn', event: 'push_delivery_trigger_skipped', reason: 'missing_url_or_secret' })
    return { attempted: false, ok: false }
  }
  return triggerPushDelivery(opts)
}
