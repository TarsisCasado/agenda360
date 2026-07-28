import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico da Caixa de Entrada Inteligente (dominio PROPRIO, escopado por
// workspace). Milestone A2.2: + origem, timeline (inbox_events, append-only) e
// estado 'processed' preparado. A2.1: nota/checklist + estados + "visto".
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
const EVENTS = 'inbox_events'

const NOTE_TYPES = ['note', 'checklist']
// A2.2: 'processed' preparado no modelo (status e text livre; sem transicao de
// UI nesta etapa). 'convertido/delegado/em atividade' ficam para milestones
// futuros.
const STATUSES = ['inbox', 'to_think', 'archived', 'processed']
// Canais de captura ja PERSISTIVEIS. Cada valor novo entra quando seu adapter
// existir (pdf/audio/email/... ficam de fora ate la). Entrada fora da lista cai
// para 'manual' (comportamento legado, menor risco) — os fluxos internos novos
// (captureService) so enviam canais validos, entao nunca dependem dessa coercao.
const ORIGINS = ['manual', 'photo']

// UUID (qualquer versao). Usado para validar `id` explicito ANTES de persistir.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const normType = (t) => (NOTE_TYPES.includes(t) ? t : 'note')
const normStatus = (s) => (STATUSES.includes(s) ? s : 'inbox')
const normOrigin = (o) => (ORIGINS.includes(o) ? o : 'manual')

// Registro de evento da timeline — "best-effort": uma falha ao gravar o
// historico NUNCA derruba a operacao principal (mover/editar/etc.).
async function recordEvent(workspaceId, inboxItemId, action, actorId = null, meta = {}) {
  const entry = {
    workspace_id: workspaceId,
    inbox_item_id: inboxItemId,
    actor_id: actorId ?? null,
    action,
    meta,
  }
  try {
    if (!isSupabaseConfigured) {
      localStore.setTable(EVENTS, [
        ...localStore.table(EVENTS),
        { id: uid(), created_at: new Date().toISOString(), ...entry },
      ])
      return
    }
    const { error } = await supabase.from(EVENTS).insert(entry)
    if (error) throw error
  } catch (err) {
    console.warn('[inboxService] falha ao registrar evento (ignorada):', err?.message || err)
  }
}

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

  // `id` opcional: permite ao chamador PRE-GERAR o id da captura (ex.: o
  // captureService precisa do id antes do upload para compor o path do asset).
  // Aditivo e retrocompativel — sem id, o comportamento e o de sempre.
  async create(workspaceId, userId, { id, type = 'note', title = '', content = '', origin = 'manual' } = {}) {
    // `id` explicito e opcional e SO para fluxos internos; se vier, precisa ser
    // UUID valido (nunca deixa um id malformado chegar ao Supabase).
    if (id !== undefined && !UUID_RE.test(String(id))) {
      throw new Error('id de captura invalido (esperado UUID).')
    }
    const now = new Date().toISOString()
    const note = {
      ...(id ? { id } : {}),
      workspace_id: workspaceId,
      created_by: userId,
      updated_by: userId, // preparado para workspaces compartilhados (sem logica ainda)
      type: normType(type),
      title: String(title ?? ''),
      content: String(content ?? ''),
      status: 'inbox', // captura sempre entra na Caixa; destino e acao posterior
      seen: false,
      origin: normOrigin(origin),
    }

    let saved
    if (!isSupabaseConfigured) {
      saved = { id: note.id ?? uid(), created_at: now, updated_at: now, ...note }
      localStore.setTable(TABLE, [...localStore.table(TABLE), saved])
    } else {
      const { data, error } = await supabase.from(TABLE).insert(note).select().single()
      if (error) throw error
      saved = data
    }
    await recordEvent(workspaceId, saved.id, 'created', userId)
    return saved
  },

  // Timeline (historico) de uma nota — ordem cronologica (mais recente 1o).
  async listEvents(workspaceId, inboxItemId) {
    if (!isSupabaseConfigured) {
      return localStore
        .table(EVENTS)
        .filter((e) => e.workspace_id === workspaceId && e.inbox_item_id === inboxItemId)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    }
    const { data, error } = await supabase
      .from(EVENTS)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('inbox_item_id', inboxItemId)
      .order('created_at', { ascending: false })
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

  // Edicao de conteudo (title/content) — registra 'edited' na timeline.
  async editContent(note, patch = {}, actorId = null) {
    const saved = await this.update(note, patch)
    await recordEvent(note.workspace_id, note.id, 'edited', actorId)
    return saved
  },

  // Acoes de estado (atalhos legiveis) — cada uma registra seu evento.
  // Toda movimentacao e reversivel; o historico nunca e apagado.
  async moveToThink(note, actorId = null) {
    const saved = await this.update(note, { status: 'to_think' })
    await recordEvent(note.workspace_id, note.id, 'moved_to_think', actorId)
    return saved
  },
  async moveToInbox(note, actorId = null) {
    const saved = await this.update(note, { status: 'inbox' })
    await recordEvent(note.workspace_id, note.id, 'moved_to_inbox', actorId)
    return saved
  },
  async archive(note, actorId = null) {
    const saved = await this.update(note, { status: 'archived' })
    await recordEvent(note.workspace_id, note.id, 'archived', actorId)
    return saved
  },
  async restore(note, actorId = null) {
    const saved = await this.update(note, { status: 'inbox' })
    await recordEvent(note.workspace_id, note.id, 'restored', actorId)
    return saved
  },
  async setSeen(note, value, actorId = null) {
    const saved = await this.update(note, { seen: Boolean(value) })
    await recordEvent(note.workspace_id, note.id, value ? 'seen' : 'unseen', actorId)
    return saved
  },

  async remove(note) {
    if (!isSupabaseConfigured) {
      localStore.setTable(TABLE, localStore.table(TABLE).filter((n) => n.id !== note.id))
      // itens de checklist somem junto (equivale ao on delete cascade)
      localStore.setTable(
        CHECKLIST,
        localStore.table(CHECKLIST).filter((i) => i.inbox_item_id !== note.id),
      )
      // descritores de anexo tambem (paridade com a FK on delete cascade da
      // 0009). O binario no Storage NAO e responsabilidade daqui.
      localStore.setTable(
        'inbox_attachments',
        localStore.table('inbox_attachments').filter((a) => a.inbox_item_id !== note.id),
      )
      return
    }
    // No Supabase, o on delete cascade remove checklist e anexos (0005/0009).
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
  async setType(workspaceId, note, type, actorId = null) {
    const target = normType(type)
    if (note.type === target) return note

    let saved
    if (target === 'checklist') {
      const lines = String(note.content ?? '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      let position = 0
      for (const line of lines) {
        await this.addChecklistItem(workspaceId, note.id, { text: line, position: position++ })
      }
      saved = await this.update(note, { type: 'checklist', content: '' })
    } else {
      // checklist -> note
      const items = await this.listChecklistItems(workspaceId, note.id)
      const content = items.map((i) => i.text).join('\n')
      for (const it of items) {
        await this.removeChecklistItem(it)
      }
      saved = await this.update(note, { type: 'note', content })
    }
    await recordEvent(note.workspace_id, note.id, 'edited', actorId)
    return saved
  },
}
