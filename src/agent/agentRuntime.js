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
import { ehIndisponibilidadeTransitoria } from '../lib/indisponibilidade'

// CP6.4.6 — auditoria e REGISTRO, nao e o ato. Se `ai_actions` estiver
// temporariamente inalcancavel, a proposta continua sendo feita e a execucao
// continua exigindo confirmacao humana: o que se perde e a linha de registro,
// nao a salvaguarda. Erro de aplicacao (RLS, payload, FK) NAO passa por aqui —
// esse tem de aparecer.
async function auditoria(promessa, valorPadrao = null) {
  try {
    return await promessa
  } catch (err) {
    if (!ehIndisponibilidadeTransitoria(err)) throw err
    return valorPadrao
  }
}

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

    // `actionId` pode sair nulo (banco fora do ar). Isso NAO afrouxa nada:
    // `requiresConfirmation` vem do registry, e `recordResult` ja ignora id
    // nulo. A proposta aparece; a escrita continua dependendo do humano.
    let actionId = null
    if (aiActions) {
      actionId = await auditoria(
        aiActions.recordProposed({
          workspaceId: identity?.workspaceId,
          conversationId: context.conversationId,
          messageId: context.messageId,
          intent,
          payload: value,
        }),
        null,
      )
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
  async function confirm(proposal, identity, context = {}) {
    // Proposta nascida sem rede: a linha de `ai_actions` nunca foi criada.
    // Estando online agora, registra-se ANTES de executar — mesma funcao, mesmo
    // caminho, so atrasada. Best-effort: se ainda nao der, segue com id nulo.
    // Isto nao executa nada; so recupera a auditoria que faltou.
    let actionId = proposal.actionId ?? null
    if (actionId == null && aiActions) {
      actionId = await auditoria(
        aiActions.recordProposed({
          workspaceId: identity?.workspaceId,
          conversationId: context.conversationId ?? null,
          messageId: context.messageId ?? null,
          intent: proposal.intent,
          payload: proposal.payload,
        }),
        null,
      )
    }

    let result
    try {
      result = await registry.execute(proposal.intent, proposal.payload, identity, {
        confirmed: true,
        origin: 'ai',
      })
    } catch (err) {
      // A execucao falhou: nada foi criado. O registro do fracasso e que pode
      // faltar se o banco estiver fora — e o erro ORIGINAL e que tem de subir,
      // nunca o erro da auditoria.
      try {
        await aiActions?.recordResult(actionId, { status: 'failed' })
      } catch (erroDeRegistro) {
        if (!ehIndisponibilidadeTransitoria(erroDeRegistro)) {
          console.error('[agentRuntime] falha ao registrar acao malsucedida:', erroDeRegistro)
        }
      }
      eventBus?.emit(EVENTS.ACTION_FAILED, {
        intent: proposal.intent,
        actionId,
        code: err?.code,
      })
      throw err
    }

    // DAQUI PARA BAIXO A ATIVIDADE JA EXISTE. Nenhuma falha de registro pode
    // virar "nao consegui executar": essa mensagem faria a pessoa confirmar de
    // novo e criar a atividade duas vezes.
    // Em exclusoes a tarefa deixa de existir: NAO vinculamos task_id
    // (evita violar a FK ai_actions.task_id -> tasks no Supabase).
    const taskId = result && typeof result === 'object' && !result.deleted ? result.id : undefined
    try {
      await aiActions?.recordResult(actionId, { status: 'applied', taskId })
    } catch (err) {
      if (!ehIndisponibilidadeTransitoria(err)) {
        console.error('[agentRuntime] acao executada, mas o registro falhou:', err)
      }
    }
    eventBus?.emit(EVENTS.ACTION_CONFIRMED, { intent: proposal.intent, actionId })
    return result
  }

  // 2b) Cancela -> registra descarte, nao toca no dominio.
  async function cancel(proposal) {
    await auditoria(aiActions?.recordResult(proposal.actionId, { status: 'dismissed' }))
    eventBus?.emit(EVENTS.ACTION_CANCELLED, { actionId: proposal.actionId })
  }

  return { propose, confirm, cancel }
}
