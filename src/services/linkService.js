import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Central de links, escopada por workspace.
// ---------------------------------------------------------------------------

export const linkService = {
  async list(workspaceId) {
    if (!isSupabaseConfigured) {
      return localStore
        .table('links')
        .filter((l) => l.workspace_id === workspaceId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    }
    const { data, error } = await supabase
      .from('links')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(workspaceId, userId, payload) {
    const row = {
      workspace_id: workspaceId,
      created_by: userId,
      url: payload.url,
      title: payload.title,
      note: payload.note ?? '',
      desired_action: payload.desired_action,
      task_id: payload.task_id ?? null,
    }
    if (!isSupabaseConfigured) {
      const saved = { id: uid(), created_at: new Date().toISOString(), ...row }
      const rows = localStore.table('links')
      rows.unshift(saved)
      localStore.setTable('links', rows)
      return saved
    }
    const { data, error } = await supabase.from('links').insert(row).select().single()
    if (error) throw error
    return data
  },

  async attachTask(id, taskId) {
    if (!isSupabaseConfigured) {
      const rows = localStore.table('links')
      const idx = rows.findIndex((l) => l.id === id)
      if (idx >= 0) {
        rows[idx].task_id = taskId
        localStore.setTable('links', rows)
      }
      return
    }
    await supabase.from('links').update({ task_id: taskId }).eq('id', id)
  },

  async remove(id) {
    if (!isSupabaseConfigured) {
      localStore.setTable(
        'links',
        localStore.table('links').filter((l) => l.id !== id),
      )
      return
    }
    const { error } = await supabase.from('links').delete().eq('id', id)
    if (error) throw error
  },
}
