import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { logService } from './logService'
import { reminderService } from './reminderService'
import { uid } from '../lib/utils'
import { LOG_ACTIONS, STATUS, STATUS_META } from '../lib/constants'
import { CANAL_PADRAO, validarAlerta, mudancaMexeNoAlerta } from '../lib/alertRules'

// Campos da task que afetam os reminders. So sincronizamos quando o patch toca
// um deles (edicao de titulo/descricao/etc. nao dispara reconciliacao).
const REMINDER_KEYS = new Set([
  'alert_enabled',
  'alert_type',
  'alert_minutes_before',
  'date',
  'start_time',
  'status',
  'assignee_id',
])

// Erro de REGRA (nao de infraestrutura): a interface sabe converte-lo em uma
// pergunta ("Que horas?") em vez de um "erro ao salvar" generico.
export class AlertaInvalidoError extends Error {
  constructor({ mensagem, motivo }) {
    super(mensagem)
    this.name = 'AlertaInvalidoError'
    this.code = 'alerta_invalido'
    this.motivo = motivo
  }
}

// Sincroniza reminders SEM derrubar a operacao principal (task ja persistida).
// A falha e observada (console.warn) e sinalizada ao chamador, que exibe o
// aviso "Atividade salva, mas o lembrete nao pode ser agendado." A task NUNCA
// e revertida por causa de um lembrete.
async function syncRemindersSafe(task, actorId) {
  try {
    await reminderService.syncForTask(task, { actorId })
    return { ok: true }
  } catch (err) {
    console.warn('[taskService] sincronizacao de lembrete falhou (task salva):', err?.message || err)
    return { ok: false }
  }
}

// ---------------------------------------------------------------------------
// Servico de atividades (tasks), escopado por workspace.
//
// DELEGACAO (decisao de arquitetura): estado atual denormalizado na propria
// task (assignee_id, delegated_by, delegated_at) para leitura/filtro rapidos,
// e a tabela `delegations` guarda o HISTORICO imutavel de cada delegacao.
// ---------------------------------------------------------------------------

const TASK_DEFAULTS = {
  description: '',
  date: null,
  start_time: null,
  end_time: null,
  category_id: null,
  priority: 'medium',
  status: STATUS.TODO,
  link: '',
  notes: '',
  alert_enabled: false,
  // CP5.8.1 — o padrao passa a ser PUSH. Era `in_app`, e o worker de entrega
  // so leva `channel='push'`: o alerta de uma atividade criada normalmente
  // nunca chegava a lugar nenhum. Ver lib/alertRules.js.
  alert_type: CANAL_PADRAO,
  alert_minutes_before: 15,
  alert_sent: false,
  reschedule_count: 0,
  // Proveniencia da atividade. Criacao manual = 'manual'. Origens diferentes
  // so podem vir de fluxos internos confiaveis (nunca de formularios comuns).
  origin: 'manual',
}

// Origens que a APLICACAO reconhece (o banco aceita text livre; a lista de
// confianca vive aqui). Formularios comuns NUNCA escolhem origin: apenas
// fluxos internos confiaveis passam um valor desta lista.
export const TASK_ORIGINS = [
  'manual',
  'inbox',
  'assistant',
  'photo',
  'pdf',
  'audio',
  'google_calendar',
  'email',
  'integration',
]

// Postgres nao aceita string vazia em colunas date/time: "" -> erro
// "invalid input syntax for type date/time". undefined/ausente permanece
// ausente (nao forca valor em patches parciais).
function emptyToNull(value) {
  return value === '' ? null : value
}

// Ponto CENTRAL de normalizacao antes de persistir (create e update). Garante,
// independentemente do componente/fluxo que chamou:
//   - date/start_time/end_time "" -> null (nunca envia "" ao banco);
//   - invariante do T-Core: sem data -> sem horarios orfaos (start/end null).
// Aplica-se apenas as chaves presentes no objeto (nao "inventa" campos num
// patch parcial que nao toca em data/horarios).
function normalizeTaskFields(obj) {
  if (!obj) return obj
  const out = { ...obj }
  if ('date' in out) out.date = emptyToNull(out.date)
  if ('start_time' in out) out.start_time = emptyToNull(out.start_time)
  if ('end_time' in out) out.end_time = emptyToNull(out.end_time)
  // Se o objeto define a data e ela ficou vazia (null), zera horarios.
  if ('date' in out && !out.date) {
    out.date = null
    out.start_time = null
    out.end_time = null
  }
  return out
}

// Registro de historico "best-effort": uma falha ao gravar o log NUNCA pode
// impedir/derrubar a operacao principal (criar/editar/mover/excluir tarefa).
async function safeLog(entry) {
  try {
    return await logService.record(entry)
  } catch (err) {
    console.warn('[taskService] falha ao registrar log (ignorada):', err?.message || err)
    return null
  }
}

function localList(workspaceId, { start, end } = {}) {
  return localStore
    .table('tasks')
    .filter((t) => t.workspace_id === workspaceId)
    // date NULL (sem data) fica de fora de qualquer intervalo com start/end.
    .filter((t) => (start ? t.date != null && t.date >= start : true))
    .filter((t) => (end ? t.date != null && t.date <= end : true))
    .sort((a, b) => {
      // Sem data vai para o fim (ordem estavel), com data em ordem crescente.
      const da = a.date ?? '9999-99-99'
      const db = b.date ?? '9999-99-99'
      if (da !== db) return da < db ? -1 : 1
      return (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
    })
}

export const taskService = {
  async list(workspaceId, range = {}) {
    if (!isSupabaseConfigured) return localList(workspaceId, range)

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: true })
    if (range.start) query = query.gte('date', range.start)
    if (range.end) query = query.lte('date', range.end)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  // Lista SOMENTE as atividades sem data (date NULL) do workspace. Aditivo:
  // nenhum fluxo por-periodo usa isto; serve a "Visao Sem data". Ordena por
  // criacao decrescente (mais recentes primeiro).
  async listUndated(workspaceId) {
    if (!isSupabaseConfigured) {
      return localStore
        .table('tasks')
        .filter((t) => t.workspace_id === workspaceId && t.date == null)
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    }
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('date', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  // Busca uma tarefa por id DENTRO do workspace informado (read-only).
  // Retorna null se nao existir no workspace (tambem cobre tentativa de
  // acessar tarefa de outro workspace). Aditivo — nao muda fluxos existentes.
  async getById(workspaceId, id) {
    if (!isSupabaseConfigured) {
      return (
        localStore
          .table('tasks')
          .find((t) => t.id === id && t.workspace_id === workspaceId) || null
      )
    }
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error) throw error
    return data || null
  },

  async create(workspaceId, userId, payload) {
    const now = new Date().toISOString()
    // origin so pode assumir um valor reconhecido; qualquer coisa fora da
    // lista de confianca (inclusive input de formulario comum) vira 'manual'.
    const origin = TASK_ORIGINS.includes(payload?.origin) ? payload.origin : 'manual'
    const task = normalizeTaskFields({
      ...TASK_DEFAULTS,
      ...payload,
      origin,
      workspace_id: workspaceId,
      created_by: userId,
      assignee_id: payload.assignee_id ?? userId,
    })

    // A REGRA DO ALERTA vale para TODA porta de entrada — formulario, captura,
    // Copiloto, conversao da Caixa. Falhar aqui, alto e claro, e melhor que
    // gravar um alerta que nunca tocaria (ver lib/alertRules.js).
    const alerta = validarAlerta(task)
    if (!alerta.ok) throw new AlertaInvalidoError(alerta)

    let saved
    if (!isSupabaseConfigured) {
      saved = { id: uid(), created_at: now, updated_at: now, ...task }
      const rows = localStore.table('tasks')
      rows.push(saved)
      localStore.setTable('tasks', rows)
    } else {
      const { data, error } = await supabase.from('tasks').insert(task).select().single()
      if (error) throw error
      saved = data
    }

    await safeLog({
      workspaceId,
      actorId: userId,
      taskId: saved.id,
      action: LOG_ACTIONS.CREATE,
      description: `Atividade criada: "${saved.title}"`,
    })

    // Sincroniza os reminders da nova task (best-effort, falha surfavel).
    const sync = await syncRemindersSafe(saved, userId)
    return sync.ok ? saved : { ...saved, reminder_sync_failed: true }
  },

  // Atualiza uma task existente. O escopo (workspace) vem do proprio registro.
  async update(userId, task, patch, { logAction, logDescription } = {}) {
    const updated_at = new Date().toISOString()
    const workspaceId = task.workspace_id

    // Edicao comum NUNCA altera a origem: descarta origin do patch. (Fluxos
    // internos que precisem mudar origem devem faze-lo por caminho proprio.)
    // Se o patch mexe na data, aplica a invariante sem-data -> sem-horarios.
    const { origin: _origin, ...rest } = patch
    const safePatch = normalizeTaskFields(rest)

    // So validamos quando a mudanca MEXE no alerta (liga o aviso, ou tira a
    // hora com o aviso ligado). Uma atividade antiga que ja carrega um alerta
    // sem horario nao pode travar a edicao do titulo dela: a regra vale a
    // partir de agora, nao retroativamente.
    if (mudancaMexeNoAlerta(safePatch)) {
      const alerta = validarAlerta({ ...task, ...safePatch })
      if (!alerta.ok) throw new AlertaInvalidoError(alerta)
    }

    let saved
    if (!isSupabaseConfigured) {
      const rows = localStore.table('tasks')
      const idx = rows.findIndex((t) => t.id === task.id)
      if (idx === -1) throw new Error('Atividade nao encontrada')
      rows[idx] = { ...rows[idx], ...safePatch, updated_at }
      localStore.setTable('tasks', rows)
      saved = rows[idx]
    } else {
      // Remove campos imutaveis/gerados do UPDATE.
      const { id: _id, created_at: _c, workspace_id: _w, created_by: _cb, ...clean } = safePatch
      const { data, error } = await supabase
        .from('tasks')
        .update({ ...clean, updated_at })
        .eq('id', task.id)
        .select()
        .single()
      if (error) throw error
      saved = data
    }

    await safeLog({
      workspaceId,
      actorId: userId,
      taskId: task.id,
      action: logAction ?? LOG_ACTIONS.UPDATE,
      description: logDescription ?? `Atividade editada: "${saved.title}"`,
    })

    // Reconcilia reminders APENAS quando o patch toca campos que os afetam
    // (alerta/data/hora/status/assignee). Cobre reagendar, concluir/cancelar,
    // delegar, etc., que passam por este mesmo funil.
    const touchesReminder = Object.keys(patch || {}).some((k) => REMINDER_KEYS.has(k))
    if (touchesReminder) {
      const sync = await syncRemindersSafe(saved, userId)
      if (!sync.ok) return { ...saved, reminder_sync_failed: true }
    }
    return saved
  },

  async changeStatus(userId, task, newStatus) {
    const action =
      newStatus === STATUS.DONE
        ? LOG_ACTIONS.COMPLETE
        : newStatus === STATUS.CANCELLED
          ? LOG_ACTIONS.CANCEL
          : LOG_ACTIONS.STATUS_CHANGE
    const from = STATUS_META[task.status]?.label ?? task.status
    const to = STATUS_META[newStatus]?.label ?? newStatus
    return this.update(userId, task, { status: newStatus }, {
      logAction: action,
      logDescription: `Status: ${from} -> ${to} ("${task.title}")`,
    })
  },

  async reschedule(userId, task, newDate) {
    const patch = {
      date: newDate,
      status: STATUS.RESCHEDULED,
      reschedule_count: (task.reschedule_count ?? 0) + 1,
    }
    return this.update(userId, task, patch, {
      logAction: LOG_ACTIONS.RESCHEDULE,
      logDescription: `Reagendada de ${task.date} para ${newDate} ("${task.title}")`,
    })
  },

  // Move de dia (Kanban). Nao marca como reagendado para nao poluir metricas.
  async moveToDate(userId, task, newDate) {
    if (task.date === newDate) return task
    return this.update(userId, task, { date: newDate }, {
      logAction: LOG_ACTIONS.RESCHEDULE,
      logDescription: `Movida (Kanban) de ${task.date} para ${newDate} ("${task.title}")`,
    })
  },

  async delegate(userId, task, assigneeId, assigneeName) {
    const now = new Date().toISOString()
    const saved = await this.update(
      userId,
      task,
      {
        assignee_id: assigneeId,
        delegated_by: userId,
        delegated_at: now,
        status: STATUS.DELEGATED,
      },
      {
        logAction: LOG_ACTIONS.DELEGATE,
        logDescription: `Delegada para ${assigneeName} ("${task.title}")`,
      },
    )

    // Historico imutavel de delegacao
    const delegation = {
      workspace_id: task.workspace_id,
      task_id: task.id,
      from_user_id: userId,
      to_user_id: assigneeId,
      note: assigneeName ? `Delegada para ${assigneeName}` : '',
    }
    if (!isSupabaseConfigured) {
      const rows = localStore.table('delegations')
      rows.push({ id: uid(), created_at: now, ...delegation })
      localStore.setTable('delegations', rows)
    } else {
      await supabase.from('delegations').insert(delegation)
    }
    return saved
  },

  async remove(userId, task) {
    if (!isSupabaseConfigured) {
      localStore.setTable(
        'tasks',
        localStore.table('tasks').filter((t) => t.id !== task.id),
      )
    } else {
      const { error } = await supabase.from('tasks').delete().eq('id', task.id)
      if (error) throw error
    }
    // Reminders: Supabase remove via ON DELETE CASCADE; demo remove manualmente.
    try {
      await reminderService.onTaskDeleted(task)
    } catch (err) {
      console.warn('[taskService] limpeza de lembretes na exclusao falhou:', err?.message || err)
    }

    // task_id fica null: o registro ja foi removido (evita violar a FK).
    await safeLog({
      workspaceId: task.workspace_id,
      actorId: userId,
      taskId: null,
      action: LOG_ACTIONS.DELETE,
      description: `Atividade excluida: "${task.title}"`,
      meta: { deleted_task_id: task.id },
    })
  },
}
