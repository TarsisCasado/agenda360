import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico de historico (activity_logs), escopado por workspace.
// ---------------------------------------------------------------------------

export const logService = {
  async record({ workspaceId, actorId, taskId, action, description, meta = {} }) {
    if (!isSupabaseConfigured) {
      const entry = {
        id: uid(),
        workspace_id: workspaceId,
        actor_id: actorId,
        task_id: taskId,
        action,
        description,
        meta,
        created_at: new Date().toISOString(),
      }
      const rows = localStore.table('activity_logs')
      rows.unshift(entry)
      localStore.setTable('activity_logs', rows)
      return entry
    }

    const { data, error } = await supabase
      .from('activity_logs')
      .insert({
        workspace_id: workspaceId,
        actor_id: actorId,
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

  async list(workspaceId, { limit = 50 } = {}) {
    if (!isSupabaseConfigured) {
      return localStore
        .table('activity_logs')
        .filter((l) => l.workspace_id === workspaceId)
        .slice(0, limit)
    }
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return data
  },
}
