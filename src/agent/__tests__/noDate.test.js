import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'
import { resolveTemporalAnswer } from '../nlu/temporal'
import { applyAnswer, missingSlots, stripInternal } from '../slots'

// ---------------------------------------------------------------------------
// "SEM DATA" — recusa deliberada de data como RESPOSTA VALIDA.
//
// Regressao do P0 encontrado no QA em iPhone: ao responder "Sem data definida,
// coloque em tarefas a fazer" a pergunta "Para quando e...?", o assistente
// repetia "Nao consegui entender essa parte" indefinidamente.
//
// A correcao e deterministica e vale para QUALQUER provider:
//   - temporal.js reconhece a recusa (NO_DATE_PATTERNS) -> { noDate: true };
//   - slots.js aceita como resposta e marca `date_skipped`;
//   - a data deixa de ser slot faltante -> a pergunta NAO se repete;
//   - o payload vai sem `date` (a tarefa nasce em "a fazer").
//
// Hoje = domingo 2026-08-23 / 19:06.
// ---------------------------------------------------------------------------
const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const TODAY = '2026-08-23'

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
      // Espelha o default REAL do taskService: sem data -> date null.
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
  const providerManager = createProviderManager({ flags })
  const contextEngine = {
    build: vi.fn(async () => ({
      today: TODAY,
      now: '19:06',
      timezone: 'America/Fortaleza',
      categories: [],
      recentTasks: [],
      overdueTasks: [],
    })),
  }
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, memory, services }
}

const say = (assistant, text, conversationId) =>
  assistant.ask({ text, identity: IDENTITY, conversationId })

const dateQuestions = (memory) =>
  memory.messages.filter((m) => m.role === 'assistant' && /para quando/i.test(m.content))

// ---------------------------------------------------------------------------
// 1) A CAMADA TEMPORAL reconhece a recusa (semantica, nao a frase do teste).
// ---------------------------------------------------------------------------
describe('resolveTemporalAnswer — recusa de data', () => {
  const VARIANTS = [
    'sem data',
    'Sem data definida',
    'Sem data definida, coloque em tarefas a fazer',
    'não tem data',
    'nao tem prazo',
    'não precisa de data',
    'deixa sem data',
    'deixe sem data',
    'pode deixar sem data',
    'coloque sem data',
    'coloca nas tarefas',
    'deixa nas tarefas',
    'coloque em tarefas a fazer',
    'sem prazo',
    'ainda não defini',
    'ainda não sei a data',
    'data a definir',
  ]

  it.each(VARIANTS)('"%s" -> noDate', (phrase) => {
    const r = resolveTemporalAnswer(phrase, { today: TODAY, now: '19:06' })
    expect(r.noDate).toBe(true)
    expect(r.date).toBeFalsy()
  })

  it('uma data EXPLICITA continua vencendo a recusa', () => {
    const r = resolveTemporalAnswer('ainda não defini, mas pode ser amanhã', {
      today: TODAY,
      now: '19:06',
    })
    expect(r.noDate).toBeUndefined()
    expect(r.date).toBe('2026-08-24')
  })

  it('respostas normais de data/hora NAO viram recusa', () => {
    for (const ok of ['amanhã', 'sexta', '12/09', '8:30', 'de manhã', 'depois do almoço']) {
      expect(resolveTemporalAnswer(ok, { today: TODAY, now: '19:06' }).noDate).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// 2) A CAMADA DE SLOTS aceita a recusa — e a recusa some do payload.
// ---------------------------------------------------------------------------
describe('slots — date_skipped', () => {
  it('aceita a recusa e nao pede mais a data', () => {
    const applied = applyAnswer({
      slot: 'data',
      data: { title: 'Revisar contrato' },
      text: 'Sem data definida, coloque em tarefas a fazer',
      context: { today: TODAY, now: '19:06' },
    })
    expect(applied.resolved).toBe(true)
    expect(applied.data.date).toBeNull()
    expect(applied.data.date_skipped).toBe(true)
    expect(missingSlots('create_task', applied.data)).toEqual([])
  })

  it('nao pergunta horario depois de dispensar a data (mesmo em titulo de reuniao)', () => {
    const applied = applyAnswer({
      slot: 'data',
      data: { title: 'Reunião com os gerentes' },
      text: 'sem data',
      context: { today: TODAY, now: '19:06' },
    })
    expect(applied.resolved).toBe(true)
    expect(missingSlots('create_task', applied.data)).toEqual([])
  })

  it('compromisso com HORA marcada continua exigindo dia', () => {
    const applied = applyAnswer({
      slot: 'data',
      data: { title: 'Reunião com os gerentes', start_time: '15:00' },
      text: 'sem data',
      context: { today: TODAY, now: '19:06' },
    })
    expect(applied.resolved).toBe(false)
    expect(applied.reason).toBe('needs_date_for_time')
    expect(missingSlots('create_task', applied.data)).toContain('data')
  })

  it('date_skipped e campo INTERNO: nunca chega a ferramenta', () => {
    expect(stripInternal({ title: 'X', date: null, date_skipped: true })).toEqual({
      title: 'X',
      date: null,
    })
  })
})

// ---------------------------------------------------------------------------
// 3) PONTA A PONTA — o fluxo exato do QA.
// ---------------------------------------------------------------------------
describe('QA: "Criar tarefa revisar contrato" -> "Sem data definida, coloque em tarefas a fazer"', () => {
  it('vira proposta SEM data, com o titulo preservado e sem repetir a pergunta', async () => {
    const { assistant, memory } = build()

    const first = await say(assistant, 'Criar tarefa revisar contrato')
    expect(first.kind).toBe('clarification')
    expect(first.slot).toBe('data')

    const second = await say(
      assistant,
      'Sem data definida, coloque em tarefas a fazer',
      first.conversationId,
    )

    expect(second.kind).toBe('proposal')
    expect(second.continued).toBe(true)
    // Titulo preservado do primeiro turno.
    expect(second.proposal.payload.title).toBe('Revisar contrato')
    // Sem data: a chave nao chega a ferramenta (o taskService grava null).
    expect(second.proposal.payload.date).toBeUndefined()
    expect(second.proposal.payload.start_time).toBeUndefined()
    // Campo interno nao vaza.
    expect(second.proposal.payload.date_skipped).toBeUndefined()
    // A pergunta de data foi feita UMA vez e nao voltou.
    expect(dateQuestions(memory)).toHaveLength(1)
    expect(second.message).not.toMatch(/não consegui entender/i)
    expect(await memory.getPending('conv-1')).toBeNull()
  })

  it('a tarefa criada fica com date null', async () => {
    const { assistant, services } = build()
    const first = await say(assistant, 'Criar tarefa revisar contrato')
    const second = await say(assistant, 'sem data', first.conversationId)
    const done = await assistant.confirm({
      proposal: second.proposal,
      identity: IDENTITY,
      conversationId: second.conversationId,
    })
    expect(done.kind).toBe('confirmed')
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
    expect(services.tasks.create.mock.calls[0][2].date).toBeUndefined()
    expect(done.result.date).toBeNull()
  })

  it.each([
    'não tem data',
    'não precisa de data',
    'pode deixar sem data',
    'coloca nas tarefas',
    'sem prazo',
    'ainda não sei a data',
  ])('variação "%s" tambem resolve em um unico turno', async (phrase) => {
    const { assistant, memory } = build()
    const first = await say(assistant, 'Criar tarefa revisar contrato')
    const second = await say(assistant, phrase, first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.proposal.payload.title).toBe('Revisar contrato')
    expect(second.proposal.payload.date).toBeUndefined()
    expect(dateQuestions(memory)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 4) NAO PODE contaminar compromissos de agenda que precisam de data/hora.
// ---------------------------------------------------------------------------
describe('compromissos com horario continuam exigindo dia', () => {
  it('"reunião com os gerentes às 15h" + "sem data" -> pergunta o dia de novo, com o motivo', async () => {
    const { assistant, memory } = build()

    const first = await say(assistant, 'Marca reunião com os gerentes às 15h')
    expect(first.kind).toBe('clarification')
    expect(first.slot).toBe('data')

    const second = await say(assistant, 'sem data', first.conversationId)
    expect(second.kind).toBe('clarification')
    expect(second.slot).toBe('data')
    expect(second.message).toMatch(/precisa de um dia/i)
    // A pendencia continua viva, com o horario intacto.
    const pending = await memory.getPending('conv-1')
    expect(pending.data.start_time).toBe('15:00')
    expect(pending.data.date_skipped).toBeUndefined()

    // E o dia informado depois fecha a proposta normalmente.
    const third = await say(assistant, 'amanhã', first.conversationId)
    expect(third.kind).toBe('proposal')
    expect(third.proposal.payload).toMatchObject({ date: '2026-08-24', start_time: '15:00' })
  })

  it('"sem data" NAO vira recusa quando ha data explicita no mesmo turno', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'Criar tarefa revisar contrato')
    const second = await say(assistant, 'sem data não, é sexta', first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.proposal.payload.date).toBe('2026-08-28')
  })
})
