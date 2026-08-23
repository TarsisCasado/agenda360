import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'

// ---------------------------------------------------------------------------
// CONTEXTO MULTI-TURNO / SLOT-FILLING — ponta a ponta pelo assistant real
// (registry + runtime + provider local + memoria). O unico dublê e a memoria,
// que aqui vive em objeto simples com a MESMA interface de
// conversationMemory (ai_conversations.context / ai_messages).
//
// Hoje = domingo 2026-08-23 / 19:06. Amanha = 2026-08-24. Sexta = 2026-08-28.
// ---------------------------------------------------------------------------
const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const AMANHA = '2026-08-24'
const SEXTA = '2026-08-28'

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
    history: vi.fn(async (id) => messages.filter((m) => m.id === id).map(({ role, content }) => ({ role, content }))),
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
      create: vi.fn(async (ws, uid, data) => ({ id: 'task-new', ...data })),
      update: vi.fn(async (uid, task, patch) => ({ ...task, ...patch })),
      changeStatus: vi.fn(async (uid, task, status) => ({ ...task, status })),
      reschedule: vi.fn(async (uid, task, date) => ({ ...task, date })),
      remove: vi.fn(async () => {}),
      list: vi.fn(async () => [
        { id: 't1', title: 'Reuniao com gerentes', date: AMANHA, status: 'todo' },
      ]),
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
  // Provider REAL do modo local (sem rede, sem chave): mesma camada semantica
  // que roda hoje em Preview/Production.
  const providerManager = createProviderManager({ flags })
  const contextEngine = {
    build: vi.fn(async () => ({
      today: '2026-08-23',
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

// Helper: manda uma mensagem mantendo a conversa.
async function say(assistant, text, conversationId) {
  return assistant.ask({ text, identity: IDENTITY, conversationId })
}

describe('A) "Preciso falar com Francisco amanhã" -> "Qual horário?" -> "8:30"', () => {
  it('a segunda mensagem COMPLETA a primeira (nao inicia outra conversa)', async () => {
    const { assistant, memory } = build()

    const first = await say(assistant, 'Preciso falar com Francisco amanhã')
    expect(first.kind).toBe('clarification')
    expect(first.slot).toBe('horario')
    expect(first.message).toMatch(/hor[aá]rio/i)
    // A intencao ficou PENDENTE em ai_conversations.context.
    const pending = await memory.getPending('conv-1')
    expect(pending.intent).toBe('create_task')
    expect(pending.data.title).toBe('Falar com Francisco')
    expect(pending.data.date).toBe(AMANHA)
    expect(pending.awaiting).toBe('horario')

    const second = await say(assistant, '8:30', first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.continued).toBe(true)
    expect(second.proposal.payload).toMatchObject({
      title: 'Falar com Francisco',
      date: AMANHA,
      start_time: '08:30',
    })
    // Pendencia encerrada apos virar proposta.
    expect(await memory.getPending('conv-1')).toBeNull()
  })

  it('"8:30" sozinho, SEM conversa anterior, nao vira tarefa nenhuma', async () => {
    const { assistant } = build()
    const res = await say(assistant, '8:30')
    expect(res.kind).toBe('clarification')
    expect(res.proposal).toBeUndefined()
  })
})

describe('B) "Marca reunião com os gerentes sexta" -> "depois do almoço"', () => {
  it('o periodo completa o turno e NAO vira horario inventado', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'Marca reunião com os gerentes sexta')
    expect(first.kind).toBe('clarification')
    expect(first.slot).toBe('horario')

    const second = await say(assistant, 'depois do almoço', first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.proposal.payload.date).toBe(SEXTA)
    expect(second.proposal.payload.start_time).toBeUndefined()
    expect(second.proposal.payload.notes).toBe('Depois do almoço')
    expect(second.proposal.payload.title.toLowerCase()).toContain('gerentes')
  })

  it('"sem horário" encerra o slot sem inventar hora', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'Marca reunião com os gerentes sexta')
    const second = await say(assistant, 'sem horário', first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.proposal.payload.start_time).toBeUndefined()
    expect(second.proposal.payload.date).toBe(SEXTA)
  })
})

describe('C) "Preciso resolver isso" -> pergunta SO a data', () => {
  it('pergunta a data e completa com "amanhã"', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'Preciso resolver isso')
    expect(first.kind).toBe('clarification')
    expect(first.slot).toBe('data')
    expect(first.message).toMatch(/quando/i)

    const second = await say(assistant, 'amanhã', first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.proposal.payload.date).toBe(AMANHA)
    expect(second.proposal.payload.title).toBe('Resolver isso')
    expect(second.proposal.payload.start_time).toBeUndefined()
  })
})

describe('D) hora ambigua ("às 9") pergunta SO o periodo', () => {
  it('"de manhã" mantem 09:00', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'sexta tenho reunião com o Jander às 9')
    expect(first.slot).toBe('periodo')
    expect(first.message).toMatch(/manh[aã]|noite/i)
    const second = await say(assistant, 'de manhã', first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.proposal.payload.start_time).toBe('09:00')
    expect(second.proposal.payload.date).toBe(SEXTA)
  })

  it('"da noite" vira 21:00', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'sexta tenho reunião com o Jander às 9')
    const second = await say(assistant, 'da noite', first.conversationId)
    expect(second.proposal.payload.start_time).toBe('21:00')
  })

  it('"às 08:30" NAO pergunta nada (interpretacao segura)', async () => {
    const { assistant } = build()
    const res = await say(assistant, 'Reunião com gerentes amanhã às 08:30h')
    expect(res.kind).toBe('proposal')
    expect(res.proposal.payload.start_time).toBe('08:30')
    expect(res.proposal.payload.date).toBe(AMANHA)
    expect(res.proposal.payload.title).toBe('Reunião com gerentes')
  })
})

describe('E) "semana que vem" -> pergunta o dia, nunca escolhe sozinho', () => {
  it('pergunta o dia e aceita "terça"', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'preciso resolver o problema da Renault semana que vem')
    expect(first.slot).toBe('dia_da_semana')
    const second = await say(assistant, 'terça', first.conversationId)
    expect(second.kind).toBe('proposal')
    expect(second.proposal.payload.date).toBe('2026-08-25')
    expect(second.proposal.payload.title).toBe('Resolver o problema da Renault')
  })
})

describe('F) troca de assunto no meio do slot-filling', () => {
  it('uma consulta clara abandona a intencao pendente em vez de "responder" o slot', async () => {
    const { assistant, memory } = build()
    const first = await say(assistant, 'Preciso falar com Francisco amanhã')
    expect(first.slot).toBe('horario')

    const second = await say(assistant, 'O que tenho amanhã?', first.conversationId)
    expect(second.kind).toBe('result') // leitura executada
    expect(Array.isArray(second.result)).toBe(true)
    expect(await memory.getPending('conv-1')).toBeNull()
  })

  it('resposta que nao serve ao slot repete a pergunta SEM perder o contexto', async () => {
    const { assistant, memory } = build()
    const first = await say(assistant, 'Preciso resolver isso')
    expect(first.slot).toBe('data')
    const second = await say(assistant, 'sei la', first.conversationId)
    expect(second.kind).toBe('clarification')
    const pending = await memory.getPending('conv-1')
    expect(pending.data.title).toBe('Resolver isso') // contexto preservado
  })
})

describe('G) protecoes de acao no fluxo completo', () => {
  it('consulta executa leitura e nunca cria tarefa', async () => {
    const { assistant, services } = build()
    const res = await say(assistant, 'Tenho alguma coisa sexta?')
    expect(res.kind).toBe('result')
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('conclusao vira proposta de complete_task (nunca create_task)', async () => {
    const { assistant, services } = build()
    const res = await say(assistant, 'Conclui a tarefa reunião com gerentes')
    expect(res.kind).toBe('proposal')
    expect(res.proposal.intent).toBe('complete_task')
    expect(res.proposal.requiresConfirmation).toBe(true)
    expect(services.tasks.create).not.toHaveBeenCalled()
    expect(services.tasks.changeStatus).not.toHaveBeenCalled() // so apos confirmar
  })

  it('acao em massa e recusada', async () => {
    const { assistant, services } = build()
    const res = await say(assistant, 'exclua todas as tarefas')
    expect(res.kind).toBe('clarification')
    expect(res.message.toLowerCase()).toContain('massa')
    expect(services.tasks.remove).not.toHaveBeenCalled()
  })

  it('escrita so acontece depois da confirmacao explicita', async () => {
    const { assistant, services } = build()
    const res = await say(assistant, 'Reunião com gerentes amanhã às 08:30h')
    expect(services.tasks.create).not.toHaveBeenCalled()
    await assistant.confirm({ proposal: res.proposal, identity: IDENTITY, conversationId: res.conversationId })
    expect(services.tasks.create).toHaveBeenCalledWith(
      'w1',
      'u1',
      expect.objectContaining({ title: 'Reunião com gerentes', date: AMANHA, start_time: '08:30' }),
    )
  })

  it('campos internos de slot nunca chegam ao payload da ferramenta', async () => {
    const { assistant } = build()
    const first = await say(assistant, 'preciso resolver o problema da Renault semana que vem')
    const second = await say(assistant, 'terça', first.conversationId)
    expect(second.proposal.payload.date_range).toBeUndefined()
    expect(second.proposal.payload.time_ambiguous).toBeUndefined()
    expect(second.proposal.payload.daypart).toBeUndefined()
  })
})
