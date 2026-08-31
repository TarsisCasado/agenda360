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
//
// CP5.1 — RASCUNHO VIVO. A conversa tem duas fases, ambas guardadas em
// ai_conversations.context (jsonb livre, SEM migration):
//
//   awaiting_slot         falta informacao -> mergeTurn/slots respondem.
//   awaiting_confirmation a atividade esta pronta na tela -> turnClassifier
//                         decide se o proximo turno ALTERA, CONFIRMA, CANCELA
//                         ou SUBSTITUI o rascunho.
//
// A proposta renderizada NAO encerra o contexto. O rascunho so morre por
// confirmacao, cancelamento ou substituicao inequivoca por outra intencao.
//
// CP5.1.1 — CONSULTA. Havendo entidade ativa, ela e tambem o REFERENTE padrao
// de perguntas e pronomes: "esta sem data?", "como ficou?", "tem lembrete?".
// Consultar nao altera, nao executa, nao propoe e nao perde o contexto — so le
// o rascunho e responde com o estado real. Vale nas duas fases.
// ---------------------------------------------------------------------------
import {
  mergeTurn,
  missingSlots,
  slotQuestion,
  withDaypartNote,
  stripInternal,
  applyPatch,
  FILLABLE_INTENTS,
} from './slots'
import { classifyTurn, isDraftQuery, TURN } from './turnClassifier'
import { describeDraft } from './draftSummary'

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

    // ------------------------------------------------------------------
    // CONSULTA sobre a entidade ativa — vale em QUALQUER fase com rascunho.
    // Perguntar nao e mandar: nao altera, nao propoe, nao executa, nao
    // descarta. Responde do estado real e devolve a conversa onde estava.
    // ------------------------------------------------------------------
    let draft = pending
    if (draft?.intent && isDraftQuery({ interp, text }).match) {
      return await answerAboutDraft(convId, draft, text, context)
    }

    // ------------------------------------------------------------------
    // FASE "aguardando confirmacao": ha um rascunho VIVO na tela. Antes de
    // tratar o turno como frase nova, ele e avaliado CONTRA esse rascunho.
    // ------------------------------------------------------------------
    if (draft?.phase === 'awaiting_confirmation' && draft.proposal) {
      const decision = classifyTurn({ interp, text, context })

      if (decision.kind === TURN.CONFIRM) {
        return await confirmDraft(convId, draft, identity)
      }
      if (decision.kind === TURN.CANCEL) {
        return await cancelDraft(convId, draft)
      }
      if (decision.kind === TURN.MODIFY) {
        return await reviseDraft(convId, draft, decision, identity, interp)
      }
      if (decision.kind === TURN.AMBIGUOUS) {
        // Perguntar e melhor que adivinhar: o rascunho continua vivo.
        const msg = `Isso é sobre "${draft.data?.title || 'a atividade'}" que preparei, ou algo novo?`
        await memory.append(convId, 'assistant', msg, { phase: 'awaiting_confirmation' })
        return {
          conversationId: convId,
          ...clarify(msg, { intent: draft.intent, data: draft.data }),
          proposal: draft.proposal,
        }
      }
      // TURN.NEW_INTENT: substituicao inequivoca — o rascunho e descartado
      // (com registro) e o turno segue o fluxo normal, do zero.
      await runtime.cancel(draft.proposal).catch(() => {})
      await memory.clearPending?.(convId)
      draft = null
    }

    // Continuidade de conversa (deterministico): este turno completa a intencao
    // anterior ou abre uma nova?
    const turn = mergeTurn({ pending: draft, interp, text, context })

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
      // A razao vem da camada de slots: quando ha um motivo de DOMINIO
      // (compromisso com hora precisa de dia), o usuario merece ouvi-lo em vez
      // de um generico "nao entendi".
      const reason =
        turn.unresolvedReason === 'needs_date_for_time'
          ? 'Como já tem horário marcado, esse compromisso precisa de um dia.'
          : 'Não consegui entender essa parte.'
      const msg = `${reason} ${slotQuestion(turn.unresolvedSlot, turn.data)}`
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

    // CP5.1 — a proposta NAO encerra o contexto. Uma escrita aguardando
    // confirmacao vira rascunho VIVO; uma leitura (que ja executou) encerra.
    if (outcome.kind === 'proposal') {
      await saveDraft(convId, { intent: turn.intent, data, asked: turn.asked }, outcome.proposal)
    } else {
      await memory.clearPending?.(convId)
    }

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
        phase: 'awaiting_slot',
        intent: turn.intent,
        data: turn.data,
        asked: turn.asked || [],
        awaiting,
        at: new Date().toISOString(),
      })
      .catch(() => {})
  }

  // ------------------------------------------------------------------------
  // RASCUNHO VIVO (CP5.1)
  //
  // Tudo cabe no jsonb de ai_conversations.context que ja existia — nenhuma
  // coluna nova, nenhuma migration. `proposal` e JSON puro (intent, payload,
  // actionId), entao sobrevive a um reload da pagina e a troca de dispositivo.
  // ------------------------------------------------------------------------
  async function saveDraft(conversationId, turn, proposal, revision = 0) {
    if (!memory.setPending) return
    await memory
      .setPending(conversationId, {
        phase: 'awaiting_confirmation',
        intent: turn.intent,
        data: turn.data,
        asked: turn.asked || [],
        awaiting: null,
        proposal,
        revision,
        at: new Date().toISOString(),
      })
      .catch(() => {})
  }

  // CONSULTA: le o rascunho e responde. O estado da conversa fica INTACTO —
  // mesma fase, mesmos dados, mesma proposta — para que o turno seguinte
  // ("entao coloca sexta", "pode salvar") continue sobre a MESMA entidade.
  async function answerAboutDraft(conversationId, draft, text, context) {
    const { fields } = isDraftQuery({ interp: {}, text, providerAgrees: false })
    const answer = describeDraft(draft.data, {
      categories: context?.categories || [],
      today: context?.today,
      fields,
    })

    // Fecho: com a proposta pronta, convida a confirmar; com slot aberto,
    // repete a pergunta que estava de pe, para a conversa nao travar.
    const openSlot =
      draft.phase === 'awaiting_confirmation'
        ? null
        : draft.awaiting || missingSlots(draft.intent, draft.data, { asked: draft.asked })[0]
    const tail = openSlot
      ? slotQuestion(openSlot, draft.data)
      : 'Se estiver certo, é só confirmar.'

    const msg = `${answer} ${tail}`
    await memory.append(conversationId, 'assistant', msg, { inspect: true })
    return {
      conversationId,
      kind: 'answer',
      message: msg,
      intent: draft.intent,
      data: draft.data,
      ...(draft.proposal ? { proposal: draft.proposal } : {}),
      ...(openSlot ? { slot: openSlot } : {}),
    }
  }

  async function confirmDraft(conversationId, draft, identity) {
    const result = await runtime.confirm(draft.proposal, identity)
    await memory.clearPending?.(conversationId)
    const msg = 'Pronto, salvei.'
    await memory.append(conversationId, 'assistant', msg)
    return { conversationId, kind: 'confirmed', message: msg, intent: draft.intent, result }
  }

  async function cancelDraft(conversationId, draft) {
    await runtime.cancel(draft.proposal).catch(() => {})
    await memory.clearPending?.(conversationId)
    const msg = 'Tudo bem, descartei.'
    await memory.append(conversationId, 'assistant', msg)
    return { conversationId, kind: 'cancelled', message: msg, intent: draft.intent }
  }

  // ALTERACAO: aplica o patch, REVALIDA e repropoe. Se o patch fizer faltar um
  // slot obrigatorio (ex.: tirar a data de um compromisso com hora), a conversa
  // volta a fase de pergunta em vez de propor algo invalido.
  async function reviseDraft(conversationId, draft, decision, identity, interp) {
    const data = applyPatch(draft.data, decision.patch)

    // Dispensar um slot OPCIONAL por ajuste vale como te-lo respondido: quem
    // diz "sem horario" nao pode ouvir "qual horario?" no turno seguinte.
    const asked = [...(draft.asked || [])]
    if (decision.patch?.start_time === null && !asked.includes('horario')) asked.push('horario')

    const missing = missingSlots(draft.intent, data, { asked })
    if (missing.length) {
      const slot = missing[0]
      const question = slotQuestion(slot, data)
      await runtime.cancel(draft.proposal).catch(() => {})
      await savePending(conversationId, { intent: draft.intent, data, asked }, slot)
      await memory.append(conversationId, 'assistant', question, { slot })
      return {
        conversationId,
        ...clarify(question, { slot, intent: draft.intent, data }),
      }
    }

    const payload = draft.intent === 'create_task' ? withDaypartNote(data) : stripInternal(data)
    let outcome
    try {
      outcome = await toProposalOrResult(draft.intent, payload, identity, conversationId)
    } catch (err) {
      // O ajuste deixou o rascunho invalido: nao perde nada, so avisa.
      const msg = `Não consegui aplicar esse ajuste (${err?.message || 'dado inválido'}). O que preparei continua aqui.`
      await memory.append(conversationId, 'assistant', msg)
      return { conversationId, ...clarify(msg), proposal: draft.proposal }
    }

    // A proposta anterior deixa de valer: registra o descarte antes de trocar.
    await runtime.cancel(draft.proposal).catch(() => {})
    await saveDraft(
      conversationId,
      { intent: draft.intent, data, asked },
      outcome.proposal,
      (draft.revision || 0) + 1,
    )

    const what = decision.fields?.length ? listar(decision.fields) : 'a atividade'
    const msg = `Ajustei ${what}. Confira e confirme. 👇`
    await memory.append(conversationId, 'assistant', msg)
    return {
      conversationId,
      confidence: interp?.confidence,
      continued: true,
      revised: true,
      message: msg,
      ...outcome,
    }
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
// "a data", "a data e o horário", "a data, o horário e a prioridade".
const ARTICLE = { data: 'a', horário: 'o', período: 'o', prioridade: 'a', categoria: 'a', lembrete: 'o' }
function listar(fields = []) {
  const unique = [...new Set(fields)].map((f) => `${ARTICLE[f] || 'o'} ${f}`)
  if (unique.length === 1) return unique[0]
  return `${unique.slice(0, -1).join(', ')} e ${unique[unique.length - 1]}`
}

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
  if (intent === 'create_task' && data.date_skipped) {
    return `${base} Sem data — vai para a lista de tarefas a fazer.`
  }
  if (intent === 'create_task' && !payload.start_time && data.daypart) {
    return `${base} Deixei sem horario exato.`
  }
  return base
}
