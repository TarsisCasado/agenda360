import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { logService } from './logService'
import { uid } from '../lib/utils'
import { LOG_ACTIONS, STATUS, STATUS_META } from '../lib/constants'

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
  alert_type: 'in_app',
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

// Invariante do T-Core: uma atividade SEM data nao pode manter horarios
// orfaos. Normaliza qualquer objeto de task/patch que defina `date`.
function normalizeUndated(obj) {
  if (!obj || !('date' in obj)) return obj
  if (obj.date) return obj // com data: horarios permanecem como vieram
  return { ...obj, date: null, start_time: null, end_time: null }
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
    const task = normalizeUndated({
      ...TASK_DEFAULTS,
      ...payload,
      origin,
      workspace_id: workspaceId,
      created_by: userId,
      assignee_id: payload.assignee_id ?? userId,
    })

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
    return saved
  },

  // Atualiza uma task existente. O escopo (workspace) vem do proprio registro.
  async update(userId, task, patch, { logAction, logDescription } = {}) {
    const updated_at = new Date().toISOString()
    const workspaceId = task.workspace_id

    // Edicao comum NUNCA altera a origem: descarta origin do patch. (Fluxos
    // internos que precisem mudar origem devem faze-lo por caminho proprio.)
    // Se o patch mexe na data, aplica a invariante sem-data -> sem-horarios.
    const { origin: _origin, ...rest } = patch
    const safePatch = normalizeUndated(rest)

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
