import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from './localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Servico do VINCULO Caixa de Entrada <-> Atividade (tabela inbox_task_links).
//
// Papel: registrar/consultar a proveniencia de uma Task criada a partir de um
// InboxItem. NAO cria Task nem InboxItem (nao importa taskService/inboxService)
// — apenas persiste/consulta o vinculo. A orquestracao (criar Task + criar
// vinculo) vive em conversionService, mantendo baixo acoplamento.
//
// Cardinalidade: 1 InboxItem -> N Tasks (futuro); 1 Task -> 1 InboxItem.
// Offline-first: API identica em modo demo (localStore) e Supabase.
// ---------------------------------------------------------------------------

const TABLE = 'inbox_task_links'

export const inboxTaskLinkService = {
  async create(workspaceId, userId, { inbox_item_id, task_id }) {
    const link = {
      workspace_id: workspaceId,
      inbox_item_id,
      task_id,
      created_by: userId,
    }
    if (!isSupabaseConfigured) {
      const saved = { id: uid(), created_at: new Date().toISOString(), ...link }
      localStore.setTable(TABLE, [...localStore.table(TABLE), saved])
      return saved
    }
    const { data, error } = await supabase.from(TABLE).insert(link).select().single()
    if (error) throw error
    return data
  },

  // Vinculo de uma Task (0 ou 1). Usado para exibir "Origem: Inbox" na Task.
  async getByTask(workspaceId, taskId) {
    if (!isSupabaseConfigured) {
      return (
        localStore
          .table(TABLE)
          .find((l) => l.workspace_id === workspaceId && l.task_id === taskId) || null
      )
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('task_id', taskId)
      .maybeSingle()
    if (error) throw error
    return data || null
  },

  // Mapa inbox_item_id -> vinculo, para exibir o selo "Convertido" na Caixa.
  // Em modo demo NAO ha ON DELETE CASCADE: filtra vinculos cuja Task ja nao
  // existe, para paridade com o comportamento do Supabase (cascade).
  async convertedMap(workspaceId) {
    let links
    if (!isSupabaseConfigured) {
      const taskIds = new Set(
        localStore.table('tasks').filter((t) => t.workspace_id === workspaceId).map((t) => t.id),
      )
      links = localStore
        .table(TABLE)
        .filter((l) => l.workspace_id === workspaceId && taskIds.has(l.task_id))
    } else {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('workspace_id', workspaceId)
      if (error) throw error
      links = data
    }
    const map = {}
    // Se houver mais de uma Task por InboxItem (futuro), mantem a mais recente.
    for (const l of links) {
      const prev = map[l.inbox_item_id]
      if (!prev || (l.created_at ?? '') > (prev.created_at ?? '')) map[l.inbox_item_id] = l
    }
    return map
  },
}
