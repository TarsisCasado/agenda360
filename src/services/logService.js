import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico de historico (activity_logs).
// Toda alteracao importante em uma atividade registra um log.
// ---------------------------------------------------------------------------

export const logService = {
  async record({ userId, taskId, action, description, meta = {} }) {
    const entry = {
      id: uid(),
      user_id: userId,
      task_id: taskId,
      action,
      description,
      meta,
      created_at: new Date().toISOString(),
    }

    if (!isSupabaseConfigured) {
      const rows = localStore.table('activity_logs')
      rows.unshift(entry)
      localStore.setTable('activity_logs', rows)
      return entry
    }

    const { data, error } = await supabase
      .from('activity_logs')
      .insert({
        user_id: userId,
        task_id: taskId,
        action,
        description,
        meta,
      })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async list(userId, { limit = 50 } = {}) {
    if (!isSupabaseConfigured) {
      return localStore
        .table('activity_logs')
        .filter((l) => l.user_id === userId)
        .slice(0, limit)
    }
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  },
}
