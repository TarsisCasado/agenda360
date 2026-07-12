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
    .filter((t) => (start ? t.date >= start : true))
    .filter((t) => (end ? t.date <= end : true))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
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
    const task = {
      ...TASK_DEFAULTS,
      ...payload,
      workspace_id: workspaceId,
      created_by: userId,
      assignee_id: payload.assignee_id ?? userId,
    }

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

    let saved
    if (!isSupabaseConfigured) {
      const rows = localStore.table('tasks')
      const idx = rows.findIndex((t) => t.id === task.id)
      if (idx === -1) throw new Error('Atividade nao encontrada')
      rows[idx] = { ...rows[idx], ...patch, updated_at }
      localStore.setTable('tasks', rows)
      saved = rows[idx]
    } else {
      // Remove campos imutaveis/gerados do UPDATE.
      const { id: _id, created_at: _c, workspace_id: _w, created_by: _cb, ...clean } = patch
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
