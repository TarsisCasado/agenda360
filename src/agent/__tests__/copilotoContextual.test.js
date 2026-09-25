import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'
import { contextoBase } from '../contextEngine'
import {
  SUPERFICIE, CONVITE, contextoDaSuperficie, saudacaoContextual,
  sugestoesContextuais, trecho,
} from '../../lib/copilotoContexto'

// ---------------------------------------------------------------------------
// UX1.6 (C3) — COPILOTO CONTEXTUAL.
//
// O que este arquivo prova, e nessa ordem de importancia:
//
//   L. o turno chamado de uma superficie leva o contexto MINIMO dela;
//   P. abrir/consultar nao chama IA para escrever nem grava;
//   M. pergunta nao grava;
//   N. proposta nao grava antes da confirmacao;
//   O. fechar/cancelar nao aplica a proposta.
//
// M/N/O ja eram contrato do produto desde o CP5. Estao aqui de novo de
// proposito: o C3 abriu QUATRO portas novas para o Copiloto, e uma porta nova
// e exatamente o lugar onde uma garantia antiga costuma vazar sem ninguem
// perceber. Se algum dia um destes quebrar, quebra junto com a porta que o
// causou.
// ---------------------------------------------------------------------------

const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const CATEGORIAS = [{ id: 'c1', name: 'Trabalho' }]
const CTX = { today: '2026-08-30', now: '20:50', categories: CATEGORIAS }

function makeMemory() {
  const conversations = new Map()
  const messages = []
  return {
    conversations,
    messages,
    startConversation: vi.fn(async () => { conversations.set('conv-1', { context: {} }); return 'conv-1' }),
    append: vi.fn(async (id, role, content, metadata = {}) => { messages.push({ id, role, content, metadata }); return {} }),
    history: vi.fn(async (id) => messages.filter((m) => m.id === id).map(({ role, content }) => ({ role, content }))),
    getContext: vi.fn(async (id) => conversations.get(id)?.context || {}),
    setContext: vi.fn(async (id, patch) => {
      const atual = conversations.get(id) || { context: {} }
      atual.context = { ...atual.context, ...patch }
      conversations.set(id, atual)
      return atual.context
    }),
    getPending: vi.fn(async (id) => conversations.get(id)?.context?.pending || null),
    setPending: vi.fn(async (id, pending) => {
      const atual = conversations.get(id) || { context: {} }
      atual.context = { ...atual.context, pending }
      conversations.set(id, atual)
    }),
    clearPending: vi.fn(async (id) => {
      const atual = conversations.get(id) || { context: {} }
      atual.context = { ...atual.context, pending: null }
      conversations.set(id, atual)
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
  const providerManager = createProviderManager({ flags })
  const contextEngine = {
    build: vi.fn(async () => ({ ...CTX, timezone: 'America/Fortaleza', recentTasks: [], overdueTasks: [] })),
  }
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, memory, services, contextEngine }
}

const falar = (assistant, text, extra = {}) =>
  assistant.ask({ text, identity: IDENTITY, categories: CATEGORIAS, ...extra })

// Nenhuma escrita de dominio aconteceu.
function nadaFoiGravado(services) {
  expect(services.tasks.create).not.toHaveBeenCalled()
  expect(services.tasks.update).not.toHaveBeenCalled()
  expect(services.tasks.changeStatus).not.toHaveBeenCalled()
  expect(services.tasks.reschedule).not.toHaveBeenCalled()
  expect(services.tasks.remove).not.toHaveBeenCalled()
  expect(services.links.create).not.toHaveBeenCalled()
}

// ===========================================================================
// L — O CONTEXTO MINIMO DA SUPERFICIE
// ===========================================================================
describe('L — o Copiloto sabe de onde foi chamado', () => {
  it('a superficie viaja com o turno ate o contexto do agente', async () => {
    const { assistant, contextEngine } = build()
    const surface = contextoDaSuperficie(SUPERFICIE.AGENDA, { periodo: '15–21 de setembro' })
    await falar(assistant, 'o que eu tenho nesta semana?', { surface })
    expect(contextEngine.build).toHaveBeenCalledWith(
      IDENTITY,
      expect.objectContaining({ surface: { superficie: 'agenda', periodo: '15–21 de setembro' } }),
    )
  })

  it('sem superficie, o turno continua exatamente como antes do C3', async () => {
    const { assistant, contextEngine } = build()
    await falar(assistant, 'o que eu tenho hoje?')
    expect(contextEngine.build).toHaveBeenCalledWith(
      IDENTITY,
      expect.objectContaining({ surface: null }),
    )
    expect(contextoBase(IDENTITY, {})).not.toHaveProperty('surface')
  })

  it('o contexto base carrega a superficie quando ela existe, e a omite quando nao', () => {
    const com = contextoBase(IDENTITY, { surface: { superficie: 'memoria' } })
    expect(com.surface).toEqual({ superficie: 'memoria' })
    expect(contextoBase(IDENTITY, { surface: null })).not.toHaveProperty('surface')
  })
})

describe('L — o que o contexto carrega (e o que ele NAO carrega)', () => {
  it('Hoje manda so a superficie', () => {
    expect(contextoDaSuperficie(SUPERFICIE.HOJE)).toEqual({ superficie: 'hoje' })
  })

  it('Tarefas manda o recorte atual', () => {
    expect(contextoDaSuperficie(SUPERFICIE.TAREFAS, { filtro: 'semana' })).toEqual({
      superficie: 'tarefas', filtro: 'semana',
    })
  })

  it('Memoria manda o item selecionado: titulo, formato e um trecho', () => {
    const ctx = contextoDaSuperficie(SUPERFICIE.MEMORIA, {
      item: { titulo: 'Notas da reunião', formato: 'nota', conteudo: 'linha 1\nlinha 2' },
    })
    expect(ctx.item).toEqual({ titulo: 'Notas da reunião', formato: 'nota', trecho: 'linha 1 linha 2' })
  })

  it('o trecho e CURTO: nota longa nao vira prompt inteiro', () => {
    const ctx = contextoDaSuperficie(SUPERFICIE.MEMORIA, {
      item: { titulo: 't', formato: 'nota', conteudo: 'a'.repeat(5000) },
    })
    expect(ctx.item.trecho.length).toBeLessThanOrEqual(400)
    expect(ctx.item.trecho.endsWith('…')).toBe(true)
  })

  it('nada alem do recorte viaja: sem lista, sem ids, sem banco', () => {
    const ctx = contextoDaSuperficie(SUPERFICIE.MEMORIA, {
      filtro: 'por_organizar',
      item: { id: 'nota:segredo', origemId: 'uuid-real', titulo: 't', formato: 'nota', conteudo: 'x', origem: { workspace_id: 'w1' } },
      itensVisiveis: [1, 2, 3],
    })
    expect(Object.keys(ctx).sort()).toEqual(['filtro', 'item', 'superficie'])
    expect(Object.keys(ctx.item).sort()).toEqual(['formato', 'titulo', 'trecho'])
    expect(JSON.stringify(ctx)).not.toContain('uuid-real')
  })

  it('campo ausente e OMITIDO, nunca enviado nulo', () => {
    const ctx = contextoDaSuperficie(SUPERFICIE.AGENDA, {})
    expect(ctx).not.toHaveProperty('periodo')
  })

  it('trecho normaliza espaco e nao quebra com vazio', () => {
    expect(trecho('  a   b \n c ')).toBe('a b c')
    expect(trecho(null)).toBe('')
  })
})

// ===========================================================================
// ABERTURA CONTEXTUAL — a tela nao comeca vazia, e nao fala sozinha
// ===========================================================================
describe('abertura contextual', () => {
  it('cada superficie tem um convite proprio, em linguagem humana', () => {
    expect(CONVITE[SUPERFICIE.HOJE]).toBe('Organizar meu dia')
    expect(CONVITE[SUPERFICIE.AGENDA]).toBe('Planejar esta semana')
    expect(CONVITE[SUPERFICIE.TAREFAS]).toBe('O que devo priorizar?')
    expect(CONVITE[SUPERFICIE.MEMORIA]).toBe('Me ajude a organizar isto')
    // Nenhum deles fala "IA", "assistente virtual" ou "prompt".
    for (const c of Object.values(CONVITE)) expect(c).not.toMatch(/\bIA\b|assistente|prompt/i)
  })

  it('a saudacao muda com a superficie e cita o item quando ha um', () => {
    expect(saudacaoContextual(contextoDaSuperficie(SUPERFICIE.HOJE))).toMatch(/seu dia/i)
    expect(saudacaoContextual(contextoDaSuperficie(SUPERFICIE.AGENDA, { periodo: 'esta semana' }))).toMatch(/esta semana/)
    const ctx = contextoDaSuperficie(SUPERFICIE.MEMORIA, { item: { titulo: 'Contrato', formato: 'nota', conteudo: '' } })
    expect(saudacaoContextual(ctx)).toContain('Contrato')
  })

  it('a saudacao DEVOLVE A PALAVRA, nunca anuncia que fez algo', () => {
    for (const s of Object.values(SUPERFICIE)) {
      const t = saudacaoContextual(contextoDaSuperficie(s, { item: { titulo: 'x', formato: 'nota', conteudo: '' } }))
      // Termina passando a vez: uma pergunta, ou um convite a dizer o que
      // precisa. O que ela nunca faz e afirmar uma acao ja tomada — abrir o
      // Copiloto nao executa nada, e a primeira frase nao pode sugerir que sim.
      expect(t).toMatch(/\?|me diga/i)
      expect(t).not.toMatch(/criei|salvei|agendei|organizei|arquivei|pronto/i)
    }
  })

  it('as sugestoes sao FRASES para a pessoa mandar, nao acoes', () => {
    for (const s of Object.values(SUPERFICIE)) {
      const sug = sugestoesContextuais(contextoDaSuperficie(s))
      expect(sug.length).toBeGreaterThan(0)
      for (const frase of sug) expect(typeof frase).toBe('string')
    }
  })

  it('sem contexto conhecido nao inventa saudacao', () => {
    expect(saudacaoContextual(null)).toBe('')
    expect(saudacaoContextual({ superficie: 'inexistente' })).toBe('')
  })
})

// ===========================================================================
// M / N / O / P — O CONTRATO DE SEGURANCA CONTINUA VALENDO NAS PORTAS NOVAS
// ===========================================================================
describe('M — perguntar a partir de uma superficie nao grava', () => {
  it('consulta responde e nao escreve nada', async () => {
    const { assistant, services } = build()
    const surface = contextoDaSuperficie(SUPERFICIE.TAREFAS, { filtro: 'fluxo' })
    const r = await falar(assistant, 'o que eu tenho na sexta?', { surface })
    expect(['result', 'answer', 'clarification']).toContain(r.kind)
    nadaFoiGravado(services)
  })
})

describe('N — alteracao vinda de uma superficie e PROPOSTA, nao escrita', () => {
  it('a proposta chega sem nada ter sido gravado', async () => {
    const { assistant, services } = build()
    const surface = contextoDaSuperficie(SUPERFICIE.MEMORIA, {
      item: { titulo: 'Padronizar preparação dos veículos', formato: 'nota', conteudo: 'texto' },
    })
    const r = await falar(assistant, 'Agende revisar checklist amanhã às 15h', { surface })
    expect(r.kind).toBe('proposal')
    nadaFoiGravado(services)
  })

  it('so a confirmacao explicita grava', async () => {
    const { assistant, services } = build()
    const surface = contextoDaSuperficie(SUPERFICIE.HOJE)
    const r = await falar(assistant, 'Agende revisar checklist amanhã às 15h', { surface })
    expect(r.kind).toBe('proposal')
    nadaFoiGravado(services)
    await assistant.confirm({ proposal: r.proposal, identity: IDENTITY, conversationId: r.conversationId })
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
  })
})

describe('O — sair sem confirmar nao aplica nada', () => {
  it('cancelar descarta a proposta sem escrever', async () => {
    const { assistant, services } = build()
    const r = await falar(assistant, 'Agende revisar checklist amanhã às 15h', {
      surface: contextoDaSuperficie(SUPERFICIE.MEMORIA),
    })
    expect(r.kind).toBe('proposal')
    await assistant.cancel({ proposal: r.proposal, conversationId: r.conversationId })
    nadaFoiGravado(services)
  })

  it('abandonar a tela (nunca confirmar) tambem nao escreve', async () => {
    const { assistant, services } = build()
    const r = await falar(assistant, 'Agende revisar checklist amanhã às 15h', {
      surface: contextoDaSuperficie(SUPERFICIE.TAREFAS, { filtro: 'fluxo' }),
    })
    expect(r.kind).toBe('proposal')
    // Nao chamamos confirm: e literalmente o que fechar a tela faz.
    nadaFoiGravado(services)
  })
})

describe('P — abrir o Copiloto por contexto nao dispara turno nenhum', () => {
  it('montar o contexto e funcao pura: nao toca provider, memoria nem services', async () => {
    const { assistant, memory, services, contextEngine } = build()
    // Isto e TUDO o que a faisca faz ao ser clicada.
    const ctx = contextoDaSuperficie(SUPERFICIE.MEMORIA, {
      item: { titulo: 'Contrato', formato: 'nota', conteudo: 'ver com jurídico' },
    })
    saudacaoContextual(ctx)
    sugestoesContextuais(ctx)

    expect(contextEngine.build).not.toHaveBeenCalled()
    expect(memory.startConversation).not.toHaveBeenCalled()
    expect(memory.append).not.toHaveBeenCalled()
    nadaFoiGravado(services)
    expect(assistant).toBeTruthy()
  })
})
