// ---------------------------------------------------------------------------
// Kernel do Agente — fio que liga tools -> registry -> runtime -> assistant,
// com Provider Manager, Context Engine, Conversation Memory, Event Bus,
// Feature Flags e logging em ai_actions.
//
// `createAgentKernel` recebe dependencias injetaveis (testes usam mocks).
// `agentKernel` e a instancia padrao ligada aos services reais.
// ---------------------------------------------------------------------------
import { taskService } from '../services/taskService'
import { linkService } from '../services/linkService'
import { createTools } from './tools'
import { createToolRegistry } from './toolRegistry'
import { createAgentRuntime } from './agentRuntime'
import { createAssistant } from './assistant'
import { aiActionsService } from './aiActionsService'
import { eventBus } from './eventBus'
import { featureFlags } from './featureFlags'
import { providerManager } from './providerManager'
import { contextEngine } from './contextEngine'
import { conversationMemory } from './conversationMemory'

export function createAgentKernel({
  services,
  flags = featureFlags,
  bus = eventBus,
  aiActions = aiActionsService,
  provider = providerManager,
  context = contextEngine,
  memory = conversationMemory,
} = {}) {
  const tools = createTools(services)
  const registry = createToolRegistry({ tools, flags, eventBus: bus })
  const runtime = createAgentRuntime({ registry, aiActions, eventBus: bus })
  const assistant = createAssistant({
    registry,
    runtime,
    providerManager: provider,
    contextEngine: context,
    memory,
  })
  return { registry, runtime, assistant, flags, eventBus: bus }
}

// Identidade NUNCA e passada aqui — quem chama fornece { workspaceId, userId }
// vindos da sessao autenticada. A garantia final e a RLS + defaults auth.uid().
export const agentKernel = createAgentKernel({
  services: { tasks: taskService, links: linkService },
})
