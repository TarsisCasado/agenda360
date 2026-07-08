import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico de categorias. Categorias padrao ja vem no seed / schema, mas o
// usuario pode criar novas.
// ---------------------------------------------------------------------------

export const categoryService = {
  async list(userId) {
    if (!isSupabaseConfigured) {
      return localStore
        .table('categories')
        .filter((c) => c.user_id === userId)
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('name')
    if (error) throw error
    return data
  },

  async create(userId, { name, color }) {
    if (!isSupabaseConfigured) {
      const rows = localStore.table('categories')
      const row = {
        id: uid(),
        user_id: userId,
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
      .insert({ user_id: userId, name, color, is_default: false })
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
