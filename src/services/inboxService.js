import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico da Caixa de Entrada Inteligente (dominio PROPRIO, escopado por
// workspace). Milestone A1: apenas NOTA DE TEXTO SIMPLES (campos minimos).
//
// IMPORTANTE (arquitetura): a Inbox NAO depende de tasks. O fluxo e sempre
//   Inbox -> (futuro) Task, nunca o contrario. Por isso este service nao
//   importa taskService/logService nem toca em atividades.
//
// Offline-first: em MODO DEMO (sem Supabase) usa o localStore; a API publica e
// identica nos dois modos, seguindo o padrao dos demais services.
// ---------------------------------------------------------------------------

const TABLE = 'inbox_items'

function localList(workspaceId, { archived = false } = {}) {
  return localStore
    .table(TABLE)
    .filter((n) => n.workspace_id === workspaceId)
    .filter((n) => Boolean(n.archived) === Boolean(archived))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)) // mais recentes 1o
}

export const inboxService = {
  // Lista notas do workspace. Por padrao, apenas as ativas (nao arquivadas).
  async list(workspaceId, { archived = false } = {}) {
    if (!isSupabaseConfigured) return localList(workspaceId, { archived })

    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('archived', archived)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data
  },

  async create(workspaceId, userId, { content = '' } = {}) {
    const now = new Date().toISOString()
    const note = {
      workspace_id: workspaceId,
      created_by: userId,
      content: String(content ?? ''),
      archived: false,
    }

    if (!isSupabaseConfigured) {
      const saved = { id: uid(), created_at: now, updated_at: now, ...note }
      localStore.setTable(TABLE, [...localStore.table(TABLE), saved])
      return saved
    }

    const { data, error } = await supabase.from(TABLE).insert(note).select().single()
    if (error) throw error
    return data
  },

  // Atualiza campos permitidos (A1: apenas content e archived).
  async update(note, patch = {}) {
    const updated_at = new Date().toISOString()
    const clean = {}
    if (patch.content !== undefined) clean.content = String(patch.content ?? '')
    if (patch.archived !== undefined) clean.archived = Boolean(patch.archived)

    if (!isSupabaseConfigured) {
      const rows = localStore.table(TABLE)
      const idx = rows.findIndex((n) => n.id === note.id)
      if (idx === -1) throw new Error('Nota nao encontrada')
      rows[idx] = { ...rows[idx], ...clean, updated_at }
      localStore.setTable(TABLE, rows)
      return rows[idx]
    }

    const { data, error } = await supabase
      .from(TABLE)
      .update({ ...clean, updated_at })
      .eq('id', note.id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  archive(note) {
    return this.update(note, { archived: true })
  },

  unarchive(note) {
    return this.update(note, { archived: false })
  },

  async remove(note) {
    if (!isSupabaseConfigured) {
      localStore.setTable(
        TABLE,
        localStore.table(TABLE).filter((n) => n.id !== note.id),
      )
      return
    }
    const { error } = await supabase.from(TABLE).delete().eq('id', note.id)
    if (error) throw error
  },
}
