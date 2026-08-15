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
}

// `db` e duck-typed: apenas o subconjunto de supabase-js que usamos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enqueueDueReminders(db: any, opts: EnqueueOptions = {}): Promise<Counters> {
  const batchSize = opts.batchSize && opts.batchSize > 0 ? opts.batchSize : DEFAULT_BATCH_SIZE
  const nowIso = (opts.now ? new Date(opts.now) : new Date()).toISOString()
  const log: LogFn = typeof opts.log === 'function' ? opts.log : () => {}
  const counters: Counters = { found: 0, enqueued: 0, already_exists: 0, skipped: 0, errors: 0 }

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
