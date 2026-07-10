// ===========================================================================
// CONTRATOS DOS MODULOS FUTUROS (interfaces estaveis) — Milestone 1
// ---------------------------------------------------------------------------
// Estes modulos NAO sao implementados neste milestone. Definimos apenas os
// contratos (via JSDoc typedefs) e fabricas "null" que lancam NotImplemented,
// para que M2..M4 preencham as implementacoes sem alterar as assinaturas.
// ===========================================================================

class NotImplemented extends Error {
  constructor(what) {
    super(`${what} ainda nao implementado (contrato do Milestone 1).`)
    this.name = 'NotImplemented'
  }
}

// ---------------------------------------------------------------------------
// Provider Manager — abstrai providers de IA (interpretacao) e STT (transcricao)
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} InterpretResult
 * @property {string} intent
 * @property {number} confidence            // 0..1
 * @property {boolean} requires_confirmation
 * @property {Object} data                  // campos estruturados da acao
 *
 * @typedef {Object} ProviderManager
 * @property {(text: string, ctx: Object) => Promise<InterpretResult>} interpret
 * @property {(audio: Blob|ArrayBuffer, opts?: Object) => Promise<{text: string}>} transcribe
 * @property {() => string} activeProvider
 */
export function createNullProviderManager() {
  return {
    activeProvider: () => 'mock',
    async interpret() {
      throw new NotImplemented('ProviderManager.interpret')
    },
    async transcribe() {
      throw new NotImplemented('ProviderManager.transcribe')
    },
  }
}

// ---------------------------------------------------------------------------
// Voice Engine — captura de audio e orquestracao de transcricao
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} VoiceEngine
 * @property {() => boolean} isSupported
 * @property {(opts?: {maxSeconds?: number}) => Promise<void>} start
 * @property {() => Promise<Blob>} stop
 * @property {() => void} cancel
 * @property {(fn: (state: Object) => void) => void} onStateChange
 */
export function createNullVoiceEngine() {
  return {
    isSupported: () => false,
    async start() {
      throw new NotImplemented('VoiceEngine.start')
    },
    async stop() {
      throw new NotImplemented('VoiceEngine.stop')
    },
    cancel() {},
    onStateChange() {},
  }
}

// ---------------------------------------------------------------------------
// Context Engine — monta o contexto seguro (grounding) para o interpretador
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} AgentContext
 * @property {string} workspaceId
 * @property {string} today                 // YYYY-MM-DD
 * @property {string} timezone
 * @property {Array<{id:string,name:string}>} categories
 *
 * @typedef {Object} ContextEngine
 * @property {(identity: Object) => Promise<AgentContext>} build
 */
export function createNullContextEngine() {
  return {
    async build() {
      throw new NotImplemented('ContextEngine.build')
    },
  }
}

// ---------------------------------------------------------------------------
// Conversation Memory — persiste/recupera turnos da conversa (ai_* tables)
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} ConversationMemory
 * @property {(workspaceId: string, userId: string) => Promise<string>} startConversation
 * @property {(conversationId: string, msg: Object) => Promise<Object>} append
 * @property {(conversationId: string) => Promise<Array>} history
 */
export function createNullConversationMemory() {
  return {
    async startConversation() {
      throw new NotImplemented('ConversationMemory.startConversation')
    },
    async append() {
      throw new NotImplemented('ConversationMemory.append')
    },
    async history() {
      throw new NotImplemented('ConversationMemory.history')
    },
  }
}

// ---------------------------------------------------------------------------
// Notification Engine — abstrai canais (in_app/push), dedupe, retry, agenda
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} NotificationEngine
 * @property {(channel: string, payload: Object) => Promise<void>} notify
 * @property {(reminder: Object) => Promise<void>} schedule
 * @property {() => Promise<'granted'|'denied'|'default'|'unsupported'>} permissionStatus
 */
export function createNullNotificationEngine() {
  return {
    async notify() {
      throw new NotImplemented('NotificationEngine.notify')
    },
    async schedule() {
      throw new NotImplemented('NotificationEngine.schedule')
    },
    async permissionStatus() {
      return 'unsupported'
    },
  }
}

// ---------------------------------------------------------------------------
// Plugin System — ponto de extensao (WhatsApp/GCal/... registram tools/canais)
// Apenas o contrato de registro; nenhum plugin concreto neste milestone.
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} AgentPlugin
 * @property {string} id
 * @property {Array=} tools                 // ferramentas a registrar no Tool Registry
 * @property {Object=} providers            // providers de IA/STT
 * @property {Object=} channels             // canais de notificacao
 *
 * @typedef {Object} PluginSystem
 * @property {(plugin: AgentPlugin) => void} register
 * @property {() => AgentPlugin[]} list
 */
export function createNullPluginSystem() {
  const plugins = []
  return {
    register(plugin) {
      // contrato apenas: aceita o registro mas nao ativa nada neste milestone
      if (plugin && plugin.id) plugins.push({ id: plugin.id })
    },
    list: () => [...plugins],
  }
}
