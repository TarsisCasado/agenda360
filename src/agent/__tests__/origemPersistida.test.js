import { describe, it, expect, vi } from 'vitest'

// CP6.4.4 B — a ORIGEM da interpretacao sobrevive ao remount.
// Supabase ligado como espiao (sem rede/Gemini). `edgeInvoke` injetado decide
// remoto OK / remoto caido; a flag decide remoto ligado / local.
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: vi.fn() } },
}))

import { createProviderManager, SOURCE } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createEventBus } from '../eventBus'

const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const CTX = { today: '2026-09-09', now: '10:00', timezone: 'America/Fortaleza', categories: [], history: [], pending: null }

const CRIACAO = {
  version: 1, provider: 'gemini', turn_kind: 'create', refers_to_draft: false,
  intent: 'create_task', confidence: 0.95,
  patch: { title: 'Reunião com os gerentes', date: '2026-09-10', start_time: '08:00', kind: 'compromisso' },
  needs_clarification: false, clarification: null, ambiguities: [], rejected: [],
}

function makeMemory() {
  const conversations = new Map()
  const messages = []
  return {
    startConversation: vi.fn(async () => { conversations.set('conv-1', { context: {} }); return 'conv-1' }),
    append: vi.fn(async (id, role, content, metadata = {}) => { messages.push({ id, role, content, metadata }); return {} }),
    history: vi.fn(async (id) => messages.filter((m) => m.id === id).map(({ role, content }) => ({ role, content }))),
    getContext: vi.fn(async (id) => conversations.get(id)?.context || {}),
    setContext: vi.fn(async (id, patch) => {
      const cur = conversations.get(id) || { context: {} }
      cur.context = { ...cur.context, ...patch }; conversations.set(id, cur); return cur.context
    }),
    getPending: vi.fn(async (id) => conversations.get(id)?.context?.pending || null),
    setPending: vi.fn(async (id, pending) => {
      const cur = conversations.get(id) || { context: {} }
      cur.context = { ...cur.context, pending }; conversations.set(id, cur)
    }),
    clearPending: vi.fn(async (id) => {
      const cur = conversations.get(id) || { context: {} }
      cur.context = { ...cur.context, pending: null }; conversations.set(id, cur)
    }),
  }
}

function build({ remote = false, edgeInvoke } = {}) {
  const flags = createFeatureFlags(remote ? { 'ai.remote': true } : {})
  const services = {
    tasks: {
      create: vi.fn(async (ws, uid, data) => ({ id: 't1', date: null, ...data })),
      list: vi.fn(async () => []), getById: vi.fn(async () => null),
      update: vi.fn(async () => ({})), changeStatus: vi.fn(async () => ({})),
      reschedule: vi.fn(async () => ({})), remove: vi.fn(async () => {}),
    },
    links: { create: vi.fn(async () => ({ id: 'l1' })) },
  }
  const memory = makeMemory()
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const aiActions = { recordProposed: vi.fn(async () => 'a1'), recordResult: vi.fn(async () => {}) }
  const runtime = createAgentRuntime({ registry, aiActions, eventBus })
  const contextEngine = { build: vi.fn(async () => ({ ...CTX, recentTasks: [], overdueTasks: [] })) }
  const providerManager = createProviderManager({ flags, edgeInvoke })
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, memory, services }
}

describe('CP6.4.4 B — origem persistida + fallback offline', () => {
  it('5+10 remote: edge OK -> source remote e sobrevive ao resume', async () => {
    const { assistant } = build({ remote: true, edgeInvoke: vi.fn(async () => CRIACAO) })
    const a = await assistant.ask({ text: 'Reunião com gerentes amanhã 8h', identity: IDENTITY })
    expect(a.interpretation_source).toBe(SOURCE.REMOTE)
    const r = await assistant.resume({ conversationId: a.conversationId })
    expect(r.source).toBe(SOURCE.REMOTE)
  })

  it('5+8+9 fallback: edge cai -> source remote_fallback e sobrevive ao resume', async () => {
    const edge = vi.fn(async () => { throw new Error('offline: fetch failed') })
    const { assistant, services } = build({ remote: true, edgeInvoke: edge })
    const a = await assistant.ask({ text: 'criar tarefa comprar café amanhã', identity: IDENTITY })
    expect(edge).toHaveBeenCalled()
    expect(a.interpretation_source).toBe(SOURCE.FALLBACK)     // 8: rotulo (IA indisponivel)
    expect(a.kind).toBeTruthy()                                // 7: o turno CONCLUI local
    expect(services.tasks.create).not.toHaveBeenCalled()       // 12: nada criado sem confirmar
    const r = await assistant.resume({ conversationId: a.conversationId })
    expect(r.source).toBe(SOURCE.FALLBACK)                     // 9: sobrevive ao remount
    expect(Array.isArray(r.messages)).toBe(true)               // 11: conversa/draft nao corrompidos
  })

  it('10 local: flag desligada -> source local e sobrevive ao resume', async () => {
    const { assistant } = build({ remote: false })
    const a = await assistant.ask({ text: 'comprar café amanhã', identity: IDENTITY })
    expect(a.interpretation_source).toBe(SOURCE.LOCAL)
    const r = await assistant.resume({ conversationId: a.conversationId })
    expect(r.source).toBe(SOURCE.LOCAL)
  })

  it('nao persiste fallback_reason nem mensagem de provider no contexto', async () => {
    const { assistant, memory } = build({
      remote: true,
      edgeInvoke: vi.fn(async () => { throw new Error('GEMINI_API_KEY invalida em https://interno') }),
    })
    const a = await assistant.ask({ text: 'comprar café amanhã', identity: IDENTITY })
    const ctx = await memory.getContext(a.conversationId)
    expect(ctx.last_source).toBe(SOURCE.FALLBACK)
    expect(JSON.stringify(ctx)).not.toMatch(/GEMINI|https:|invalida|fallback_reason/i)
  })
})
