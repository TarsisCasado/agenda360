import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { logService } from './logService'
import { uid } from '../lib/utils'
import { LOG_ACTIONS, STATUS } from '../lib/constants'
import { STATUS_META } from '../lib/constants'

// ---------------------------------------------------------------------------
// Servico de atividades (tasks). Centraliza as regras de negocio:
//  - cria/edita/exclui
//  - registra historico em activity_logs
//  - conta reagendamentos
//  - delega para outro responsavel
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

function localList(userId, { start, end } = {}) {
  return localStore
    .table('tasks')
    .filter((t) => t.user_id === userId)
    .filter((t) => (start ? t.date >= start : true))
    .filter((t) => (end ? t.date <= end : true))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      return (a.start_time ?? '99:99').localeCompare(b.start_time ?? '99:99')
    })
}

export const taskService = {
  async list(userId, range = {}) {
    if (!isSupabaseConfigured) return localList(userId, range)

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true, nullsFirst: true })
    if (range.start) query = query.gte('date', range.start)
    if (range.end) query = query.lte('date', range.end)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(userId, payload) {
    const now = new Date().toISOString()
    const task = {
      ...TASK_DEFAULTS,
      ...payload,
      user_id: userId,
      owner_id: userId,
      assignee_id: payload.assignee_id ?? userId,
    }

    let saved
    if (!isSupabaseConfigured) {
      saved = { id: uid(), created_at: now, updated_at: now, ...task }
      const rows = localStore.table('tasks')
      rows.push(saved)
      localStore.setTable('tasks', rows)
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert(task)
        .select()
        .single()
      if (error) throw error
      saved = data
    }

    await logService.record({
      userId,
      taskId: saved.id,
      action: LOG_ACTIONS.CREATE,
      description: `Atividade criada: "${saved.title}"`,
    })
    return saved
  },

  async update(userId, id, patch, { logAction, logDescription } = {}) {
    const updated_at = new Date().toISOString()

    let saved
    if (!isSupabaseConfigured) {
      const rows = localStore.table('tasks')
      const idx = rows.findIndex((t) => t.id === id)
      if (idx === -1) throw new Error('Atividade nao encontrada')
      rows[idx] = { ...rows[idx], ...patch, updated_at }
      localStore.setTable('tasks', rows)
      saved = rows[idx]
    } else {
      // Remove campos imutaveis/gerados para nao sujar o UPDATE no Postgres.
      const { id: _id, created_at: _c, user_id: _u, ...clean } = patch
      const { data, error } = await supabase
        .from('tasks')
        .update({ ...clean, updated_at })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      saved = data
    }

    await logService.record({
      userId,
      taskId: id,
      action: logAction ?? LOG_ACTIONS.UPDATE,
      description: logDescription ?? `Atividade editada: "${saved.title}"`,
    })
    return saved
  },

  async changeStatus(userId, task, newStatus) {
    const isComplete = newStatus === STATUS.DONE
    const isCancel = newStatus === STATUS.CANCELLED
    const action = isComplete
      ? LOG_ACTIONS.COMPLETE
      : isCancel
        ? LOG_ACTIONS.CANCEL
        : LOG_ACTIONS.STATUS_CHANGE
    const from = STATUS_META[task.status]?.label ?? task.status
    const to = STATUS_META[newStatus]?.label ?? newStatus
    return this.update(userId, task.id, { status: newStatus }, {
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
    return this.update(userId, task.id, patch, {
      logAction: LOG_ACTIONS.RESCHEDULE,
      logDescription: `Reagendada de ${task.date} para ${newDate} ("${task.title}")`,
    })
  },

  // Move de dia (usado pelo Kanban ao arrastar). Nao marca como reagendado
  // automaticamente para nao poluir metricas, apenas troca a data.
  async moveToDate(userId, task, newDate) {
    if (task.date === newDate) return task
    return this.update(userId, task.id, { date: newDate }, {
      logAction: LOG_ACTIONS.RESCHEDULE,
      logDescription: `Movida (Kanban) de ${task.date} para ${newDate} ("${task.title}")`,
    })
  },

  async delegate(userId, task, assigneeId, assigneeName) {
    const saved = await this.update(
      userId,
      task.id,
      { assignee_id: assigneeId, status: STATUS.DELEGATED },
      {
        logAction: LOG_ACTIONS.DELEGATE,
        logDescription: `Delegada para ${assigneeName} ("${task.title}")`,
      },
    )

    const delegation = {
      id: uid(),
      task_id: task.id,
      from_user_id: userId,
      to_user_id: assigneeId,
      note: '',
      created_at: new Date().toISOString(),
    }
    if (!isSupabaseConfigured) {
      const rows = localStore.table('delegations')
      rows.push(delegation)
      localStore.setTable('delegations', rows)
    } else {
      await supabase.from('delegations').insert({
        task_id: task.id,
        from_user_id: userId,
        to_user_id: assigneeId,
      })
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
    await logService.record({
      userId,
      taskId: task.id,
      action: LOG_ACTIONS.DELETE,
      description: `Atividade excluida: "${task.title}"`,
    })
  },
}
