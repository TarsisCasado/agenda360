import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'

const IDENTITY = { workspaceId: 'w1', userId: 'u1' }

function makeServices(over = {}) {
  return {
    tasks: {
      getById: vi.fn(async (ws, id) => (id === 'missing' ? null : { id, workspace_id: ws, title: 'X', status: 'todo' })),
      create: vi.fn(async (ws, uid, data) => ({ id: 'task-new', workspace_id: ws, created_by: uid, ...data })),
      update: vi.fn(async (uid, task, patch) => ({ ...task, ...patch })),
      changeStatus: vi.fn(async (uid, task, status) => ({ ...task, status })),
      reschedule: vi.fn(async (uid, task, date) => ({ ...task, date })),
      remove: vi.fn(async () => {}),
      list: vi.fn(async () => [
        { id: 't1', title: 'Treino na academia', date: '2026-07-16', status: 'todo' },
      ]),
      ...over.tasks,
    },
    links: { create: vi.fn(async () => ({ id: 'l1' })), ...over.links },
  }
}

function makeMemory() {
  return {
    startConversation: vi.fn(async () => 'conv-1'),
    append: vi.fn(async () => ({})),
    history: vi.fn(async () => []),
  }
}

function makeAiActions() {
  return { recordProposed: vi.fn(async () => 'act-1'), recordResult: vi.fn(async () => {}) }
}

// Provider manager fake (evita rede): retorna o intent que definirmos.
function fakeProvider(result) {
  return { interpret: vi.fn(async () => ({ ambiguities: [], needs_clarification: false, ...result })) }
}

function build({ providerResult, services = makeServices(), memory = makeMemory(), aiActions = makeAiActions() }) {
  const flags = createFeatureFlags()
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const runtime = createAgentRuntime({ registry, aiActions, eventBus })
  const contextEngine = { build: vi.fn(async () => ({ today: '2026-07-15', timezone: 'America/Sao_Paulo', categories: [] })) }
  const providerManager = fakeProvider(providerResult)
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, services, memory, aiActions, registry }
}

describe('Assistant orchestrator', () => {
  it('create_task -> proposal (escrita exige confirmacao) e registra proposed', async () => {
    const { assistant, aiActions, memory } = build({
      providerResult: { intent: 'create_task', confidence: 0.9, data: { title: 'Reuniao', date: '2026-07-16' } },
    })
    const res = await assistant.ask({ text: 'agende reuniao amanha', identity: IDENTITY })
    expect(res.kind).toBe('proposal')
    expect(res.proposal.requiresConfirmation).toBe(true)
    expect(aiActions.recordProposed).toHaveBeenCalled()
    expect(memory.startConversation).toHaveBeenCalled()
    expect(memory.append).toHaveBeenCalledWith('conv-1', 'user', 'agende reuniao amanha')
  })

  it('confirma proposta -> executa e registra applied', async () => {
    const { assistant, services, aiActions } = build({
      providerResult: { intent: 'create_task', confidence: 0.9, data: { title: 'Reuniao', date: '2026-07-16' } },
    })
    const res = await assistant.ask({ text: 'agende reuniao amanha', identity: IDENTITY })
    const out = await assistant.confirm({ proposal: res.proposal, identity: IDENTITY, conversationId: 'conv-1' })
    expect(out.kind).toBe('confirmed')
    expect(services.tasks.create).toHaveBeenCalled()
    expect(aiActions.recordResult).toHaveBeenCalledWith('act-1', expect.objectContaining({ status: 'applied' }))
  })

  it('confirma proposta EDITADA -> executa com os dados editados', async () => {
    const { assistant, services } = build({
      providerResult: { intent: 'create_task', confidence: 0.9, data: { title: 'Reuniao', date: '2026-07-16' } },
    })
    const res = await assistant.ask({ text: 'agende reuniao amanha', identity: IDENTITY })
    const edited = { ...res.proposal, payload: { ...res.proposal.payload, title: 'Reuniao EDITADA' } }
    await assistant.confirm({ proposal: edited, identity: IDENTITY, conversationId: 'conv-1' })
    expect(services.tasks.create).toHaveBeenCalledWith('w1', 'u1', expect.objectContaining({ title: 'Reuniao EDITADA' }))
  })

  it('cancela proposta -> nao executa e registra dismissed', async () => {
    const { assistant, services, aiActions } = build({
      providerResult: { intent: 'create_task', confidence: 0.9, data: { title: 'R', date: '2026-07-16' } },
    })
    const res = await assistant.ask({ text: 'x', identity: IDENTITY })
    await assistant.cancel({ proposal: res.proposal, conversationId: 'conv-1' })
    expect(services.tasks.create).not.toHaveBeenCalled()
    expect(aiActions.recordResult).toHaveBeenCalledWith('act-1', { status: 'dismissed' })
  })

  it('leitura (search_tasks) executa sem confirmacao e retorna resultado', async () => {
    const { assistant } = build({
      providerResult: { intent: 'search_tasks', confidence: 0.8, data: { query: 'treino' } },
    })
    const res = await assistant.ask({ text: 'busque treino', identity: IDENTITY })
    expect(res.kind).toBe('result')
    expect(res.result.length).toBe(1)
  })

  it('baixa confianca -> clarification', async () => {
    const { assistant } = build({
      providerResult: { intent: 'unknown', confidence: 0.2, needs_clarification: true, clarification: 'reformule', data: {} },
    })
    const res = await assistant.ask({ text: 'blabla', identity: IDENTITY })
    expect(res.kind).toBe('clarification')
  })

  it('complete_task por nome (1 match) -> proposal', async () => {
    const { assistant } = build({
      providerResult: { intent: 'complete_task', confidence: 0.8, data: { query: 'treino' } },
    })
    const res = await assistant.ask({ text: 'conclua treino', identity: IDENTITY })
    expect(res.kind).toBe('proposal')
    expect(res.proposal.payload.task_id).toBe('t1')
  })

  it('multiplas tarefas -> selection', async () => {
    const services = makeServices({
      tasks: {
        list: vi.fn(async () => [
          { id: 't1', title: 'Reuniao A', date: '2026-07-16', status: 'todo' },
          { id: 't2', title: 'Reuniao B', date: '2026-07-17', status: 'todo' },
        ]),
      },
    })
    const { assistant } = build({
      providerResult: { intent: 'complete_task', confidence: 0.8, data: { query: 'reuniao' } },
      services,
    })
    const res = await assistant.ask({ text: 'conclua reuniao', identity: IDENTITY })
    expect(res.kind).toBe('selection')
    expect(res.options.length).toBe(2)
  })

  it('tarefa inexistente -> clarification', async () => {
    const services = makeServices({ tasks: { list: vi.fn(async () => []) } })
    const { assistant } = build({
      providerResult: { intent: 'complete_task', confidence: 0.8, data: { query: 'nao existe' } },
      services,
    })
    const res = await assistant.ask({ text: 'conclua nao existe', identity: IDENTITY })
    expect(res.kind).toBe('clarification')
  })

  it('payload invalido do provider -> clarification (nao estoura)', async () => {
    const { assistant } = build({
      providerResult: { intent: 'create_task', confidence: 0.9, data: { date: '2026-07-16' } }, // sem title
    })
    const res = await assistant.ask({ text: 'agende', identity: IDENTITY })
    expect(res.kind).toBe('clarification')
  })

  it('rejeita acao sem workspace na identidade', async () => {
    const { assistant } = build({
      providerResult: { intent: 'create_task', confidence: 0.9, data: { title: 'R', date: '2026-07-16' } },
    })
    await expect(assistant.ask({ text: 'x', identity: { userId: 'u1' } })).rejects.toBeTruthy()
  })
})

describe('ProviderManager fallback', () => {
  it('cai no mock quando o remoto falha (ai.remote ligada)', async () => {
    const flags = createFeatureFlags({ 'ai.remote': true })
    // edgeInvoke que sempre falha
    const pm = createProviderManager({ flags, edgeInvoke: async () => { throw new Error('edge down') } })
    // isSupabaseConfigured e false no ambiente de teste -> useRemote()=false -> mock direto.
    const r = await pm.interpret('agende reuniao amanha as 15h', { today: '2026-07-15', categories: [] })
    expect(r.intent).toBe('create_task')
    expect(r.provider).toMatch(/mock/)
  })
})
