// ---------------------------------------------------------------------------
// Kernel do Agente — fio que liga tools -> registry -> runtime, com Event Bus,
// Feature Flags e logging em ai_actions.
//
// `createAgentKernel` recebe dependencias injetaveis (testes usam mocks).
// `agentKernel` e a instancia padrao ligada aos services reais.
//
// IMPORTANTE (Milestone 1): este kernel NAO e importado pela UI atual — e a
// fundacao para o Milestone 2. A UX de hoje permanece intacta.
// ---------------------------------------------------------------------------
import { taskService } from '../services/taskService'
import { linkService } from '../services/linkService'
import { createTools } from './tools'
import { createToolRegistry } from './toolRegistry'
import { createAgentRuntime } from './agentRuntime'
import { aiActionsService } from './aiActionsService'
import { eventBus } from './eventBus'
import { featureFlags } from './featureFlags'

export function createAgentKernel({
  services,
  flags = featureFlags,
  bus = eventBus,
  aiActions = aiActionsService,
} = {}) {
  const tools = createTools(services)
  const registry = createToolRegistry({ tools, flags, eventBus: bus })
  const runtime = createAgentRuntime({ registry, aiActions, eventBus: bus })
  return { registry, runtime, flags, eventBus: bus }
}

// Identidade NUNCA e passada aqui — quem chama `registry.execute`/`runtime`
// fornece { workspaceId, userId } vindos da sessao autenticada (AuthContext +
// WorkspaceContext). A garantia final e a RLS + defaults auth.uid() no banco.
export const agentKernel = createAgentKernel({
  services: { tasks: taskService, links: linkService },
})
