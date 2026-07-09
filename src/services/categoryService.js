import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico de categorias, escopado por workspace.
// ---------------------------------------------------------------------------

export const categoryService = {
  async list(workspaceId) {
    if (!isSupabaseConfigured) {
      return localStore
        .table('categories')
        .filter((c) => c.workspace_id === workspaceId)
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('name')
    if (error) throw error
    return data
  },

  async create(workspaceId, userId, { name, color }) {
    if (!isSupabaseConfigured) {
      const rows = localStore.table('categories')
      const row = {
        id: uid(),
        workspace_id: workspaceId,
        created_by: userId,
        name,
        color,
        is_default: false,
        created_at: new Date().toISOString(),
      }
      rows.push(row)
      localStore.setTable('categories', rows)
      return row
    }
    const { data, error } = await supabase
      .from('categories')
      .insert({ workspace_id: workspaceId, created_by: userId, name, color, is_default: false })
      .select()
      .single()
    if (error) throw error
    return data
  },

  async remove(id) {
    if (!isSupabaseConfigured) {
      localStore.setTable(
        'categories',
        localStore.table('categories').filter((c) => c.id !== id),
      )
      return
    }
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (error) throw error
  },
}
