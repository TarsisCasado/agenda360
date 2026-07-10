// ---------------------------------------------------------------------------
// Agent Runtime (implementacao MINIMA do Milestone 1).
// Responsabilidade: preparar (validar) uma acao, gerar uma PREVIA e encaminha-la
// ao Tool Registry apos confirmacao. Registra tudo em ai_actions.
//
// NAO conecta provider de IA (isso e Milestone 2). Aqui a acao ja chega
// estruturada (intent + payload), como se viesse de um interpretador.
//
// Fluxo: propose() -> [usuario decide] -> confirm() | cancel()
// ---------------------------------------------------------------------------
import { AgentError, ErrorCodes } from './errors'
import { EVENTS } from './eventBus'

export function createAgentRuntime({ registry, aiActions, eventBus } = {}) {
  // 1) Prepara e valida (sem gravar nada no dominio). Registra a PROPOSTA.
  async function propose({ intent, payload, identity, context = {} }) {
    if (!registry.has(intent)) {
      throw new AgentError(ErrorCodes.UNKNOWN_INTENT, `Intent desconhecida: ${intent}`)
    }
    const { valid, errors, value } = registry.validate(intent, payload)
    if (!valid) {
      throw new AgentError(ErrorCodes.INVALID_PAYLOAD, 'Payload invalido', { errors })
    }
    const tool = registry.get(intent)
    // Origem sempre 'ai' no runtime -> toda acao de ESCRITA exige confirmacao.
    const requiresConfirmation = registry.requiresConfirmation(intent, 'ai')

    let actionId = null
    if (aiActions) {
      actionId = await aiActions.recordProposed({
        workspaceId: identity?.workspaceId,
        conversationId: context.conversationId,
        messageId: context.messageId,
        intent,
        payload: value,
      })
    }

    eventBus?.emit(EVENTS.ACTION_PROPOSED, { intent, actionId })

    return {
      actionId,
      intent,
      payload: value,
      requiresConfirmation,
      destructive: !!tool.destructive,
      write: !!tool.write,
      preview: value,
    }
  }

  // 2a) Confirma -> executa via Registry (origem 'ai') e registra o resultado.
  async function confirm(proposal, identity) {
    try {
      const result = await registry.execute(proposal.intent, proposal.payload, identity, {
        confirmed: true,
        origin: 'ai',
      })
      const taskId = result && typeof result === 'object' ? result.id : undefined
      await aiActions?.recordResult(proposal.actionId, { status: 'applied', taskId })
      eventBus?.emit(EVENTS.ACTION_CONFIRMED, {
        intent: proposal.intent,
        actionId: proposal.actionId,
      })
      return result
    } catch (err) {
      await aiActions?.recordResult(proposal.actionId, { status: 'failed' })
      eventBus?.emit(EVENTS.ACTION_FAILED, {
        intent: proposal.intent,
        actionId: proposal.actionId,
        code: err?.code,
      })
      throw err
    }
  }

  // 2b) Cancela -> registra descarte, nao toca no dominio.
  async function cancel(proposal) {
    await aiActions?.recordResult(proposal.actionId, { status: 'dismissed' })
    eventBus?.emit(EVENTS.ACTION_CANCELLED, { actionId: proposal.actionId })
  }

  return { propose, confirm, cancel }
}
