// ---------------------------------------------------------------------------
// Orquestrador do Assistente.
//
// Loop real:
//   texto -> memoria (historico + intencao pendente) -> contexto -> provider
//         -> merge de turno (slot-filling) -> falta slot? pergunta UM slot
//         -> leitura executa / escrita propoe -> confirmacao -> tool -> registro
//
// Divisao de responsabilidades (proposital):
//   SEMANTICO   -> providerManager (local hoje, LLM depois): qual a intencao.
//   DETERMINISTICO -> slots.js + temporal.js + tools/validation: o que falta,
//                     que data e essa, o que pode executar, o que exige
//                     confirmacao. Trocar de provider nao afrouxa nada disso.
//
// Regras: toda ESCRITA exige confirmacao; LEITURA executa e mostra resultado;
// pergunta-se SO o slot que falta; nunca se inventa data ou horario; acao em
// massa bloqueada.
// ---------------------------------------------------------------------------
import {
  mergeTurn,
  missingSlots,
  slotQuestion,
  withDaypartNote,
  stripInternal,
  FILLABLE_INTENTS,
} from './slots'

const READ_INTENTS = new Set(['search_tasks', 'list_schedule'])
const TARGET_INTENTS = new Set([
  'complete_task', 'mark_missed', 'reschedule_task', 'cancel_task', 'delete_task', 'update_task',
])
const CONFIDENCE_THRESHOLD = 0.5

export function createAssistant({ registry, runtime, providerManager, contextEngine, memory }) {
  // Resolve a tarefa-alvo (por task_id direto ou por texto). Retorna:
  //  { ok:true, task_id } | { ok:false, reason:'none'|'many', options }
  async function resolveTarget(data, identity) {
    if (data.task_id) return { ok: true, task_id: data.task_id }
    const query = (data.query || data.title || '').trim()
    if (!query) return { ok: false, reason: 'none', options: [] }
    const matches = await registry.execute('search_tasks', { query }, identity, { origin: 'ai' })
    if (!matches.length) return { ok: false, reason: 'none', options: [] }
    if (matches.length > 1) {
      return {
        ok: false,
        reason: 'many',
        options: matches.slice(0, 6).map((t) => ({ id: t.id, title: t.title, date: t.date })),
      }
    }
    return { ok: true, task_id: matches[0].id }
  }

  function clarify(message, extra = {}) {
    return { kind: 'clarification', message, ...extra }
  }

  async function toProposalOrResult(intent, data, identity, conversationId) {
    // Leitura: executa direto (sem confirmacao) e mostra resultado.
    if (READ_INTENTS.has(intent)) {
      const result = await registry.execute(intent, data, identity, { origin: 'ai' })
      return { kind: 'result', intent, result }
    }
    // Escrita: propoe (valida + registra ai_action proposed + previa).
    const proposal = await runtime.propose({
      intent,
      payload: data,
      identity,
      context: { conversationId },
    })
    return { kind: 'proposal', proposal }
  }

  async function ask({ text, identity, categories = [], conversationId }) {
    if (!identity?.workspaceId || !identity?.userId) {
      throw new Error('Sessao/workspace ausente.')
    }
    // Conversa (memory) — inicia se necessario.
    const convId = conversationId || (await memory.startConversation(identity.workspaceId, identity.userId))

    // MEMORIA: historico recente + intencao pendente ANTES de interpretar.
    const [historyRows, pending] = await Promise.all([
      memory.history(convId).catch(() => []),
      memory.getPending ? memory.getPending(convId).catch(() => null) : Promise.resolve(null),
    ])
    await memory.append(convId, 'user', text)

    const context = await contextEngine.build(identity, { categories, history: historyRows, pending })
    const interp = await providerManager.interpret(text, context)

    // Continuidade de conversa (deterministico): este turno completa a intencao
    // anterior ou abre uma nova?
    const turn = mergeTurn({ pending, interp, text, context })

    // Nao entendeu nem como frase nova nem como resposta ao slot aberto.
    const unusable =
      turn.intent === 'unknown' || !registry.has(turn.intent) || interp.confidence < CONFIDENCE_THRESHOLD
    // Recusa explicita do interpretador (ex.: acao em massa) numa intencao que
    // NAO se completa por slot: nao ha o que perguntar, so avisar.
    const blocked = !turn.continued && interp.needs_clarification && !FILLABLE_INTENTS.has(turn.intent)
    if (!turn.continued && (unusable || blocked)) {
      const msg = interp.clarification || 'Nao consegui entender com seguranca. Pode reformular?'
      await memory.append(convId, 'assistant', msg)
      return { conversationId: convId, confidence: interp.confidence, ...clarify(msg) }
    }

    // A resposta curta nao serviu para o slot aberto: repete a pergunta (sem
    // reiniciar a conversa e sem perder o que ja foi entendido).
    if (turn.unresolvedSlot) {
      const msg = `Não consegui entender essa parte. ${slotQuestion(turn.unresolvedSlot, turn.data)}`
      await savePending(convId, turn, turn.unresolvedSlot)
      await memory.append(convId, 'assistant', msg, { slot: turn.unresolvedSlot })
      return { conversationId: convId, ...clarify(msg, { slot: turn.unresolvedSlot, intent: turn.intent }) }
    }

    let data = { ...turn.data }

    // SLOT FALTANTE -> pergunta UM slot e guarda a intencao pendente.
    const missing = missingSlots(turn.intent, data, { asked: turn.asked })
    if (missing.length) {
      const slot = missing[0]
      const question = slotQuestion(slot, data)
      await savePending(convId, { ...turn, data }, slot)
      await memory.append(convId, 'assistant', question, { slot })
      return {
        conversationId: convId,
        confidence: interp.confidence,
        ...clarify(question, { slot, intent: turn.intent, data }),
      }
    }

    // Interpretador pediu esclarecimento e nao ha slot a preencher: repassa.
    if (!turn.continued && interp.needs_clarification && interp.clarification) {
      await memory.append(convId, 'assistant', interp.clarification)
      return { conversationId: convId, ...clarify(interp.clarification) }
    }

    // Resolucao de tarefa-alvo (por nome) quando aplicavel.
    if (TARGET_INTENTS.has(turn.intent)) {
      const r = await resolveTarget(data, identity)
      if (!r.ok && r.reason === 'none') {
        const msg = `Nao encontrei a tarefa "${data.query || data.title || ''}".`
        await memory.clearPending?.(convId)
        await memory.append(convId, 'assistant', msg)
        return { conversationId: convId, ...clarify(msg) }
      }
      if (!r.ok && r.reason === 'many') {
        const msg = 'Encontrei mais de uma tarefa. Qual delas?'
        await memory.append(convId, 'assistant', msg)
        return {
          conversationId: convId,
          kind: 'selection',
          message: msg,
          intent: turn.intent,
          data,
          options: r.options,
        }
      }
      data.task_id = r.task_id
      delete data.query
    }

    // Campos internos de slot nao vazam para a ferramenta; o periodo do dia
    // informado pelo usuario vira nota (nunca um horario inventado).
    const payload = turn.intent === 'create_task' ? withDaypartNote(data) : stripInternal(data)

    let outcome
    try {
      outcome = await toProposalOrResult(turn.intent, payload, identity, convId)
    } catch (err) {
      // Payload invalido / recurso inexistente etc. -> esclarecimento seguro.
      const msg =
        err?.code === 'invalid_payload'
          ? 'Faltaram informacoes para essa acao. Pode detalhar melhor?'
          : err?.message || 'Nao consegui preparar a acao.'
      await memory.append(convId, 'assistant', msg)
      return { conversationId: convId, ...clarify(msg) }
    }

    // Chegou a uma proposta/resultado: a intencao deixou de estar pendente.
    await memory.clearPending?.(convId)

    const assistantMsg =
      outcome.kind === 'result'
        ? `Encontrei ${Array.isArray(outcome.result) ? outcome.result.length : 0} item(ns).`
        : previewMessage(turn.intent, outcome.proposal?.payload, data)
    await memory.append(convId, 'assistant', assistantMsg)
    return {
      conversationId: convId,
      confidence: interp.confidence,
      ambiguities: interp.ambiguities || [],
      continued: turn.continued,
      message: assistantMsg,
      ...outcome,
    }
  }

  async function savePending(conversationId, turn, awaiting) {
    if (!memory.setPending) return
    await memory
      .setPending(conversationId, {
        intent: turn.intent,
        data: turn.data,
        asked: turn.asked || [],
        awaiting,
        at: new Date().toISOString(),
      })
      .catch(() => {})
  }

  // Continua apos o usuario SELECIONAR uma tarefa (fluxo de multiplas).
  async function resolveSelection({ intent, data, taskId, identity, conversationId }) {
    const finalData = stripInternal({ ...data, task_id: taskId })
    delete finalData.query
    const outcome = await toProposalOrResult(intent, finalData, identity, conversationId)
    return { conversationId, ...outcome }
  }

  async function confirm({ proposal, identity, conversationId }) {
    const result = await runtime.confirm(proposal, identity)
    await memory.clearPending?.(conversationId)
    await memory.append(conversationId, 'assistant', 'Acao confirmada e executada.')
    return { kind: 'confirmed', result }
  }

  async function cancel({ proposal, conversationId }) {
    await runtime.cancel(proposal)
    await memory.clearPending?.(conversationId)
    await memory.append(conversationId, 'assistant', 'Acao cancelada.')
    return { kind: 'cancelled' }
  }

  return { ask, resolveSelection, confirm, cancel }
}

// Previa em linguagem humana: diz o que entendeu, incluindo quando o horario
// ficou em aberto de proposito.
function previewMessage(intent, payload = {}, data = {}) {
  const map = {
    create_task: 'criar uma atividade',
    update_task: 'editar a atividade',
    reschedule_task: 'reagendar a atividade',
    complete_task: 'concluir a atividade',
    mark_missed: 'marcar como furada',
    cancel_task: 'cancelar a atividade',
    delete_task: 'excluir a atividade',
    create_link: 'salvar um link',
  }
  const base = `Entendi que voce deseja ${map[intent] || 'executar uma acao'}${payload.title ? `: "${payload.title}"` : ''}.`
  if (intent === 'create_task' && !payload.start_time && data.daypart) {
    return `${base} Deixei sem horario exato.`
  }
  return base
}
