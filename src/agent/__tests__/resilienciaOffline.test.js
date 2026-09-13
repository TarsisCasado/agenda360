import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// O caminho remoto so existe com Supabase configurado. Aqui ele e ligado para
// que o fallback remoto->local seja REALMENTE exercitado; `functions.invoke`
// continua sendo espiao, entao nenhuma chamada externa acontece — nem Supabase,
// nem Gemini.
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: vi.fn() } },
}))

import { ehIndisponibilidadeTransitoria, erroDeBanco } from '../../lib/indisponibilidade'
import { createProviderManager, SOURCE } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createContextEngine } from '../contextEngine'
import { createEventBus } from '../eventBus'

// ---------------------------------------------------------------------------
// CP6.4.6 — RESILIENCIA OFFLINE DO TURNO.
//
// O QA desligou o Wi-Fi e o Copiloto respondeu "Ops, tive um problema para
// processar". Nao era o interpretador: o turno morria ANTES dele, no `append`
// do historico. O fallback remoto->local, que existe desde o CP6.4, nunca era
// alcancado.
//
// O que estes testes guardam:
//   . a ALLOWLIST — degrada-se so em transporte; RLS, FK, JWT e bug nosso sobem;
//   . o turno inteiro offline chegando a proposta, carimbado como fallback;
//   . "amanha" resolvendo para a data certa mesmo sem contexto do banco;
//   . confirmacao offline que nao escreve, nao mente e nao perde o cartao;
//   . e a regra que nao muda: escrita nenhuma sem confirmacao humana.
//
// A FORMA DO ERRO E A REAL, e nao a que o diagnostico CP6.4.5 supos: o
// `postgrest-js` nao lanca TypeError — ele devolve `{ status: 0, error: {...} }`
// e o servico relanca isso preservando status/code. Um mock com TypeError
// provaria o classificador errado.
// ---------------------------------------------------------------------------

const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const CATEGORIAS = [{ id: 'cat-1', name: 'Pessoal' }]

// --- erros, nas formas que o mundo real produz -----------------------------
const semRede = () =>
  erroDeBanco({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }, 0)
const rls = () => erroDeBanco({ message: 'new row violates row-level security policy', code: '42501' }, 403)
const fk = () => erroDeBanco({ message: 'insert or update violates foreign key constraint', code: '23503' }, 409)
const jwt = () => erroDeBanco({ message: 'JWT expired', code: 'PGRST301' }, 401)
const semLinhas = () => erroDeBanco({ message: 'JSON object requested, 0 rows', code: 'PGRST116' }, 406)
const bugDeProgramacao = () => new TypeError('registry.execute is not a function')
const edgeInalcancavel = () => {
  const e = new Error('Failed to send a request to the Edge Function')
  e.name = 'FunctionsFetchError'
  return e
}
const abortado = () => {
  const e = new Error('The operation was aborted')
  e.name = 'AbortError'
  return e
}

const rejeitando = (erro) => vi.fn(async () => { throw erro() })

// --- montagem --------------------------------------------------------------
function memoriaOffline(erro = semRede) {
  return {
    startConversation: rejeitando(erro),
    append: rejeitando(erro),
    history: rejeitando(erro),
    getPending: rejeitando(erro),
    setPending: rejeitando(erro),
    setContext: rejeitando(erro),
    clearPending: rejeitando(erro),
  }
}

function memoriaOnline() {
  return {
    startConversation: vi.fn(async () => 'conv-1'),
    append: vi.fn(async () => ({})),
    history: vi.fn(async () => []),
    getPending: vi.fn(async () => null),
    setPending: vi.fn(async () => ({})),
    setContext: vi.fn(async () => ({})),
    clearPending: vi.fn(async () => ({})),
  }
}

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

function montar({
  memory = memoriaOnline(),
  services = servicos(),
  aiActions = { recordProposed: vi.fn(async () => 'act-1'), recordResult: vi.fn(async () => {}) },
  edgeInvoke = vi.fn(async () => { throw edgeInalcancavel() }),
  remoto = true,
} = {}) {
  const flags = createFeatureFlags({ 'ai.remote': remoto })
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const runtime = createAgentRuntime({ registry, aiActions, eventBus })
  const providerManager = createProviderManager({ flags, edgeInvoke })
  // Context engine REAL: e ele que precisa degradar preservando `today`.
  const contextEngine = createContextEngine({ tasks: services.tasks })
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, memory, services, aiActions, registry, runtime, edgeInvoke }
}

const perguntar = (assistant, text, extra = {}) =>
  assistant.ask({ text, identity: IDENTITY, categories: CATEGORIAS, ...extra })

// ---------------------------------------------------------------------------
describe('CP6.4.6 · classificador de indisponibilidade transitoria', () => {
  it('1. PostgREST realista (status 0) e transitorio', () => {
    const err = semRede()
    // A forma que o servico realmente relanca: Error, status 0, code vazio.
    expect(err.status).toBe(0)
    expect(err.code).toBe('')
    expect(ehIndisponibilidadeTransitoria(err)).toBe(true)
  })

  it('2. RLS (42501) NAO e transitorio — tem de aparecer', () => {
    expect(ehIndisponibilidadeTransitoria(rls())).toBe(false)
  })

  it('3. FK violada (23503) NAO e transitoria', () => {
    expect(ehIndisponibilidadeTransitoria(fk())).toBe(false)
  })

  it('4. JWT expirado (PGRST301) NAO e transitorio', () => {
    expect(ehIndisponibilidadeTransitoria(jwt())).toBe(false)
  })

  it('5. zero linhas (PGRST116) NAO e transitorio', () => {
    expect(ehIndisponibilidadeTransitoria(semLinhas())).toBe(false)
  })

  it('6. bug de programacao (TypeError) NAO e transitorio', () => {
    expect(ehIndisponibilidadeTransitoria(bugDeProgramacao())).toBe(false)
  })

  it('7. FunctionsFetchError, AbortError e fetch do browser sao transitorios', () => {
    expect(ehIndisponibilidadeTransitoria(edgeInalcancavel())).toBe(true)
    expect(ehIndisponibilidadeTransitoria(abortado())).toBe(true)
    expect(ehIndisponibilidadeTransitoria(new TypeError('Failed to fetch'))).toBe(true)
    expect(ehIndisponibilidadeTransitoria(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
  })

  it('8. default e false: nada nao reconhecido degrada', () => {
    expect(ehIndisponibilidadeTransitoria(null)).toBe(false)
    expect(ehIndisponibilidadeTransitoria(new Error('deu ruim'))).toBe(false)
    expect(ehIndisponibilidadeTransitoria({ status: 500, code: 'XX000' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('CP6.4.6 · o turno offline chega a proposta', () => {
  it('9. TUDO offline ao mesmo tempo: proposta local, carimbada como fallback', async () => {
    const { assistant, services } = montar({ memory: memoriaOffline() })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')

    expect(res.kind).toBe('proposal')
    expect(res.interpretation_source).toBe(SOURCE.FALLBACK)
    expect(res.proposal.payload.title).toMatch(/caf/i)
    expect(res.proposal.requiresConfirmation).toBe(true)
    // Nenhuma atividade criada: proposta nao escreve.
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('10. conversationId fica NULO — nenhum uuid fantasma para a tela guardar', async () => {
    const { assistant } = montar({ memory: memoriaOffline() })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')
    // A tela so persiste o ponteiro com `if (res.conversationId)`.
    expect(res.conversationId).toBeNull()
  })

  it('11. actionId nulo nao afrouxa a confirmacao', async () => {
    const aiActions = { recordProposed: rejeitando(semRede), recordResult: vi.fn(async () => {}) }
    const { assistant } = montar({ memory: memoriaOffline(), aiActions })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')
    expect(res.proposal.actionId).toBeNull()
    expect(res.proposal.requiresConfirmation).toBe(true)
  })

  it('12. "amanha" mantem a data correta sem o contexto do banco', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T10:00:00'))
    try {
      // `tasks.list` fora do ar: o contextEngine degrada, mas `today` continua.
      const services = servicos({ tasks: { list: rejeitando(semRede) } })
      const { assistant } = montar({ memory: memoriaOffline(), services })
      const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')
      expect(res.kind).toBe('proposal')
      expect(res.proposal.payload.date).toBe('2026-09-09')
    } finally {
      vi.useRealTimers()
    }
  })

  it('13. erro de aplicacao no historico RELANCA — nao vira "modo offline"', async () => {
    const memory = memoriaOnline()
    memory.append = rejeitando(rls)
    const { assistant } = montar({ memory })
    await expect(perguntar(assistant, 'criar tarefa comprar cafe amanha')).rejects.toThrow(
      /row-level security/i,
    )
  })

  it('14. erro de aplicacao no contexto RELANCA', async () => {
    const services = servicos({ tasks: { list: rejeitando(jwt) } })
    const { assistant } = montar({ services })
    await expect(perguntar(assistant, 'criar tarefa comprar cafe amanha')).rejects.toThrow(/JWT/i)
  })
})

// ---------------------------------------------------------------------------
describe('CP6.4.6 · confirmacao', () => {
  let erroDoConsole
  beforeEach(() => { erroDoConsole = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => { erroDoConsole.mockRestore() })

  it('15. confirmar OFFLINE: nao escreve, nao finge sucesso, erro classificavel', async () => {
    const services = servicos({ tasks: { create: rejeitando(semRede) } })
    const { assistant } = montar({ memory: memoriaOffline(), services })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')

    let capturado
    try {
      await assistant.confirm({ proposal: res.proposal, identity: IDENTITY, conversationId: null })
    } catch (err) {
      capturado = err
    }
    expect(capturado).toBeTruthy()
    // A tela usa exatamente isto para trocar o texto cru por uma frase humana.
    expect(ehIndisponibilidadeTransitoria(capturado)).toBe(true)
    // Uma tentativa, nenhuma atividade: nada a duplicar depois.
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
  })

  it('16. escrita OK + auditoria offline: continua "confirmed", sem duplicar', async () => {
    const aiActions = { recordProposed: vi.fn(async () => 'act-1'), recordResult: rejeitando(semRede) }
    const { assistant, services } = montar({ aiActions })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')
    const out = await assistant.confirm({ proposal: res.proposal, identity: IDENTITY, conversationId: 'conv-1' })

    expect(out.kind).toBe('confirmed')
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
  })

  it('17. escrita OK + historico offline: continua "confirmed"', async () => {
    const memory = memoriaOnline()
    const { assistant, services } = montar({ memory })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')
    memory.append = rejeitando(semRede)
    memory.clearPending = rejeitando(semRede)

    const out = await assistant.confirm({ proposal: res.proposal, identity: IDENTITY, conversationId: 'conv-1' })
    expect(out.kind).toBe('confirmed')
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
  })

  it('18. erro de aplicacao DEPOIS da escrita nao vira "falhou" — mas aparece no console', async () => {
    const aiActions = { recordProposed: vi.fn(async () => 'act-1'), recordResult: rejeitando(rls) }
    const { assistant, services } = montar({ aiActions })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')
    const out = await assistant.confirm({ proposal: res.proposal, identity: IDENTITY, conversationId: 'conv-1' })

    expect(out.kind).toBe('confirmed')
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
    expect(erroDoConsole).toHaveBeenCalled()
  })

  it('19. proposta offline confirmada JA RECONECTADA: cria UMA vez e recupera a auditoria', async () => {
    // Fase 1 — offline: proposta nasce sem actionId.
    const services = servicos()
    const offline = { recordProposed: rejeitando(semRede), recordResult: vi.fn(async () => {}) }
    const primeiro = montar({ memory: memoriaOffline(), services, aiActions: offline })
    const res = await perguntar(primeiro.assistant, 'criar tarefa comprar cafe amanha')
    expect(res.proposal.actionId).toBeNull()

    // Fase 2 — rede de volta: a MESMA proposta e confirmada.
    const online = { recordProposed: vi.fn(async () => 'act-tardia'), recordResult: vi.fn(async () => {}) }
    const segundo = montar({ services, aiActions: online })
    const out = await segundo.assistant.confirm({
      proposal: res.proposal,
      identity: IDENTITY,
      conversationId: 'conv-1',
    })

    expect(out.kind).toBe('confirmed')
    // UMA criacao, um unico caminho de execucao.
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
    // Auditoria recuperada e usada no resultado.
    expect(online.recordProposed).toHaveBeenCalledTimes(1)
    expect(online.recordResult).toHaveBeenCalledWith('act-tardia', expect.objectContaining({ status: 'applied' }))
  })

  it('20. auditoria tardia indisponivel nao impede a execucao', async () => {
    const services = servicos()
    const aiActions = { recordProposed: rejeitando(semRede), recordResult: vi.fn(async () => {}) }
    const { assistant, runtime } = montar({ services, aiActions })
    const out = await runtime.confirm(
      { intent: 'create_task', payload: { title: 'Cafe', date: '2026-09-09' }, actionId: null },
      IDENTITY,
      { conversationId: null },
    )
    expect(out.id).toBe('task-new')
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
    expect(assistant).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
describe('CP6.4.6 · online continua identico (nao-regressao)', () => {
  it('21. com rede: conversa criada, historico gravado, actionId presente', async () => {
    const { assistant, memory, aiActions, services } = montar()
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')

    expect(res.kind).toBe('proposal')
    expect(res.conversationId).toBe('conv-1')
    expect(res.proposal.actionId).toBe('act-1')
    expect(memory.startConversation).toHaveBeenCalled()
    expect(memory.append).toHaveBeenCalledWith('conv-1', 'user', 'criar tarefa comprar cafe amanha')
    expect(aiActions.recordProposed).toHaveBeenCalledTimes(1)
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('22. com rede e Edge respondendo, a origem e remota', async () => {
    const edgeInvoke = vi.fn(async () => ({
      version: 1,
      provider: 'gemini',
      turn_kind: 'create',
      refers_to_draft: false,
      intent: 'create_task',
      confidence: 0.9,
      patch: { title: 'Comprar cafe', date: '2026-09-09' },
      needs_clarification: false,
      clarification: null,
      ambiguities: [],
      rejected: [],
    }))
    const { assistant } = montar({ edgeInvoke })
    const res = await perguntar(assistant, 'criar tarefa comprar cafe amanha')
    expect(res.interpretation_source).toBe(SOURCE.REMOTE)
    expect(edgeInvoke).toHaveBeenCalledTimes(1)
  })
})
