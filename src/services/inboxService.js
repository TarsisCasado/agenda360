import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico da Caixa de Entrada Inteligente (dominio PROPRIO, escopado por
// workspace). Milestone A2.1: nota de texto + checklist simples + estados
// (inbox/to_think/archived) + "visto" (controle visual).
//
// IMPORTANTE (arquitetura): a Inbox NAO depende de tasks. O fluxo e sempre
//   Inbox -> (futuro) Task, nunca o contrario. Este service nao importa
//   taskService/logService nem toca em atividades.
//
// Offline-first: em MODO DEMO (sem Supabase) usa o localStore; a API publica e
// identica nos dois modos.
// ---------------------------------------------------------------------------

const TABLE = 'inbox_items'
const CHECKLIST = 'inbox_checklist_items'

const NOTE_TYPES = ['note', 'checklist']
const STATUSES = ['inbox', 'to_think', 'archived']

const normType = (t) => (NOTE_TYPES.includes(t) ? t : 'note')
const normStatus = (s) => (STATUSES.includes(s) ? s : 'inbox')

function localList(workspaceId, { status } = {}) {
  return localStore
    .table(TABLE)
    .filter((n) => n.workspace_id === workspaceId)
    .filter((n) => (status ? n.status === status : true))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)) // mais recentes 1o
}

export const inboxService = {
  // ----- Notas -------------------------------------------------------------
  // status: 'inbox' | 'to_think' | 'archived' | null (todos).
  async list(workspaceId, { status = null } = {}) {
    if (!isSupabaseConfigured) return localList(workspaceId, { status })

    let query = supabase
      .from(TABLE)
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async create(workspaceId, userId, { type = 'note', title = '', content = '' } = {}) {
    const now = new Date().toISOString()
    const note = {
      workspace_id: workspaceId,
      created_by: userId,
      updated_by: userId, // preparado para workspaces compartilhados (sem logica ainda)
      type: normType(type),
      title: String(title ?? ''),
      content: String(content ?? ''),
      status: 'inbox', // captura sempre entra na Caixa; destino e acao posterior
      seen: false,
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

  // Campos permitidos: title, content, type, status, seen.
  async update(note, patch = {}) {
    const updated_at = new Date().toISOString()
    const clean = {}
    if (patch.title !== undefined) clean.title = String(patch.title ?? '')
    if (patch.content !== undefined) clean.content = String(patch.content ?? '')
    if (patch.type !== undefined) clean.type = normType(patch.type)
    if (patch.status !== undefined) clean.status = normStatus(patch.status)
    if (patch.seen !== undefined) clean.seen = Boolean(patch.seen)

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

  // Acoes de estado (atalhos legiveis).
  moveToThink(note) {
    return this.update(note, { status: 'to_think' })
  },
  moveToInbox(note) {
    return this.update(note, { status: 'inbox' })
  },
  archive(note) {
    return this.update(note, { status: 'archived' })
  },
  restore(note) {
    return this.update(note, { status: 'inbox' })
  },
  setSeen(note, value) {
    return this.update(note, { seen: Boolean(value) })
  },

  async remove(note) {
    if (!isSupabaseConfigured) {
      localStore.setTable(TABLE, localStore.table(TABLE).filter((n) => n.id !== note.id))
      // itens de checklist somem junto (equivale ao on delete cascade)
      localStore.setTable(
        CHECKLIST,
        localStore.table(CHECKLIST).filter((i) => i.inbox_item_id !== note.id),
      )
      return
    }
    // No Supabase, o on delete cascade remove os itens de checklist.
    const { error } = await supabase.from(TABLE).delete().eq('id', note.id)
    if (error) throw error
  },

  // ----- Itens de checklist -----------------------------------------------
  async listChecklistItems(workspaceId, inboxItemId = null) {
    if (!isSupabaseConfigured) {
      return localStore
        .table(CHECKLIST)
        .filter((i) => i.workspace_id === workspaceId)
        .filter((i) => (inboxItemId ? i.inbox_item_id === inboxItemId : true))
        .sort((a, b) => a.position - b.position)
    }
    let query = supabase
      .from(CHECKLIST)
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('position', { ascending: true })
    if (inboxItemId) query = query.eq('inbox_item_id', inboxItemId)
    const { data, error } = await query
    if (error) throw error
    return data
  },

  async addChecklistItem(workspaceId, inboxItemId, { text = '', position = 0 } = {}) {
    const item = {
      inbox_item_id: inboxItemId,
      workspace_id: workspaceId,
      position,
      text: String(text ?? ''),
      checked: false,
    }
    if (!isSupabaseConfigured) {
      const saved = { id: uid(), created_at: new Date().toISOString(), ...item }
      localStore.setTable(CHECKLIST, [...localStore.table(CHECKLIST), saved])
      return saved
    }
    const { data, error } = await supabase.from(CHECKLIST).insert(item).select().single()
    if (error) throw error
    return data
  },

  async updateChecklistItem(item, patch = {}) {
    const clean = {}
    if (patch.text !== undefined) clean.text = String(patch.text ?? '')
    if (patch.checked !== undefined) clean.checked = Boolean(patch.checked)
    if (patch.position !== undefined) clean.position = Number(patch.position) || 0

    if (!isSupabaseConfigured) {
      const rows = localStore.table(CHECKLIST)
      const idx = rows.findIndex((i) => i.id === item.id)
      if (idx === -1) throw new Error('Item nao encontrado')
      rows[idx] = { ...rows[idx], ...clean }
      localStore.setTable(CHECKLIST, rows)
      return rows[idx]
    }
    const { data, error } = await supabase
      .from(CHECKLIST)
      .update(clean)
      .eq('id', item.id)
      .select()
      .single()
    if (error) throw error
    return data
  },

  toggleChecklistItem(item, checked) {
    return this.updateChecklistItem(item, { checked })
  },

  async removeChecklistItem(item) {
    if (!isSupabaseConfigured) {
      localStore.setTable(CHECKLIST, localStore.table(CHECKLIST).filter((i) => i.id !== item.id))
      return
    }
    const { error } = await supabase.from(CHECKLIST).delete().eq('id', item.id)
    if (error) throw error
  },

  // Converte o tipo da nota preservando o conteudo:
  //   note -> checklist: cada linha nao-vazia do content vira um item;
  //   checklist -> note: os itens viram linhas do content.
  async setType(workspaceId, note, type) {
    const target = normType(type)
    if (note.type === target) return note

    if (target === 'checklist') {
      const lines = String(note.content ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      let position = 0
      for (const line of lines) {
        await this.addChecklistItem(workspaceId, note.id, { text: line, position: position++ })
      }
      return this.update(note, { type: 'checklist', content: '' })
    }

    // checklist -> note
    const items = await this.listChecklistItems(workspaceId, note.id)
    const content = items.map((i) => i.text).join('\n')
    for (const it of items) {
      await this.removeChecklistItem(it)
    }
    return this.update(note, { type: 'note', content })
  },
}
