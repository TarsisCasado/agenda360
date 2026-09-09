import { describe, it, expect, vi } from 'vitest'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createEventBus } from '../eventBus'
import { classifyTurn, isDraftQuery, TURN } from '../turnClassifier'
import { detectQuestion } from '../nlu/question'
import { describeDraft, draftLine } from '../draftSummary'
import { interpretLocal } from '../nlu/localNlu'

// ---------------------------------------------------------------------------
// CP5.1.1 — CONSULTA SOBRE A ENTIDADE ATIVA.
//
// QA humano no Preview, com a proposta na tela:
//   "esta sem data e hora correto?"
//
// Tres modos de falha coexistiam, todos medidos antes de corrigir:
//   "esta sem data e hora correto?" -> MODIFY     (aplicava a pergunta como
//                                                  ordem: "Ajustei a data")
//   "como ficou?" / "tem horario?"  -> AMBIGUOUS  (o "nao entendi" do QA)
//   "tem lembrete?"                 -> NEW_INTENT (o NLU lia create_task 0.9 e
//                                                  DESCARTAVA o rascunho)
//
// Contrato travado aqui: enquanto ha entidade ativa, ela e o referente padrao
// de perguntas e pronomes. Consultar LE o estado real e nao altera, nao propoe,
// nao executa e nao descarta.
//
// Hoje = domingo 2026-08-30 / 20:50. Amanha = 2026-08-31. Sexta = 2026-09-04.
// ---------------------------------------------------------------------------
const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const TODAY = '2026-08-30'
const AMANHA = '2026-08-31'
const SEXTA = '2026-09-04'
const CATEGORIAS = [{ id: 'c1', name: 'Trabalho' }]
const CTX = { today: TODAY, now: '20:50', categories: CATEGORIAS }

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
  const providerManager = createProviderManager({ flags })
  const contextEngine = {
    build: vi.fn(async () => ({ ...CTX, timezone: 'America/Fortaleza', recentTasks: [], overdueTasks: [] })),
  }
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, memory, services, aiActions }
}

const say = (assistant, text, conversationId) =>
  assistant.ask({ text, identity: IDENTITY, categories: CATEGORIAS, conversationId })

// Rascunho do QA: sem data, sem horario, aguardando confirmacao.
async function draftSemData() {
  const ctx = build()
  const first = await say(ctx.assistant, 'Preciso resolver demandas com o Sr Francisco')
  expect(first.kind).toBe('clarification')
  const second = await say(ctx.assistant, 'deixar somente em Tarefas', first.conversationId)
  expect(second.kind).toBe('proposal')
  expect(second.proposal.payload.date).toBeUndefined()
  return { ...ctx, conversationId: first.conversationId }
}

// ===========================================================================
// 1) O ROTEIRO EXATO DO QA HUMANO
// ===========================================================================
describe('QA: "esta sem data e hora correto?" com a proposta na tela', () => {
  it('responde do estado real, sem alterar, propor ou executar', async () => {
    const { assistant, memory, services, conversationId } = await draftSemData()
    const antes = await memory.getPending('conv-1')

    const res = await say(assistant, 'esta sem data e hora correto?', conversationId)

    expect(res.kind).toBe('answer')
    expect(res.message).toMatch(/sem data/i)
    expect(res.message).toMatch(/sem hor[aá]rio/i)
    // Nao inventou nem "ajustou" nada.
    expect(res.message).not.toMatch(/ajustei/i)
    expect(res.message).not.toMatch(/não consegui|nao consegui/i)
    expect(res.message).not.toMatch(/algo novo/i)
    // Nao executou.
    expect(services.tasks.create).not.toHaveBeenCalled()

    // O rascunho ficou EXATAMENTE como estava.
    const depois = await memory.getPending('conv-1')
    expect(depois).toEqual(antes)
    expect(res.proposal).toBeTruthy()
  })

  it('multi-turno completo do QA: consulta -> ajuste -> consulta -> salvar', async () => {
    const { assistant, memory, services, conversationId } = await draftSemData()

    const q1 = await say(assistant, 'esta sem data e hora correto?', conversationId)
    expect(q1.kind).toBe('answer')
    expect(q1.message).toMatch(/sem data/i)

    const ajuste = await say(assistant, 'então coloca sexta', conversationId)
    expect(ajuste.kind).toBe('proposal')
    expect(ajuste.proposal.payload.date).toBe(SEXTA)
    expect(ajuste.proposal.payload.title).toMatch(/Francisco/)

    const q2 = await say(assistant, 'e agora como ficou?', conversationId)
    expect(q2.kind).toBe('answer')
    expect(q2.message).toMatch(/04\/09\/2026/)
    expect(q2.message).not.toMatch(/sem data/i)

    const fim = await say(assistant, 'pode salvar', conversationId)
    expect(fim.kind).toBe('confirmed')

    // UMA atividade, com o titulo e a data certos.
    expect(services.tasks.create).toHaveBeenCalledTimes(1)
    const criada = services.tasks.create.mock.calls[0][2]
    expect(criada.title).toMatch(/Francisco/)
    expect(criada.date).toBe(SEXTA)
    expect(await memory.getPending('conv-1')).toBeNull()
  })

  it.each([
    'Esta sem data e hora correto',
    'Como ficou',
    'Entao coloca sexta',
    'E agora como ficou',
    'Pode salvar',
  ])('nenhuma atividade e criada com o titulo "%s"', async (proibido) => {
    const { assistant, services, conversationId } = await draftSemData()
    for (const t of ['esta sem data e hora correto?', 'então coloca sexta', 'e agora como ficou?', 'pode salvar']) {
      await say(assistant, t, conversationId)
    }
    const titulos = services.tasks.create.mock.calls.map((c) => c[2].title)
    expect(titulos).not.toContain(proibido)
    expect(titulos).toHaveLength(1)
  })
})

// ===========================================================================
// 2) CONSULTA POR CAMPO — sempre a partir do dado real
// ===========================================================================
describe('consultas por campo', () => {
  it.each([
    ['está sem data?', /sem data/i],
    ['tem horário?', /sem hor[aá]rio/i],
    ['qual prioridade ficou?', /prioridade está média/],
    ['tem lembrete?', /sem lembrete/i],
    ['qual a categoria?', /sem categoria/i],
    ['qual atividade você entendeu?', /Francisco/],
    ['onde isso vai aparecer?', /tarefas a fazer/i],
    ['vai ficar só nas tarefas?', /tarefas a fazer/i],
    ['como ficou?', /Francisco/],
  ])('"%s" e respondida com o estado real', async (pergunta, esperado) => {
    const { assistant, conversationId } = await draftSemData()
    const res = await say(assistant, pergunta, conversationId)
    expect(res.kind).toBe('answer')
    expect(res.message).toMatch(esperado)
  })

  it('a resposta acompanha o rascunho depois de um ajuste', async () => {
    const { assistant, conversationId } = await draftSemData()
    await say(assistant, 'coloca prioridade alta', conversationId)
    await say(assistant, 'muda para amanhã', conversationId)

    const p = await say(assistant, 'qual prioridade ficou?', conversationId)
    expect(p.message).toMatch(/prioridade está alta/)

    const d = await say(assistant, 'você colocou para amanhã?', conversationId)
    expect(d.message).toMatch(/amanh[ãa]/i)
    expect(d.message).toMatch(/31\/08\/2026/)
  })

  it('categoria real do workspace aparece na resposta', async () => {
    const { assistant, conversationId } = await draftSemData()
    await say(assistant, 'coloca na categoria trabalho', conversationId)
    const res = await say(assistant, 'qual a categoria?', conversationId)
    expect(res.message).toMatch(/Trabalho/)
  })
})

// ===========================================================================
// 3) CONSULTA COM SLOT ABERTO (fase awaiting_slot)
// ===========================================================================
describe('consulta enquanto ainda falta um slot', () => {
  it('responde e repete a pergunta que estava de pé', async () => {
    const { assistant } = build()
    const a = await say(assistant, 'Preciso resolver demandas com o Sr Francisco')
    expect(a.kind).toBe('clarification')
    expect(a.slot).toBe('data')

    const q = await say(assistant, 'qual atividade você entendeu?', a.conversationId)
    expect(q.kind).toBe('answer')
    expect(q.message).toMatch(/Francisco/)
    // A conversa nao trava: a pergunta aberta volta junto da resposta.
    expect(q.message).toMatch(/para quando/i)
    expect(q.slot).toBe('data')

    // E o slot continua respondivel normalmente.
    const b = await say(assistant, 'amanhã', a.conversationId)
    expect(b.kind).toBe('proposal')
    expect(b.proposal.payload.date).toBe(AMANHA)
  })

  it('a fase e os dados nao mudam por causa de uma consulta', async () => {
    const { assistant, memory } = build()
    const a = await say(assistant, 'Preciso resolver demandas com o Sr Francisco')
    const antes = await memory.getPending('conv-1')
    await say(assistant, 'como ficou?', a.conversationId)
    expect(await memory.getPending('conv-1')).toEqual(antes)
  })
})

// ===========================================================================
// 4) REGRESSOES — o que NAO pode virar consulta
// ===========================================================================
describe('o que continua NAO sendo consulta ao rascunho', () => {
  const kindOf = (text) => classifyTurn({ interp: interpretLocal(text, CTX), text, context: CTX }).kind

  it.each([
    ['o que eu tenho na sexta?', TURN.NEW_INTENT],
    ['busque tarefas de trabalho', TURN.NEW_INTENT],
    ['conclua a tarefa Treino', TURN.NEW_INTENT],
    ['agendar reunião com o João amanhã?', TURN.NEW_INTENT],
    ['muda para sexta?', TURN.MODIFY],
    ['coloca prioridade alta?', TURN.MODIFY],
    ['então coloca sexta', TURN.MODIFY],
    ['não quero lembrete', TURN.MODIFY],
    ['pode salvar', TURN.CONFIRM],
    ['cancela isso', TURN.CANCEL],
  ])('"%s" -> %s', (text, expected) => {
    expect(kindOf(text)).toBe(expected)
  })

  it('uma consulta de AGENDA continua executando de verdade, mesmo com rascunho vivo', async () => {
    const { assistant, services, conversationId } = await draftSemData()
    const res = await say(assistant, 'o que eu tenho na sexta?', conversationId)
    expect(res.kind).toBe('result')
    expect(services.tasks.list).toHaveBeenCalled()
  })

  it('alteracao, confirmacao e cancelamento seguem intactos com o rascunho vivo', async () => {
    const alt = await draftSemData()
    expect((await say(alt.assistant, 'muda para sexta', alt.conversationId)).kind).toBe('proposal')

    const conf = await draftSemData()
    expect((await say(conf.assistant, 'confirma', conf.conversationId)).kind).toBe('confirmed')

    const canc = await draftSemData()
    expect((await say(canc.assistant, 'cancela isso', canc.conversationId)).kind).toBe('cancelled')

    const novo = await draftSemData()
    const r = await say(novo.assistant, 'agendar reunião com o João depois de amanhã às 10h', novo.conversationId)
    expect(r.kind).toBe('proposal')
    expect(r.proposal.payload.title).toMatch(/Jo[aã]o/)
  })

  it('sem rascunho vivo, uma pergunta nao vira resposta sobre nada', async () => {
    const { assistant } = build()
    const res = await say(assistant, 'como ficou?')
    expect(res.kind).not.toBe('answer')
  })
})

// ===========================================================================
// 5) AS CAMADAS DETERMINISTICAS, ISOLADAS
// ===========================================================================
describe('detectQuestion — marcadores gramaticais, nao frases', () => {
  it('reconhece os tres marcadores de interrogativa', () => {
    expect(detectQuestion('tem horário?').isQuestion).toBe(true) // ponto de interrogacao
    expect(detectQuestion('qual prioridade ficou').isQuestion).toBe(true) // abertura
    expect(detectQuestion('esta sem data e hora correto').isQuestion).toBe(true) // cauda
  })

  it('nao confunde afirmacao com pergunta', () => {
    for (const t of ['coloca prioridade alta', 'muda para sexta', 'pode salvar', 'certo']) {
      expect(detectQuestion(t).isQuestion).toBe(false)
    }
  })

  it('verbo de acao marca instrucao, mesmo com interrogacao', () => {
    expect(detectQuestion('muda para sexta?').hasImperative).toBe(true)
    expect(detectQuestion('tem horário?').hasImperative).toBe(false)
  })

  it('identifica os campos mirados pela pergunta', () => {
    expect(detectQuestion('tem lembrete?').fields).toContain('lembrete')
    expect(detectQuestion('qual prioridade ficou?').fields).toContain('prioridade')
    expect(detectQuestion('como ficou?').fields).toEqual([])
  })
})

describe('isDraftQuery — as duas guardas', () => {
  it('guarda 1: verbo de acao desqualifica', () => {
    expect(isDraftQuery({ text: 'muda para sexta?', interp: {} }).match).toBe(false)
  })

  it('guarda 2: intencao reconhecida que nao seja create_task e sobre o mundo', () => {
    const t = 'o que eu tenho na sexta?'
    expect(isDraftQuery({ text: t, interp: interpretLocal(t, CTX) }).match).toBe(false)
  })

  it('create_task nao desqualifica — o NLU local a dispara demais', () => {
    const t = 'tem lembrete?'
    expect(interpretLocal(t, CTX).intent).toBe('create_task')
    expect(isDraftQuery({ text: t, interp: interpretLocal(t, CTX) }).match).toBe(true)
  })
})

describe('describeDraft — so o que esta no rascunho', () => {
  const opts = { categories: CATEGORIAS, today: TODAY }

  it('campo ausente vira fato, nunca palpite', () => {
    expect(describeDraft({ title: 'X' }, { ...opts, fields: ['data'] })).toBe('Está sem data.')
    expect(describeDraft({ title: 'X' }, { ...opts, fields: ['horario'] })).toBe('Está sem horário.')
    expect(describeDraft({ title: 'X' }, { ...opts, fields: ['lembrete'] })).toBe('Está sem lembrete.')
  })

  it('combina os campos mirados', () => {
    const out = describeDraft({ title: 'X' }, { ...opts, fields: ['data', 'horario'] })
    expect(out).toBe('Está sem data e está sem horário.')
  })

  it('usa referencia relativa quando ela ajuda', () => {
    expect(describeDraft({ date: AMANHA }, { ...opts, fields: ['data'] })).toMatch(/amanhã \(31\/08\/2026\)/)
    expect(describeDraft({ date: TODAY }, { ...opts, fields: ['data'] })).toMatch(/hoje \(30\/08\/2026\)/)
    expect(describeDraft({ date: SEXTA }, { ...opts, fields: ['data'] })).toBe('Está para 04/09/2026.')
  })

  it('sem mira, devolve o estado inteiro', () => {
    const out = describeDraft({ title: 'Falar com Ana', priority: 'high' }, opts)
    expect(out).toMatch(/Falar com Ana/)
    expect(out).toMatch(/sem data/)
    expect(out).toMatch(/prioridade alta/)
    expect(out).toMatch(/sem lembrete/)
  })

  it('draftLine cobre todos os campos do dominio', () => {
    const line = draftLine(
      { title: 'T', date: SEXTA, start_time: '15:00', priority: 'urgent', category_id: 'c1', alert_enabled: true },
      opts,
    )
    expect(line).toBe('"T" · 04/09/2026 · 15:00 · prioridade urgente · Trabalho · com lembrete')
  })
})
