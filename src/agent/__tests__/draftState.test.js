import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'
import { classifyTurn, TURN } from '../turnClassifier'
import { detectSpeechAct } from '../nlu/speechAct'
import { extractDelta, residualSubject } from '../nlu/delta'
import { applyPatch } from '../slots'
import { interpretLocal } from '../nlu/localNlu'

// ---------------------------------------------------------------------------
// CP5.1 — RASCUNHO VIVO.
//
// P0 reproduzido no QA real (iPhone):
//   "preciso resolver algumas demanda com o Sr Francisco."
//   -> "Para quando e ...?"      "amanha"
//   -> proposta na tela          "quero deixar somente no kanban semana"
//   -> "Para quando e 'Deixar somente no kanban semana'?"   <-- ERRADO
//
// Causa: ao emitir a proposta o assistant chamava clearPending(), e o rascunho
// que estava na TELA deixava de existir no CONTEXTO. Todo turno seguinte era
// lido como se a conversa tivesse comecado agora.
//
// Contrato que estes testes travam:
//   uma entidade em construcao continua viva ate CONFIRMACAO, CANCELAMENTO ou
//   SUBSTITUICAO INEQUIVOCA. Uma proposta renderizada NAO encerra o contexto.
//
// Hoje = domingo 2026-08-30 / 20:50. Amanha = 2026-08-31. Sexta = 2026-09-04.
// ---------------------------------------------------------------------------
const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const TODAY = '2026-08-30'
const AMANHA = '2026-08-31'
const SEXTA = '2026-09-04'
const CTX = { today: TODAY, now: '20:50', categories: [] }

function makeMemory() {
  const conversations = new Map()
  const messages = []
  return {
    conversations,
    messages,
    startConversation: vi.fn(async () => {
      conversations.set('conv-1', { context: {} })
      return 'conv-1'
    }),
    append: vi.fn(async (id, role, content, metadata = {}) => {
      messages.push({ id, role, content, metadata })
      return {}
    }),
    history: vi.fn(async (id) =>
      messages.filter((m) => m.id === id).map(({ role, content }) => ({ role, content })),
    ),
    getContext: vi.fn(async (id) => conversations.get(id)?.context || {}),
    setContext: vi.fn(async (id, patch) => {
      const current = conversations.get(id) || { context: {} }
      current.context = { ...current.context, ...patch }
      conversations.set(id, current)
      return current.context
    }),
    getPending: vi.fn(async (id) => conversations.get(id)?.context?.pending || null),
    setPending: vi.fn(async (id, pending) => {
      const current = conversations.get(id) || { context: {} }
      current.context = { ...current.context, pending }
      conversations.set(id, current)
    }),
    clearPending: vi.fn(async (id) => {
      const current = conversations.get(id) || { context: {} }
      current.context = { ...current.context, pending: null }
      conversations.set(id, current)
    }),
  }
}

function makeServices() {
  return {
    tasks: {
      getById: vi.fn(async (ws, id) => ({ id, workspace_id: ws, title: 'X', status: 'todo' })),
      create: vi.fn(async (ws, uid, data) => ({ id: 'task-new', date: null, ...data })),
      update: vi.fn(async (uid, task, patch) => ({ ...task, ...patch })),
      changeStatus: vi.fn(async (uid, task, status) => ({ ...task, status })),
      reschedule: vi.fn(async (uid, task, date) => ({ ...task, date })),
      remove: vi.fn(async () => {}),
      list: vi.fn(async () => []),
    },
    links: { create: vi.fn(async () => ({ id: 'l1' })) },
  }
}

function build() {
  const services = makeServices()
  const memory = makeMemory()
  const flags = createFeatureFlags()
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const aiActions = { recordProposed: vi.fn(async () => 'act-1'), recordResult: vi.fn(async () => {}) }
  const runtime = createAgentRuntime({ registry, aiActions, eventBus })
  // Provider REAL do modo local: a garantia precisa valer com a mesma camada
  // semantica que roda em Preview/Production hoje.
  const providerManager = createProviderManager({ flags })
  const contextEngine = {
    build: vi.fn(async () => ({ ...CTX, timezone: 'America/Fortaleza', recentTasks: [], overdueTasks: [] })),
  }
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, memory, services, aiActions }
}

const say = (assistant, text, conversationId) =>
  assistant.ask({ text, identity: IDENTITY, conversationId })

// Leva a conversa ate ter um rascunho pronto aguardando confirmacao.
async function draftFrancisco() {
  const ctx = build()
  const first = await say(ctx.assistant, 'Preciso resolver demandas com o Sr Francisco')
  expect(first.kind).toBe('clarification')
  const second = await say(ctx.assistant, 'amanhã', first.conversationId)
  expect(second.kind).toBe('proposal')
  expect(second.proposal.payload.date).toBe(AMANHA)
  return { ...ctx, conversationId: first.conversationId, proposal: second.proposal }
}

// ===========================================================================
// 1) O CONTRATO: a proposta nao encerra o contexto
// ===========================================================================
describe('rascunho vivo — a proposta nao encerra o contexto', () => {
  it('apos a proposta o contexto guarda fase, dados e a propria proposta', async () => {
    const { memory } = await draftFrancisco()
    const draft = await memory.getPending('conv-1')
    expect(draft).not.toBeNull()
    expect(draft.phase).toBe('awaiting_confirmation')
    expect(draft.data.title).toMatch(/Francisco/)
    expect(draft.data.date).toBe(AMANHA)
    expect(draft.proposal.intent).toBe('create_task')
  })

  it('o rascunho e JSON puro — cabe em ai_conversations.context, sem migration', async () => {
    const { memory } = await draftFrancisco()
    const draft = await memory.getPending('conv-1')
    expect(() => JSON.parse(JSON.stringify(draft))).not.toThrow()
    expect(JSON.parse(JSON.stringify(draft))).toEqual(draft)
  })
})

// ===========================================================================
// 2) O ROTEIRO EXATO DO QA
// ===========================================================================
describe('QA: Sr Francisco -> amanhã -> "quero deixar somente no kanban semana"', () => {
  it('o terceiro turno ALTERA o rascunho em vez de criar outra atividade', async () => {
    const { assistant, memory, conversationId } = await draftFrancisco()

    const third = await say(assistant, 'quero deixar somente no kanban semana', conversationId)

    // Antes do CP5.1 isto respondia: Para quando e "Deixar somente no kanban semana"?
    expect(third.kind).toBe('proposal')
    expect(third.revised).toBe(true)
    expect(third.message).not.toMatch(/para quando/i)

    // Titulo preservado, data removida: a atividade vai para o backlog.
    expect(third.proposal.payload.title).toMatch(/Francisco/)
    expect(third.proposal.payload.date).toBeUndefined()

    // Uma unica pergunta de data em toda a conversa.
    const perguntas = memory.messages.filter(
      (m) => m.role === 'assistant' && /para quando/i.test(m.content),
    )
    expect(perguntas).toHaveLength(1)

    // E o rascunho continua vivo, agora revisado.
    const draft = await memory.getPending('conv-1')
    expect(draft.phase).toBe('awaiting_confirmation')
    expect(draft.revision).toBe(1)
    expect(draft.data.date_skipped).toBe(true)
  })
})

// ===========================================================================
// 3) AS OUTRAS FRASES EXIGIDAS — cada uma sobre o mesmo rascunho
// ===========================================================================
describe('alteracoes sobre o rascunho vivo', () => {
  it('"muda para sexta" reagenda sem perder o titulo', async () => {
    const { assistant, conversationId } = await draftFrancisco()
    const res = await say(assistant, 'muda para sexta', conversationId)
    expect(res.kind).toBe('proposal')
    expect(res.proposal.payload.date).toBe(SEXTA)
    expect(res.proposal.payload.title).toMatch(/Francisco/)
  })

  it('"sem horário" limpa a hora e mantem o resto', async () => {
    const { assistant, conversationId } = await draftFrancisco()
    await say(assistant, 'às 15h', conversationId)
    const res = await say(assistant, 'sem horário', conversationId)
    expect(res.kind).toBe('proposal')
    expect(res.proposal.payload.start_time).toBeUndefined()
    expect(res.proposal.payload.date).toBe(AMANHA)
  })

  it('"sem horário" NAO faz o agente perguntar o horario logo em seguida', async () => {
    const { assistant, memory } = build()
    const a = await say(assistant, 'Criar reunião com o time amanhã às 15h')
    expect(a.kind).toBe('proposal')
    const b = await say(assistant, 'sem horário', a.conversationId)
    // Dispensar um slot opcional vale como te-lo respondido.
    expect(b.kind).toBe('proposal')
    expect(b.proposal.payload.start_time).toBeUndefined()
    expect(memory.messages.filter((m) => /qual hor/i.test(m.content))).toHaveLength(0)
  })

  it('"coloca prioridade alta" muda so a prioridade', async () => {
    const { assistant, conversationId } = await draftFrancisco()
    const res = await say(assistant, 'coloca prioridade alta', conversationId)
    expect(res.kind).toBe('proposal')
    expect(res.proposal.payload.priority).toBe('high')
    expect(res.proposal.payload.title).toMatch(/Francisco/)
    expect(res.proposal.payload.date).toBe(AMANHA)
  })

  it('"não quero lembrete" e ALTERACAO, nao cancelamento', async () => {
    const { assistant, memory, conversationId } = await draftFrancisco()
    const res = await say(assistant, 'não quero lembrete', conversationId)
    expect(res.kind).toBe('proposal')
    expect(res.proposal.payload.alert_enabled).toBe(false)
    expect(res.proposal.payload.title).toMatch(/Francisco/)
    expect((await memory.getPending('conv-1')).phase).toBe('awaiting_confirmation')
  })

  it('ajustes ENCADEADOS acumulam no mesmo rascunho', async () => {
    const { assistant, conversationId } = await draftFrancisco()
    await say(assistant, 'muda para sexta', conversationId)
    await say(assistant, 'coloca prioridade alta', conversationId)
    const res = await say(assistant, 'não quero lembrete', conversationId)
    expect(res.proposal.payload).toMatchObject({
      date: SEXTA,
      priority: 'high',
      alert_enabled: false,
    })
    expect(res.proposal.payload.title).toMatch(/Francisco/)
  })
})

// ===========================================================================
// 4) CANCELAMENTO e CONFIRMACAO por texto
// ===========================================================================
describe('cancelamento e confirmacao', () => {
  it('"cancela isso" descarta o rascunho — nao procura tarefa chamada "isso"', async () => {
    const { assistant, memory, services, conversationId } = await draftFrancisco()
    const res = await say(assistant, 'cancela isso', conversationId)
    expect(res.kind).toBe('cancelled')
    expect(res.message).not.toMatch(/nao encontrei|não encontrei/i)
    expect(services.tasks.create).not.toHaveBeenCalled()
    expect(await memory.getPending('conv-1')).toBeNull()
  })

  it.each(['esquece', 'deixa pra lá', 'descarta'])('"%s" tambem cancela', async (frase) => {
    const { assistant, conversationId } = await draftFrancisco()
    expect((await say(assistant, frase, conversationId)).kind).toBe('cancelled')
  })

  it('"pode salvar" confirma e cria a atividade de verdade', async () => {
    const { assistant, memory, services, conversationId } = await draftFrancisco()
    const res = await say(assistant, 'pode salvar', conversationId)
    expect(res.kind).toBe('confirmed')
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
    expect(services.tasks.create.mock.calls[0][2]).toMatchObject({ date: AMANHA })
    expect(await memory.getPending('conv-1')).toBeNull()
  })

  it.each(['sim', 'isso mesmo', 'confirma', 'ok', 'perfeito'])('"%s" confirma', async (frase) => {
    const { assistant, conversationId } = await draftFrancisco()
    expect((await say(assistant, frase, conversationId)).kind).toBe('confirmed')
  })

  it('confirmar depois de ajustar salva o valor AJUSTADO', async () => {
    const { assistant, services, conversationId } = await draftFrancisco()
    await say(assistant, 'muda para sexta', conversationId)
    await say(assistant, 'confirma', conversationId)
    expect(services.tasks.create.mock.calls[0][2].date).toBe(SEXTA)
  })
})

// ===========================================================================
// 5) SUBSTITUICAO INEQUIVOCA — o unico jeito de trocar de assunto
// ===========================================================================
describe('nova intencao durante um rascunho', () => {
  it('uma atividade claramente nova substitui o rascunho', async () => {
    const { assistant, memory, conversationId } = await draftFrancisco()
    const res = await say(assistant, 'agendar reunião com o João depois de amanhã às 10h', conversationId)
    expect(res.kind).toBe('proposal')
    expect(res.proposal.payload.title).toMatch(/Jo[aã]o/)
    expect(res.proposal.payload.title).not.toMatch(/Francisco/)
    expect(res.proposal.payload.start_time).toBe('10:00')

    const draft = await memory.getPending('conv-1')
    expect(draft.phase).toBe('awaiting_confirmation')
    expect(draft.data.title).toMatch(/Jo[aã]o/)
  })

  it('uma frase com assunto novo mas sem intencao clara PERGUNTA em vez de adivinhar', async () => {
    const { assistant, memory, conversationId } = await draftFrancisco()
    const res = await say(assistant, 'e o relatório do banco', conversationId)
    expect(res.kind).toBe('clarification')
    expect(res.message).toMatch(/algo novo\?/i)
    // O rascunho NAO foi descartado por uma frase ambigua.
    expect((await memory.getPending('conv-1')).data.title).toMatch(/Francisco/)
  })
})

// ===========================================================================
// 6) PATCH + REVALIDACAO
// ===========================================================================
describe('patch e revalidacao', () => {
  it('tirar a data de um compromisso COM HORA volta a perguntar o dia', async () => {
    const { assistant, memory } = build()
    const a = await say(assistant, 'Marca reunião com os gerentes amanhã às 15h')
    expect(a.kind).toBe('proposal')
    expect(a.proposal.payload.start_time).toBe('15:00')

    const b = await say(assistant, 'deixa sem data', a.conversationId)
    // O patch e valido como texto, mas invalido para o dominio: hora sem dia
    // nao existe na agenda. A conversa volta a fase de pergunta.
    expect(b.kind).toBe('clarification')
    expect(b.message).toMatch(/para quando/i)
    expect((await memory.getPending('conv-1')).phase).toBe('awaiting_slot')

    // E responder o dia fecha de novo, com a hora intacta.
    const c = await say(assistant, 'sexta', a.conversationId)
    expect(c.kind).toBe('proposal')
    expect(c.proposal.payload).toMatchObject({ date: SEXTA, start_time: '15:00' })
  })

  it('applyPatch resolve as interacoes de dominio', () => {
    expect(applyPatch({ date: '2026-09-04' }, { date: null })).toEqual({ date_skipped: true })
    expect(applyPatch({ date_skipped: true }, { date: '2026-09-04' })).toEqual({ date: '2026-09-04' })
    expect(applyPatch({ start_time: '09:00', daypart: 'manha', time_ambiguous: true }, { start_time: null })).toEqual({})
    expect(applyPatch({ daypart: 'tarde' }, { start_time: '15:00' })).toEqual({ start_time: '15:00' })
  })
})

// ===========================================================================
// 7) A CAMADA DETERMINISTICA, ISOLADA
// ===========================================================================
describe('classificacao de turno — unidades', () => {
  const interpOf = (t) => interpretLocal(t, CTX)
  const kindOf = (text) => classifyTurn({ interp: interpOf(text), text, context: CTX }).kind

  it.each([
    ['quero deixar somente no kanban semana', TURN.MODIFY],
    ['muda para sexta', TURN.MODIFY],
    ['sem horário', TURN.MODIFY],
    ['coloca prioridade alta', TURN.MODIFY],
    ['não quero lembrete', TURN.MODIFY],
    ['manda pro backlog', TURN.MODIFY],
    ['na verdade é sexta', TURN.MODIFY],
    ['cancela isso', TURN.CANCEL],
    ['esquece', TURN.CANCEL],
    ['sim', TURN.CONFIRM],
    ['pode salvar', TURN.CONFIRM],
    ['agendar reunião com o João amanhã às 10h', TURN.NEW_INTENT],
  ])('"%s" -> %s', (text, expected) => {
    expect(kindOf(text)).toBe(expected)
  })

  it('o delta VENCE o ato de fala: "não quero lembrete" nao e cancelamento', () => {
    expect(detectSpeechAct('não quero').act).toBe('cancel')
    expect(kindOf('não quero lembrete')).toBe(TURN.MODIFY)
  })

  it('anafora nao conta como assunto novo', () => {
    expect(residualSubject('cancela isso', detectSpeechAct('cancela isso').spans)).toEqual([])
    expect(residualSubject('muda essa tarefa para sexta', extractDelta('muda essa tarefa para sexta', CTX).spans)).toEqual([])
  })

  it('conteudo real conta como assunto novo', () => {
    const t = 'reunião com o João'
    expect(residualSubject(t, extractDelta(t, CTX).spans).length).toBeGreaterThan(0)
  })

  it('extractDelta so acha campos, nunca intencao', () => {
    expect(extractDelta('muda para sexta', CTX).patch).toEqual({ date: SEXTA })
    expect(extractDelta('prioridade baixa', CTX).patch).toEqual({ priority: 'low' })
    expect(extractDelta('deixa no kanban', CTX).patch).toEqual({ date: null })
    expect(extractDelta('bom dia', CTX).empty).toBe(true)
  })
})

// ===========================================================================
// 8) NAO REGREDIR: sem rascunho vivo, tudo segue como antes
// ===========================================================================
describe('sem rascunho vivo o comportamento anterior e preservado', () => {
  it('"cancela isso" SEM rascunho continua sendo busca de tarefa', async () => {
    const { assistant } = build()
    const res = await say(assistant, 'cancela isso')
    expect(res.kind).toBe('clarification')
    expect(res.kind).not.toBe('cancelled')
  })

  it('"sim" isolado nao vira confirmacao de nada', async () => {
    const { assistant, services } = build()
    const res = await say(assistant, 'sim')
    expect(res.kind).toBe('clarification')
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('o slot-filling normal (pergunta -> resposta curta) segue intacto', async () => {
    const { assistant, memory } = build()
    const a = await say(assistant, 'Preciso falar com Francisco amanhã')
    expect(a.slot).toBe('horario')
    expect((await memory.getPending('conv-1')).phase).toBe('awaiting_slot')
    const b = await say(assistant, '8:30', a.conversationId)
    expect(b.proposal.payload).toMatchObject({ date: AMANHA, start_time: '08:30' })
  })
})
