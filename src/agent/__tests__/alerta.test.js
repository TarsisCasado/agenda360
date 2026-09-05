import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'
import { missingSlots, slotQuestion, OPTIONAL_SLOTS } from '../slots'
import { tipoDaProposta, TIPOS } from '../../lib/capture'

// ---------------------------------------------------------------------------
// CP5.8.1 — "me lembra de pagar a conta amanha" NAO pode virar um alerta que
// nunca toca.
//
// O que a auditoria encontrou: o agente nunca ligava `alert_enabled`, entao a
// frase virava uma tarefa comum, sem aviso nenhum — silenciosamente. E se ela
// ligasse, o lembrete tambem nao existiria, porque sem `start_time` o
// `computeRemindAt` devolve null.
//
// Contrato travado aqui:
//   1. o pedido de lembrete LIGA o alerta;
//   2. o alerta EXIGE horario, e o horario e PERGUNTADO (nunca inventado);
//   3. "sem horario" nao dispensa esse slot — dispensar seria desligar o aviso
//      sem dizer, que e a falha silenciosa que este checkpoint elimina;
//   4. exigir horario NAO transforma a tarefa em compromisso.
// ---------------------------------------------------------------------------
const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const HOJE = '2026-08-30'
const AMANHA = '2026-08-31'

function makeMemory() {
  const conversations = new Map()
  const messages = []
  return {
    startConversation: vi.fn(async () => {
      conversations.set('conv-1', { context: {} })
      return 'conv-1'
    }),
    append: vi.fn(async (id, role, content) => {
      messages.push({ id, role, content })
      return {}
    }),
    history: vi.fn(async (id) => messages.filter((m) => m.id === id).map(({ role, content }) => ({ role, content }))),
    getContext: vi.fn(async (id) => conversations.get(id)?.context || {}),
    setContext: vi.fn(async (id, patch) => {
      const cur = conversations.get(id) || { context: {} }
      cur.context = { ...cur.context, ...patch }
      conversations.set(id, cur)
      return cur.context
    }),
    getPending: vi.fn(async (id) => conversations.get(id)?.context?.pending || null),
    setPending: vi.fn(async (id, pending) => {
      const cur = conversations.get(id) || { context: {} }
      cur.context = { ...cur.context, pending }
      conversations.set(id, cur)
    }),
    clearPending: vi.fn(async (id) => {
      const cur = conversations.get(id) || { context: {} }
      cur.context = { ...cur.context, pending: null }
      conversations.set(id, cur)
    }),
  }
}

function build() {
  const services = {
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
  const flags = createFeatureFlags()
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const runtime = createAgentRuntime({
    registry,
    aiActions: { recordProposed: vi.fn(async () => 'act-1'), recordResult: vi.fn(async () => {}) },
    eventBus,
  })
  const contextEngine = {
    build: vi.fn(async () => ({
      today: HOJE, now: '20:50', categories: [],
      timezone: 'America/Fortaleza', recentTasks: [], overdueTasks: [],
    })),
  }
  const assistant = createAssistant({
    registry, runtime, providerManager: createProviderManager({ flags }), contextEngine,
    memory: makeMemory(),
  })
  return { assistant, services }
}

describe('a regra do alerta na camada de slots', () => {
  it('alerta ligado sem hora é um slot FALTANTE', () => {
    const falta = missingSlots('create_task', {
      title: 'Pagar a conta', date: AMANHA, alert_enabled: true,
    })
    expect(falta).toContain('horario_alerta')
  })

  it('com hora, não falta nada', () => {
    const falta = missingSlots('create_task', {
      title: 'Pagar a conta', date: AMANHA, start_time: '09:00', alert_enabled: true,
    })
    expect(falta).not.toContain('horario_alerta')
  })

  it('sem alerta, tarefa comum não é interrogada sobre horário', () => {
    const falta = missingSlots('create_task', { title: 'Pagar a conta', date: AMANHA })
    expect(falta).toEqual([])
  })

  it('NÃO é opcional: "sem horário" não dispensa o slot do alerta', () => {
    expect(OPTIONAL_SLOTS.has('horario_alerta')).toBe(false)
  })

  it('a pergunta usa a frase do produto', () => {
    expect(slotQuestion('horario_alerta')).toMatch(/Para avisar você, preciso saber o horário/i)
  })
})

describe('Copiloto — "me lembra de pagar a conta amanhã"', () => {
  it('pergunta o horário e NÃO cria nada antes de tê-lo', async () => {
    const { assistant, services } = build()
    const r = await assistant.ask({ text: 'me lembra de pagar a conta amanha', identity: IDENTITY })
    expect(r.kind).toBe('clarification')
    expect(r.message).toMatch(/preciso saber o horário/i)
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('com o horário respondido, a proposta sai com alerta e hora', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'me lembra de pagar a conta amanha', identity: IDENTITY })
    const b = await assistant.ask({ text: '9h', identity: IDENTITY, conversationId: a.conversationId })
    expect(b.kind).toBe('proposal')
    expect(b.proposal.payload).toMatchObject({
      date: AMANHA,
      start_time: '09:00',
      alert_enabled: true,
    })
  })

  it('e continua sendo uma TAREFA — a hora é do aviso, não de um encontro', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'me lembra de pagar a conta amanha', identity: IDENTITY })
    const b = await assistant.ask({ text: '9h', identity: IDENTITY, conversationId: a.conversationId })
    expect(tipoDaProposta(b.proposal)).toEqual(TIPOS.tarefa)
  })

  it('uma reunião com hora continua sendo COMPROMISSO', async () => {
    const { assistant } = build()
    const r = await assistant.ask({
      text: 'Reuniao com gerentes amanha as 8:30', identity: IDENTITY,
    })
    expect(r.kind).toBe('proposal')
    expect(tipoDaProposta(r.proposal)).toEqual(TIPOS.compromisso)
  })

  it('sem pedido de lembrete, nada de alerta ligado por conta própria', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'Marcar dentista', identity: IDENTITY })
    const b = await assistant.ask({ text: 'sem data', identity: IDENTITY, conversationId: a.conversationId })
    expect(b.proposal.payload.alert_enabled).toBeUndefined()
  })
})
