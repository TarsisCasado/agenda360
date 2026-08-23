import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from '../services/localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Conversation Memory — uso real de ai_conversations / ai_messages.
// Persiste turnos, recupera historico recente (limitado) e mantem vinculo com
// o workspace. Nao guarda dados sensiveis desnecessarios (apenas role+content).
// ---------------------------------------------------------------------------
const MAX_HISTORY = 12 // limite de mensagens recuperadas/enviadas ao provider

export function createConversationMemory() {
  async function startConversation(workspaceId, userId, title = 'Assistente') {
    if (!isSupabaseConfigured) {
      const row = {
        id: uid(),
        workspace_id: workspaceId,
        user_id: userId,
        title,
        context: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      localStore.setTable('ai_conversations', [...localStore.table('ai_conversations'), row])
      return row.id
    }
    const { data, error } = await supabase
      .from('ai_conversations')
      .insert({ workspace_id: workspaceId, user_id: userId, title })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  // role: 'user' | 'assistant' | 'system' | 'tool'
  async function append(conversationId, role, content, metadata = {}) {
    if (!conversationId) return null
    const safeContent = String(content ?? '').slice(0, 4000)
    if (!isSupabaseConfigured) {
      const row = {
        id: uid(),
        conversation_id: conversationId,
        role,
        content: safeContent,
        tokens: null,
        metadata,
        created_at: new Date().toISOString(),
      }
      localStore.setTable('ai_messages', [...localStore.table('ai_messages'), row])
      return row
    }
    const { data, error } = await supabase
      .from('ai_messages')
      .insert({ conversation_id: conversationId, role, content: safeContent, metadata })
      .select()
      .single()
    if (error) throw error
    return data
  }

  // -------------------------------------------------------------------------
  // CONTEXTO DA CONVERSA — usa a coluna ai_conversations.context (jsonb) que JA
  // existe no schema. E aqui que mora a INTENCAO PENDENTE do slot-filling.
  // Nenhuma migration foi necessaria.
  // -------------------------------------------------------------------------
  async function getContext(conversationId) {
    if (!conversationId) return {}
    if (!isSupabaseConfigured) {
      const row = localStore.table('ai_conversations').find((c) => c.id === conversationId)
      return row?.context || {}
    }
    const { data, error } = await supabase
      .from('ai_conversations')
      .select('context')
      .eq('id', conversationId)
      .single()
    if (error) return {}
    return data?.context || {}
  }

  async function setContext(conversationId, patch = {}) {
    if (!conversationId) return {}
    const current = await getContext(conversationId)
    const next = { ...current, ...patch }
    if (!isSupabaseConfigured) {
      const rows = localStore.table('ai_conversations').map((c) =>
        c.id === conversationId ? { ...c, context: next, updated_at: new Date().toISOString() } : c,
      )
      localStore.setTable('ai_conversations', rows)
      return next
    }
    const { error } = await supabase
      .from('ai_conversations')
      .update({ context: next, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
    if (error) throw error
    return next
  }

  // Intencao pendente = { intent, data, asked[], awaiting, at }.
  async function getPending(conversationId) {
    const context = await getContext(conversationId)
    return context.pending || null
  }

  async function setPending(conversationId, pending) {
    return setContext(conversationId, { pending: pending || null })
  }

  async function clearPending(conversationId) {
    return setContext(conversationId, { pending: null })
  }

  async function history(conversationId, limit = MAX_HISTORY) {
    if (!conversationId) return []
    if (!isSupabaseConfigured) {
      return localStore
        .table('ai_messages')
        .filter((m) => m.conversation_id === conversationId)
        .slice(-limit)
    }
    // Ordena DESC + limit para pegar as mensagens MAIS RECENTES (com
    // ascending:true o limit devolvia o inicio da conversa) e reinverte.
    const { data, error } = await supabase
      .from('ai_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data || []).slice().reverse()
  }

  return {
    startConversation,
    append,
    history,
    getContext,
    setContext,
    getPending,
    setPending,
    clearPending,
    MAX_HISTORY,
  }
}

export const conversationMemory = createConversationMemory()
