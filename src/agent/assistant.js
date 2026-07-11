// ---------------------------------------------------------------------------
// Orquestrador do Assistente (Agent Runtime completo do Milestone 2).
// Loop: texto -> contexto -> provider -> validar intent -> (leitura executa /
// escrita propoe) -> confirmar -> executar via Tool Registry -> registrar.
//
// Regras: toda ESCRITA exige confirmacao; LEITURA executa e mostra resultado;
// baixa confianca/ambiguidade pedem esclarecimento; multiplas tarefas exigem
// selecao; acao em massa bloqueada (o provider ja sinaliza).
// ---------------------------------------------------------------------------
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
    await memory.append(convId, 'user', text)

    const context = await contextEngine.build(identity, { categories })
    const interp = await providerManager.interpret(text, context)

    // Baixa confianca / esclarecimento / intent desconhecida.
    if (
      interp.needs_clarification ||
      interp.intent === 'unknown' ||
      !registry.has(interp.intent) ||
      interp.confidence < CONFIDENCE_THRESHOLD
    ) {
      const msg = interp.clarification || 'Nao consegui entender com seguranca. Pode reformular?'
      await memory.append(convId, 'assistant', msg)
      return { conversationId: convId, confidence: interp.confidence, ...clarify(msg) }
    }

    // Resolucao de tarefa-alvo (por nome) quando aplicavel.
    let data = { ...interp.data }
    if (TARGET_INTENTS.has(interp.intent)) {
      const r = await resolveTarget(data, identity)
      if (!r.ok && r.reason === 'none') {
        const msg = `Nao encontrei a tarefa "${data.query || data.title || ''}".`
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
          intent: interp.intent,
          data,
          options: r.options,
        }
      }
      data.task_id = r.task_id
      delete data.query
    }

    let outcome
    try {
      outcome = await toProposalOrResult(interp.intent, data, identity, convId)
    } catch (err) {
      // Payload invalido / recurso inexistente etc. -> esclarecimento seguro.
      const msg =
        err?.code === 'invalid_payload'
          ? 'Faltaram informacoes para essa acao. Pode detalhar melhor?'
          : err?.message || 'Nao consegui preparar a acao.'
      await memory.append(convId, 'assistant', msg)
      return { conversationId: convId, ...clarify(msg) }
    }

    const assistantMsg =
      outcome.kind === 'result'
        ? `Encontrei ${Array.isArray(outcome.result) ? outcome.result.length : 0} item(ns).`
        : previewMessage(interp.intent, outcome.proposal?.payload)
    await memory.append(convId, 'assistant', assistantMsg)
    return {
      conversationId: convId,
      confidence: interp.confidence,
      ambiguities: interp.ambiguities || [],
      message: assistantMsg,
      ...outcome,
    }
  }

  // Continua apos o usuario SELECIONAR uma tarefa (fluxo de multiplas).
  async function resolveSelection({ intent, data, taskId, identity, conversationId }) {
    const finalData = { ...data, task_id: taskId }
    delete finalData.query
    const outcome = await toProposalOrResult(intent, finalData, identity, conversationId)
    return { conversationId, ...outcome }
  }

  async function confirm({ proposal, identity, conversationId }) {
    const result = await runtime.confirm(proposal, identity)
    await memory.append(conversationId, 'assistant', 'Acao confirmada e executada.')
    return { kind: 'confirmed', result }
  }

  async function cancel({ proposal, conversationId }) {
    await runtime.cancel(proposal)
    await memory.append(conversationId, 'assistant', 'Acao cancelada.')
    return { kind: 'cancelled' }
  }

  return { ask, resolveSelection, confirm, cancel }
}

function previewMessage(intent, payload = {}) {
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
  return `Entendi que voce deseja ${map[intent] || 'executar uma acao'}${payload.title ? `: "${payload.title}"` : ''}.`
}
