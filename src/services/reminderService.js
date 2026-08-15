import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'
import { STATUS } from '../lib/constants'
import { computeRemindAt } from '../lib/reminderTime'

// ---------------------------------------------------------------------------
// reminderService — sincroniza tasks -> reminders (Sprint 2 / Etapa 1B).
//
// NAO envia notificacoes, NAO cria notifications, NAO conhece worker/cron.
// Reconciliacao DETERMINISTICA e IDEMPOTENTE do estado DESEJADO x reminders
// VIVOS (sent=false AND cancelled_at IS NULL), usando a identidade logica
// (type, minutes_before) — a mesma da UNIQUE parcial da 0012 (backstop).
//
// Dependencia unidirecional: taskService -> reminderService (nunca o inverso).
// Dual-mode demo (localStore) / Supabase (RLS por workspace; sem service_role).
// ---------------------------------------------------------------------------

// Status em que a task ainda deve LEMBRAR. Terminais (done/missed/not_needed/
// cancelled) => nenhum reminder vivo. rescheduled/delegated seguem ATIVOS
// (reagendar atualiza remind_at; delegar troca o destinatario).
const ACTIVE_STATUSES = [
  STATUS.TODO,
  STATUS.IN_PROGRESS,
  STATUS.RESCHEDULED,
  STATUS.DELEGATED,
]

// Fallback = MESMO default da coluna profiles.timezone (migration 0012). NAO e
// assuncao do motor: cobre apenas profile sem tz (linha antiga/demo). No
// Supabase a coluna e NOT NULL default, entao praticamente nunca e usado.
const PROFILE_DEFAULT_TIMEZONE = 'America/Sao_Paulo'

// Destinatario: responsavel (assignee) quando existir; senao o criador.
function recipientOf(task) {
  return task?.assignee_id ?? task?.created_by ?? null
}

function isAlive(r) {
  return r.sent === false && (r.cancelled_at === null || r.cancelled_at === undefined)
}

// Identidade logica do lembrete (idempotencia) = canal + antecedencia.
function keyOf(r) {
  return `${r.type}|${r.minutes_before}`
}

const sameInstant = (a, b) => new Date(a).getTime() === new Date(b).getTime()

// Fuso do DESTINATARIO (nunca do usuario atual, quando forem diferentes).
async function getRecipientTimezone(recipientId) {
  if (!recipientId) return PROFILE_DEFAULT_TIMEZONE
  if (!isSupabaseConfigured) {
    const p = localStore.table('profiles').find((x) => x.id === recipientId)
    return p?.timezone || PROFILE_DEFAULT_TIMEZONE
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', recipientId)
    .maybeSingle()
  if (error) throw error
  return data?.timezone || PROFILE_DEFAULT_TIMEZONE
}

// Estado DESEJADO: 0 ou 1 lembrete hoje; array ja preparado para N no futuro
// (1 dia / 1 hora / 15 min) sem redesenhar. Pode lancar se o fuso for invalido.
export function computeDesiredReminders(task, tz, recipientId) {
  if (!task?.alert_enabled) return []
  if (!ACTIVE_STATUSES.includes(task.status)) return []
  if (!task.date || !task.start_time) return []
  const minutes_before = Number.isFinite(Number(task.alert_minutes_before))
    ? Number(task.alert_minutes_before)
    : 0
  const type = task.alert_type || 'in_app'
  const remind_at = computeRemindAt(task.date, task.start_time, minutes_before, tz)
  if (!remind_at) return []
  return [{ type, minutes_before, remind_at, recipient_id: recipientId }]
}

async function listAlive(task) {
  if (!isSupabaseConfigured) {
    return localStore
      .table('reminders')
      .filter((r) => r.task_id === task.id && r.workspace_id === task.workspace_id && isAlive(r))
  }
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('task_id', task.id)
    .eq('workspace_id', task.workspace_id)
    .eq('sent', false)
    .is('cancelled_at', null)
  if (error) throw error
  return data
}

async function insertReminder(task, desired, actorId) {
  const row = {
    workspace_id: task.workspace_id,
    task_id: task.id,
    created_by: actorId, // RLS: created_by = auth.uid(); != recipient_id
    recipient_id: desired.recipient_id,
    type: desired.type,
    minutes_before: desired.minutes_before,
    remind_at: desired.remind_at,
    sent: false,
    cancelled_at: null,
  }
  if (!isSupabaseConfigured) {
    // Idempotencia local (demo nao tem a UNIQUE parcial): nao cria vivo
    // equivalente se ja existir um.
    const rows = localStore.table('reminders')
    const dup = rows.find((r) => r.task_id === task.id && isAlive(r) && keyOf(r) === keyOf(row))
    if (dup) return dup
    const saved = { id: uid(), created_at: new Date().toISOString(), ...row }
    rows.push(saved)
    localStore.setTable('reminders', rows)
    return saved
  }
  const { data, error } = await supabase.from('reminders').insert(row).select().single()
  if (error) {
    // 23505 = violacao da UNIQUE parcial da 0012 (criacao concorrente): ja
    // existe um vivo equivalente -> caso IDEMPOTENTE esperado, nao e erro.
    if (error.code === '23505') return null
    throw error
  }
  return data
}

async function patchReminder(id, patch) {
  if (!isSupabaseConfigured) {
    const rows = localStore.table('reminders')
    const idx = rows.findIndex((r) => r.id === id)
    if (idx !== -1) {
      rows[idx] = { ...rows[idx], ...patch }
      localStore.setTable('reminders', rows)
    }
    return
  }
  const { error } = await supabase.from('reminders').update(patch).eq('id', id)
  if (error) throw error
}

export const reminderService = {
  ACTIVE_STATUSES,
  computeDesiredReminders,

  // Reconcilia os reminders VIVOS de uma task com o estado desejado.
  // Idempotente: rodar 2x converge. Determinístico: mesma entrada -> mesmo estado.
  async syncForTask(task, { actorId } = {}) {
    if (!task?.id || !task?.workspace_id) throw new Error('task invalida para sincronizar lembretes')
    const recipientId = recipientOf(task)

    // So busca o fuso do destinatario quando ha chance de existir um desejado
    // (evita query desnecessaria em tasks sem alerta/data/status ativo).
    let desired = []
    if (task.alert_enabled && ACTIVE_STATUSES.includes(task.status) && task.date && task.start_time) {
      const tz = await getRecipientTimezone(recipientId)
      desired = computeDesiredReminders(task, tz, recipientId)
    }

    const existing = await listAlive(task)
    const now = new Date().toISOString()

    // 1) Vivos que nao sao mais desejados -> CANCELAR (preserva historico).
    for (const e of existing) {
      if (!desired.some((d) => keyOf(d) === keyOf(e))) {
        await patchReminder(e.id, { cancelled_at: now })
      }
    }

    // 2) Desejados -> INSERIR (novo) ou RECONCILIAR (remind_at / recipient).
    for (const d of desired) {
      const e = existing.find((x) => keyOf(x) === keyOf(d))
      if (!e) {
        await insertReminder(task, d, actorId)
      } else {
        const patch = {}
        if (!sameInstant(e.remind_at, d.remind_at)) patch.remind_at = d.remind_at
        if (e.recipient_id !== d.recipient_id) patch.recipient_id = d.recipient_id
        if (Object.keys(patch).length) await patchReminder(e.id, patch)
      }
    }
  },

  // Task excluida: no Supabase o ON DELETE CASCADE de reminders.task_id ja
  // remove tudo (no-op seguro aqui); no demo removemos manualmente (paridade).
  async onTaskDeleted(task) {
    if (!isSupabaseConfigured) {
      localStore.setTable(
        'reminders',
        localStore.table('reminders').filter((r) => r.task_id !== task.id),
      )
    }
  },
}
