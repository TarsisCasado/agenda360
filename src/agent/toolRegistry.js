// ---------------------------------------------------------------------------
// Tool Registry — allowlist central de acoes executaveis.
// Garantias:
//   - so executa intents registradas (sem ferramentas arbitrarias);
//   - respeita feature flag da ferramenta;
//   - exige identidade da SESSAO (workspaceId + userId), nunca arbitraria;
//   - valida o payload contra o schema da ferramenta;
//   - aplica politica de confirmacao (destrutivas/sensiveis);
//   - erros padronizados (AgentError);
//   - emite eventos tipados no Event Bus.
// ---------------------------------------------------------------------------
import { AgentError, ErrorCodes, isAgentError } from './errors'
import { validateSchema } from './validation'
import { EVENTS } from './eventBus'

function assertIdentity(identity) {
  if (!identity || !identity.workspaceId || !identity.userId) {
    throw new AgentError(
      ErrorCodes.FORBIDDEN_WORKSPACE,
      'Identidade da sessao ausente (workspace/usuario).',
    )
  }
}

// Politica de confirmacao considerando a ORIGEM da acao.
//   - leitura (write=false): nunca;
//   - alwaysConfirm=true (exclusao/cancelamento): sempre;
//   - origem 'ai' + write=true: sim;
//   - origem 'manual' + write=true (nao destrutivo): nao (mantem a UX atual).
export function needsConfirmation(tool, origin = 'manual') {
  if (!tool || !tool.write) return false
  if (tool.alwaysConfirm) return true
  return origin === 'ai'
}

export function createToolRegistry({ tools = [], flags, eventBus } = {}) {
  const map = new Map(tools.map((t) => [t.intent, t]))

  const get = (intent) => map.get(intent) || null
  const has = (intent) => map.has(intent)

  const requireTool = (intent) => {
    const tool = map.get(intent)
    if (!tool) {
      throw new AgentError(ErrorCodes.UNKNOWN_INTENT, `Intent desconhecida: ${intent}`)
    }
    return tool
  }

  // Valida sem executar (usado pela prévia do Agent Runtime).
  const validate = (intent, payload) => {
    const tool = requireTool(intent)
    return validateSchema(tool.schema, payload)
  }

  // Consulta publica: esta acao exige confirmacao para a origem informada?
  const requiresConfirmation = (intent, origin = 'manual') =>
    needsConfirmation(requireTool(intent), origin)

  const execute = async (intent, payload, identity, opts = {}) => {
    const tool = requireTool(intent)
    const origin = opts.origin || 'manual'

    if (tool.flag && flags && !flags.isEnabled(tool.flag)) {
      throw new AgentError(ErrorCodes.TOOL_DISABLED, `Ferramenta desativada: ${intent}`)
    }

    assertIdentity(identity)

    const { valid, errors, value } = validateSchema(tool.schema, payload)
    if (!valid) {
      throw new AgentError(ErrorCodes.INVALID_PAYLOAD, 'Payload invalido', { errors })
    }

    if (needsConfirmation(tool, origin) && !opts.confirmed) {
      throw new AgentError(
        ErrorCodes.CONFIRMATION_REQUIRED,
        `A acao "${intent}" exige confirmacao (origem: ${origin}).`,
      )
    }

    try {
      const result = await tool.execute(value, identity)
      eventBus?.emit(EVENTS.ACTION_SUCCEEDED, { intent, result })
      return result
    } catch (err) {
      // Erros do agente (ex.: NOT_FOUND) sobem preservados.
      if (isAgentError(err)) {
        eventBus?.emit(EVENTS.ACTION_FAILED, { intent, code: err.code })
        throw err
      }
      // Erro inesperado de service -> padronizado (sem vazar stack cru).
      eventBus?.emit(EVENTS.ACTION_FAILED, { intent, code: ErrorCodes.EXECUTION_FAILED })
      throw new AgentError(ErrorCodes.EXECUTION_FAILED, err?.message || 'Falha na execucao')
    }
  }

  return {
    has,
    get,
    validate,
    requiresConfirmation,
    execute,
    list: () =>
      tools.map((t) => ({
        intent: t.intent,
        description: t.description,
        write: !!t.write,
        alwaysConfirm: !!t.alwaysConfirm,
        destructive: !!t.destructive,
        flag: t.flag,
        // confirmacao efetiva por origem (util para a UI do Assistente em M2)
        confirmManual: needsConfirmation(t, 'manual'),
        confirmAi: needsConfirmation(t, 'ai'),
      })),
  }
}
