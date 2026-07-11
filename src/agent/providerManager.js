// ---------------------------------------------------------------------------
// Provider Manager — decide COMO interpretar o texto:
//   - flag ai.remote DESLIGADA (padrao) OU sem Supabase -> provider MOCK (local);
//   - flag ai.remote LIGADA -> chama a Edge Function `ai-interpret` (JWT + chaves
//     ficam no servidor; NENHUMA chave secreta no frontend).
//
// Fallback seguro: se a chamada remota falhar, cai no mock (nunca quebra a UX).
// Os "adapters reais" (OpenAI/Anthropic) vivem DENTRO da Edge Function.
// ---------------------------------------------------------------------------
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { featureFlags, FLAGS } from './featureFlags'
import { mockInterpret } from './providers/mockProvider'

const MAX_TEXT = 1000 // limite de tamanho (defesa em profundidade; a Edge tambem limita)

export function createProviderManager({ flags = featureFlags, edgeInvoke } = {}) {
  // edgeInvoke injetavel (testes). Padrao: supabase.functions.invoke.
  const invokeEdge = edgeInvoke || (async (name, body) => {
    if (!isSupabaseConfigured) throw new Error('supabase-nao-configurado')
    const { data, error } = await supabase.functions.invoke(name, { body })
    if (error) throw error
    return data
  })

  const isRemoteEnabled = () => flags.isEnabled(FLAGS.AI_REMOTE) && isSupabaseConfigured

  async function interpret(text, context = {}) {
    const clean = String(text || '').slice(0, MAX_TEXT).trim()
    if (!clean) {
      return {
        intent: 'unknown',
        confidence: 0,
        needs_clarification: true,
        clarification: 'Digite um comando.',
        data: {},
        ambiguities: [],
        provider: 'mock',
      }
    }

    if (isRemoteEnabled()) {
      try {
        const result = await invokeEdge('ai-interpret', { text: clean, context })
        return { ...result, provider: result.provider || 'remote' }
      } catch (err) {
        // Fallback seguro para o mock (log discreto; sem vazar detalhes).
        console.warn('[providerManager] remoto falhou, usando mock:', err?.message)
        return { ...mockInterpret(clean, context), provider: 'mock-fallback' }
      }
    }

    return { ...mockInterpret(clean, context), provider: 'mock' }
  }

  return { interpret, activeProvider: () => (isRemoteEnabled() ? 'remote' : 'mock') }
}

export const providerManager = createProviderManager()
