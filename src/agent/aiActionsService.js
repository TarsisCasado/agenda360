import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { localStore } from '../services/localStore'
import { uid } from '../lib/utils'

// ---------------------------------------------------------------------------
// Registro de acoes da IA em `ai_actions`.
// Guarda a acao PROPOSTA e o RESULTADO (applied/dismissed/failed), vinculando
// workspace, conversa, mensagem e tarefa quando aplicavel.
//
// Privacidade: guarda apenas os dados estruturados necessarios (intent + campos
// da acao). NAO grava a transcricao/texto bruto do usuario aqui.
// ---------------------------------------------------------------------------

// Remove chaves obviamente sensiveis/desnecessarias do payload antes de gravar.
function sanitize(payload = {}) {
  const clone = { ...payload }
  delete clone.raw_text
  delete clone.transcript
  delete clone.audio
  return clone
}

export const aiActionsService = {
  async recordProposed({ workspaceId, conversationId, messageId, intent, payload }) {
    const row = {
      workspace_id: workspaceId,
      conversation_id: conversationId ?? null,
      message_id: messageId ?? null,
      action_type: intent,
      payload: sanitize(payload),
      status: 'proposed',
    }
    if (!isSupabaseConfigured) {
      const saved = { id: uid(), created_at: new Date().toISOString(), applied_at: null, ...row }
      const rows = localStore.table('ai_actions')
      rows.unshift(saved)
      localStore.setTable('ai_actions', rows)
      return saved.id
    }
    const { data, error } = await supabase.from('ai_actions').insert(row).select('id').single()
    if (error) throw error
    return data.id
  },

  // status: 'applied' | 'dismissed' | 'failed'
  async recordResult(actionId, { status, taskId } = {}) {
    if (!actionId) return
    const patch = {
      status,
      task_id: taskId ?? null,
      applied_at: status === 'applied' ? new Date().toISOString() : null,
    }
    if (!isSupabaseConfigured) {
      const rows = localStore.table('ai_actions')
      const idx = rows.findIndex((r) => r.id === actionId)
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...patch }
        localStore.setTable('ai_actions', rows)
      }
      return
    }
    const { error } = await supabase.from('ai_actions').update(patch).eq('id', actionId)
    if (error) throw error
  },
}
