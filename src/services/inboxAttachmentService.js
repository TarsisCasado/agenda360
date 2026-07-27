import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// inboxAttachmentService — persistencia do DESCRITOR de um asset de captura
// (tabela public.inbox_attachments). Dominio Capture.
//
// Responsabilidade unica: gravar/consultar/remover a LINHA do descritor
// retornado pelo captureAssetService. NAO faz upload, NAO gera URL assinada,
// NAO remove binario do Storage, NAO conhece taskService/conversionService.
//
// Tabela imutavel: sem update. Offline-first: API identica demo/Supabase.
// ---------------------------------------------------------------------------

const TABLE = 'inbox_attachments'

export const inboxAttachmentService = {
  // Persiste o descritor. `descriptor` vem do captureAssetService
  // ({ kind, storage_bucket, storage_path, mime, bytes }) acrescido de
  // inbox_item_id e, opcionalmente, width/height.
  async create(workspaceId, userId, descriptor = {}) {
    const {
      inbox_item_id,
      kind,
      storage_bucket,
      storage_path,
      mime,
      bytes,
      width = null,
      height = null,
    } = descriptor
    const row = {
      workspace_id: workspaceId,
      inbox_item_id,
      kind,
      storage_bucket,
      storage_path,
      mime,
      bytes,
      width,
      height,
      created_by: userId,
    }

    if (!isSupabaseConfigured) {
      const saved = { id: uid(), created_at: new Date().toISOString(), ...row }
      localStore.setTable(TABLE, [...localStore.table(TABLE), saved])
      return saved
    }
    const { data, error } = await supabase.from(TABLE).insert(row).select().single()
    if (error) throw error
    return data
  },

  // Lista os assets de um InboxItem (ordem cronologica).
  async listByInboxItem(workspaceId, inboxItemId) {
    if (!isSupabaseConfigured) {
      return localStore
        .table(TABLE)
        .filter((a) => a.workspace_id === workspaceId && a.inbox_item_id === inboxItemId)
        .sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1))
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('inbox_item_id', inboxItemId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data
  },

  // Remove apenas a LINHA do descritor (nao toca no binario do Storage).
  async remove(workspaceId, id) {
    if (!isSupabaseConfigured) {
      localStore.setTable(
        TABLE,
        localStore.table(TABLE).filter((a) => !(a.id === id && a.workspace_id === workspaceId)),
      )
      return
    }
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('workspace_id', workspaceId)
    if (error) throw error
  },

  // Mapa inbox_item_id -> descritores[], para listar em lote (ex.: a UI da
  // Caixa carregar os anexos de varios cards de uma vez).
  async mapByInboxItems(workspaceId, inboxItemIds = []) {
    if (!inboxItemIds || inboxItemIds.length === 0) return {}
    let rows
    if (!isSupabaseConfigured) {
      const wanted = new Set(inboxItemIds)
      rows = localStore
        .table(TABLE)
        .filter((a) => a.workspace_id === workspaceId && wanted.has(a.inbox_item_id))
    } else {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('workspace_id', workspaceId)
        .in('inbox_item_id', inboxItemIds)
      if (error) throw error
      rows = data
    }
    const map = {}
    for (const a of rows) (map[a.inbox_item_id] ||= []).push(a)
    return map
  },
}
