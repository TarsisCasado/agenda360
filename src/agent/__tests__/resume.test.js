import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'

// ---------------------------------------------------------------------------
// CP5.7.1 — RETOMAR A CONVERSA.
//
// A regressao do QA: conversa visivel no Copiloto, F5, tudo sumiu. O dado
// nunca se perdeu — `ai_messages` e `context.pending` continuavam la, nos dois
// modos. O que faltava era a tela ter como PEDIR de volta.
//
// Aqui trava-se o contrato de `resume`: ele le, nao avanca. Depois de retomar,
// a conversa tem de continuar sendo a MESMA entidade — senao o multi-turno
// morre no refresh, que era a metade invisivel do bug.
// ---------------------------------------------------------------------------
const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const CTX = { today: '2026-08-30', now: '20:50', categories: [] }

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
  const memory = makeMemory()
  const flags = createFeatureFlags()
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const aiActions = { recordProposed: vi.fn(async () => 'act-1'), recordResult: vi.fn(async () => {}) }
  const runtime = createAgentRuntime({ registry, aiActions, eventBus })
  const contextEngine = {
    build: vi.fn(async () => ({ ...CTX, timezone: 'America/Fortaleza', recentTasks: [], overdueTasks: [] })),
  }
  const assistant = createAssistant({
    registry,
    runtime,
    providerManager: createProviderManager({ flags }),
    contextEngine,
    memory,
  })
  return { assistant, memory, services }
}

describe('resume — o refresh não apaga a conversa', () => {
  it('sem conversa, devolve vazio (e não inventa nada)', async () => {
    const { assistant } = build()
    const r = await assistant.resume({ conversationId: null })
    expect(r).toEqual({ conversationId: null, messages: [], pending: null })
  })

  it('devolve as falas já salvas', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'Marcar dentista', identity: IDENTITY })
    const r = await assistant.resume({ conversationId: a.conversationId })
    expect(r.messages.length).toBeGreaterThan(0)
    expect(r.messages.some((m) => m.role === 'user' && /dentista/i.test(m.content))).toBe(true)
  })

  it('devolve a PERGUNTA em aberto como slot pendente, sem cartão de proposta', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'Marcar dentista', identity: IDENTITY })
    expect(a.kind).toBe('clarification')
    const r = await assistant.resume({ conversationId: a.conversationId })
    expect(r.pending?.phase).toBe('awaiting_slot')
    expect(r.pending?.proposal).toBeUndefined()
  })

  it('devolve a PROPOSTA aguardando confirmação, com o payload inteiro', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'Marcar dentista', identity: IDENTITY })
    const b = await assistant.ask({ text: 'sem data', identity: IDENTITY, conversationId: a.conversationId })
    expect(b.kind).toBe('proposal')
    const r = await assistant.resume({ conversationId: a.conversationId })
    expect(r.pending?.phase).toBe('awaiting_confirmation')
    expect(r.pending?.proposal?.payload?.title).toMatch(/dentista/i)
  })

  it('depois de retomar, a conversa continua sendo a MESMA — o ajuste não vira tarefa nova', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'Marcar dentista', identity: IDENTITY })
    const b = await assistant.ask({ text: 'sem data', identity: IDENTITY, conversationId: a.conversationId })
    expect(b.kind).toBe('proposal')

    // O "refresh": nada em memoria, so o id guardado.
    const r = await assistant.resume({ conversationId: a.conversationId })
    const c = await assistant.ask({
      text: 'muda para sexta',
      identity: IDENTITY,
      conversationId: r.conversationId,
    })
    expect(c.kind).toBe('proposal')
    expect(c.revised).toBe(true)
    // Mesma atividade, data nova — e nao uma segunda "sexta" do nada.
    expect(c.proposal.payload.title).toMatch(/dentista/i)
    expect(c.proposal.payload.date).toBe('2026-09-04')
  })

  it('confirmar encerra o rascunho: retomar depois NÃO traz a proposta de volta', async () => {
    const { assistant } = build()
    const a = await assistant.ask({ text: 'Marcar dentista', identity: IDENTITY })
    const b = await assistant.ask({ text: 'sem data', identity: IDENTITY, conversationId: a.conversationId })
    await assistant.confirm({
      proposal: b.proposal,
      identity: IDENTITY,
      conversationId: a.conversationId,
    })
    const r = await assistant.resume({ conversationId: a.conversationId })
    expect(r.pending).toBeNull()
    // O historico continua — o que acabou foi o rascunho, nao a conversa.
    expect(r.messages.length).toBeGreaterThan(0)
  })

  it('leitura pura: retomar não escreve nada nem executa ação', async () => {
    const { assistant, memory, services } = build()
    const a = await assistant.ask({ text: 'Marcar dentista', identity: IDENTITY })
    memory.append.mockClear()
    services.tasks.create.mockClear()
    await assistant.resume({ conversationId: a.conversationId })
    expect(memory.append).not.toHaveBeenCalled()
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('memória indisponível não derruba a tela — retoma vazio', async () => {
    const { assistant, memory } = build()
    memory.history.mockRejectedValueOnce(new Error('offline'))
    memory.getPending.mockRejectedValueOnce(new Error('offline'))
    const r = await assistant.resume({ conversationId: 'conv-1' })
    expect(r).toEqual({ conversationId: 'conv-1', messages: [], pending: null })
  })
})
