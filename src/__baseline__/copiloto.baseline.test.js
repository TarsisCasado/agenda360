import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../agent/tools'
import { createToolRegistry } from '../agent/toolRegistry'
import { createAgentRuntime } from '../agent/agentRuntime'
import { createAssistant } from '../agent/assistant'
import { createProviderManager } from '../agent/providerManager'
import { createFeatureFlags } from '../agent/featureFlags'
import { createEventBus } from '../agent/eventBus'
import { baseline, invariante } from './contrato'

// ---------------------------------------------------------------------------
// BASELINE — COPILOTO (SO O CONTRATO).
//
// AREA CONGELADA. Este arquivo nao muda prompt, provider, NLU, Edge Function
// nem contrato de interpretacao: ele so prova, com as pecas reais, que as
// garantias que precisam SOBREVIVER a migracao estao de pe hoje.
//
// Cinco garantias, e todas ja sao invariante no UX1.3.1:
//   . nenhuma escrita sem proposta;
//   . nenhuma escrita sem confirmacao humana;
//   . revisar ajusta a MESMA proposta, nao abre outra;
//   . abandonar nao escreve nada;
//   . sem rede, o interpretador local assume — e o turno sai CARIMBADO.
// ---------------------------------------------------------------------------

const IDENTIDADE = { workspaceId: 'w1', userId: 'u1' }

function servicos(over = {}) {
  return {
    tasks: {
      getById: vi.fn(async (ws, id) => ({ id, workspace_id: ws, title: 'X', status: 'todo' })),
      create: vi.fn(async (ws, uid, data) => ({ id: 'task-new', workspace_id: ws, created_by: uid, ...data })),
      update: vi.fn(async (uid, task, patch) => ({ ...task, ...patch })),
      changeStatus: vi.fn(async (uid, task, status) => ({ ...task, status })),
      reschedule: vi.fn(async (uid, task, date) => ({ ...task, date })),
      remove: vi.fn(async () => {}),
      list: vi.fn(async () => []),
      ...over.tasks,
    },
    links: { create: vi.fn(async () => ({ id: 'l1' })) },
  }
}

// Provider falso: nao ha rede em teste nenhum deste arquivo.
const provedorFixo = (resultado) => ({
  interpret: vi.fn(async () => ({ ambiguities: [], needs_clarification: false, ...resultado })),
})

function montar({ resultado, services = servicos() }) {
  const flags = createFeatureFlags()
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const aiActions = { recordProposed: vi.fn(async () => 'act-1'), recordResult: vi.fn(async () => {}) }
  const runtime = createAgentRuntime({ registry, aiActions, eventBus })
  const memory = {
    startConversation: vi.fn(async () => 'conv-1'),
    append: vi.fn(async () => ({})),
    history: vi.fn(async () => []),
  }
  const contextEngine = {
    build: vi.fn(async () => ({ today: '2026-09-21', timezone: 'America/Sao_Paulo', categories: [] })),
  }
  const assistant = createAssistant({
    registry,
    runtime,
    providerManager: provedorFixo(resultado),
    contextEngine,
    memory,
  })
  return { assistant, services, aiActions }
}

const CRIAR = {
  intent: 'create_task',
  confidence: 0.9,
  data: { title: 'Reuniao com os gerentes', date: '2026-09-23', start_time: '09:00' },
}

describe('BASELINE Copiloto — proposta antes de escrita', () => {
  it(invariante('INV-24', 'uma intencao de escrita para na PROPOSTA e nao grava nada'), async () => {
    const { assistant, services } = montar({ resultado: CRIAR })
    const r = await assistant.ask({ text: 'marca reuniao com os gerentes quarta as 9', identity: IDENTIDADE })

    expect(r.kind).toBe('proposal')
    expect(r.proposal.requiresConfirmation).toBe(true)
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it(invariante('INV-24', 'so a confirmacao humana grava'), async () => {
    const { assistant, services, aiActions } = montar({ resultado: CRIAR })
    const r = await assistant.ask({ text: 'x', identity: IDENTIDADE })
    expect(services.tasks.create).not.toHaveBeenCalled()

    const out = await assistant.confirm({ proposal: r.proposal, identity: IDENTIDADE, conversationId: 'conv-1' })
    expect(out.kind).toBe('confirmed')
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
    expect(aiActions.recordResult).toHaveBeenCalledWith('act-1', expect.objectContaining({ status: 'applied' }))
  })

  it(baseline('a proposta e registrada em ai_actions ANTES de qualquer escrita'), async () => {
    const { assistant, aiActions, services } = montar({ resultado: CRIAR })
    await assistant.ask({ text: 'x', identity: IDENTIDADE })
    expect(aiActions.recordProposed).toHaveBeenCalled()
    expect(services.tasks.create).not.toHaveBeenCalled()
  })
})

describe('BASELINE Copiloto — revisar a MESMA proposta', () => {
  it(baseline('confirmar uma proposta editada grava os dados editados, nao os originais'), async () => {
    const { assistant, services } = montar({ resultado: CRIAR })
    const r = await assistant.ask({ text: 'x', identity: IDENTIDADE })

    const revisada = { ...r.proposal, payload: { ...r.proposal.payload, title: 'Reuniao com o Rubens' } }
    await assistant.confirm({ proposal: revisada, identity: IDENTIDADE, conversationId: 'conv-1' })

    expect(services.tasks.create).toHaveBeenCalledWith(
      'w1',
      'u1',
      expect.objectContaining({ title: 'Reuniao com o Rubens' }),
    )
    // Uma escrita so: revisar ajustou a proposta, nao abriu uma segunda.
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
  })
})

describe('BASELINE Copiloto — abandonar', () => {
  it(invariante('INV-24', 'cancelar a proposta nao escreve e registra `dismissed`'), async () => {
    const { assistant, services, aiActions } = montar({ resultado: CRIAR })
    const r = await assistant.ask({ text: 'x', identity: IDENTIDADE })
    await assistant.cancel({ proposal: r.proposal, conversationId: 'conv-1' })

    expect(services.tasks.create).not.toHaveBeenCalled()
    expect(aiActions.recordResult).toHaveBeenCalledWith('act-1', { status: 'dismissed' })
  })

  it(invariante('INV-24', 'abandonar sem confirmar nem cancelar tambem nao escreve'), async () => {
    const { assistant, services } = montar({ resultado: CRIAR })
    await assistant.ask({ text: 'x', identity: IDENTIDADE })
    // Ninguem chama confirm nem cancel: a conversa simplesmente acabou.
    expect(services.tasks.create).not.toHaveBeenCalled()
  })
})

describe('BASELINE Copiloto — leitura nao precisa de confirmacao', () => {
  it(baseline('uma busca executa direto e devolve resultado, sem proposta'), async () => {
    const services = servicos({
      tasks: { list: vi.fn(async () => [{ id: 't1', title: 'Treino', date: '2026-09-22', status: 'todo' }]) },
    })
    const { assistant } = montar({ resultado: { intent: 'search_tasks', confidence: 0.8, data: { query: 'treino' } }, services })
    const r = await assistant.ask({ text: 'busque treino', identity: IDENTIDADE })

    expect(r.kind).toBe('result')
    expect(services.tasks.create).not.toHaveBeenCalled()
  })
})

describe('BASELINE Copiloto — sem rede', () => {
  it(
    invariante('fallback-local', 'com a flag remota desligada, o interpretador LOCAL assume e o turno sai carimbado'),
    async () => {
      // `VITE_AI_REMOTE` ausente => flag desligada => caminho local, sem rede.
      const pm = createProviderManager({ flags: createFeatureFlags() })
      const r = await pm.interpret('marca reuniao amanha as 9', {
        today: '2026-09-21',
        now: '2026-09-21T08:40:00',
        categories: [],
      })
      expect(r.source).toBe('local')
      expect(pm.activeProvider()).toBe('local')
    },
  )

  it(baseline('a Edge Function nao e chamada quando a flag remota esta desligada'), async () => {
    const edgeInvoke = vi.fn(async () => ({}))
    const pm = createProviderManager({ flags: createFeatureFlags(), edgeInvoke })
    await pm.interpret('qualquer coisa', { today: '2026-09-21', categories: [] })
    expect(edgeInvoke).not.toHaveBeenCalled()
  })

  it(baseline('texto vazio nao vira turno nem chamada'), async () => {
    const edgeInvoke = vi.fn(async () => ({}))
    const pm = createProviderManager({ flags: createFeatureFlags(), edgeInvoke })
    const r = await pm.interpret('   ', { today: '2026-09-21', categories: [] })
    expect(edgeInvoke).not.toHaveBeenCalled()
    expect(r).toBeTruthy()
  })
})
