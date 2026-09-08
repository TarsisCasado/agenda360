import { describe, it, expect, vi, beforeEach } from 'vitest'

// O `providerManager` importa o cliente Supabase, e no ambiente de teste
// `isSupabaseConfigured` e false — o que desligaria o caminho remoto e faria
// estes testes provarem nada. Aqui ele e ligado, e `functions.invoke` continua
// sendo um espiao: NENHUMA chamada externa acontece, nem ao Supabase nem ao
// Gemini.
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: vi.fn() } },
}))

import { createProviderManager, SOURCE } from '../providerManager'
import { createFeatureFlags, featureFlags, FLAGS } from '../featureFlags'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createEventBus } from '../eventBus'
import { applyPatch } from '../slots'

// ---------------------------------------------------------------------------
// A PONTE (CP6.4) — do Copiloto ate a Interpretation v1 remota e de volta.
//
// O que estes testes provam e a PONTE, nunca a compreensao do modelo: toda
// resposta remota aqui e um objeto fixo que nos escrevemos. Se o Gemini entende
// "meia hora antes" e assunto de QA real, e nenhum teste offline pode dizer
// que sim.
//
// O que eles guardam:
//   . o formato do pedido (contrato CP6.1, com rascunho estruturado);
//   . a traducao da resposta para o que o runtime consome;
//   . a conversa de tres turnos que o CP6.0 quebrava;
//   . o fallback — que existe, funciona e APARECE;
//   . e a regra que nao muda por nada: escrita nenhuma sem confirmacao.
// ---------------------------------------------------------------------------

const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const CATEGORIAS = [{ id: 'cat-1', name: 'Reuniao' }, { id: 'cat-2', name: 'Pessoal' }]

const CONTEXTO = {
  today: '2026-09-08',
  now: '10:00',
  timezone: 'America/Fortaleza',
  categories: CATEGORIAS,
  history: [],
  pending: null,
}

// Uma resposta da Edge Function, no contrato v1 ja canonico (a Function
// traduziu o fio antes de responder).
const v1 = (over = {}) => ({
  version: 1,
  provider: 'gemini',
  turn_kind: 'create',
  refers_to_draft: false,
  intent: 'create_task',
  confidence: 0.95,
  patch: {},
  needs_clarification: false,
  clarification: null,
  ambiguities: [],
  rejected: [],
  ...over,
})

const CRIACAO = v1({
  patch: {
    title: 'Reunião com os gerentes',
    date: '2026-09-09',
    start_time: '08:00',
    kind: 'compromisso',
    alert_enabled: true,
    alert_minutes_before: 30,
    category_hint: 'Reuniao',
  },
})

function remoto(resposta, { flags = createFeatureFlags({ 'ai.remote': true }) } = {}) {
  const edgeInvoke = vi.fn(async () => (typeof resposta === 'function' ? resposta() : resposta))
  return { pm: createProviderManager({ flags, edgeInvoke }), edgeInvoke }
}

describe('a flag: desligada por padrão, e só o ambiente liga', () => {
  it('sem VITE_AI_REMOTE, remoto está desligado — e isso vale para Production', () => {
    // Production nao recebe a variavel; e este teste que garante que "nao
    // configurar nada" continua significando 100% local.
    expect(featureFlags.isEnabled(FLAGS.AI_REMOTE)).toBe(false)
  })

  it('flag desligada: o interpretador local responde e a Function nem é chamada', async () => {
    const { pm, edgeInvoke } = remoto(CRIACAO, { flags: createFeatureFlags() })
    const r = await pm.interpret('reuniao amanha as 8h', CONTEXTO)
    expect(edgeInvoke).not.toHaveBeenCalled()
    expect(r.source).toBe(SOURCE.LOCAL)
    expect(pm.activeProvider()).toBe('local')
  })

  it('flag ligada: a Function é chamada e a origem é remota', async () => {
    const { pm, edgeInvoke } = remoto(CRIACAO)
    const r = await pm.interpret('marca reuniao com os gerentes amanha as 8h', CONTEXTO)
    expect(edgeInvoke).toHaveBeenCalledWith('ai-interpret', expect.any(Object))
    expect(r.source).toBe(SOURCE.REMOTE)
    expect(r.provider).toBe('gemini')
    expect(pm.activeProvider()).toBe('remote')
  })
})

describe('o pedido é o contrato CP6.1 — não mais `{ text, context }`', () => {
  it('monta input, now, categorias por NOME e histórico curto', async () => {
    const { pm, edgeInvoke } = remoto(CRIACAO)
    await pm.interpret('marca reuniao amanha as 8h', {
      ...CONTEXTO,
      history: Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `t${i}` })),
    })
    const [, enviado] = edgeInvoke.mock.calls[0]

    expect(enviado.input).toEqual({ kind: 'text', text: 'marca reuniao amanha as 8h', media: null })
    expect(enviado.now).toEqual({ today: '2026-09-08', time: '10:00', timezone: 'America/Fortaleza' })
    // Nomes, nunca ids: o modelo nao precisa dos nossos identificadores.
    expect(enviado.categories).toEqual(['Reuniao', 'Pessoal'])
    expect(JSON.stringify(enviado.categories)).not.toContain('cat-1')
    expect(enviado.history).toHaveLength(6)
    // O formato antigo nao pode sobrar em lugar nenhum.
    expect(enviado.text).toBeUndefined()
    expect(enviado.context).toBeUndefined()
  })

  it('o rascunho vivo e a pergunta em aberto viajam ESTRUTURADOS', async () => {
    // Sem isto, "muda para 9h" e uma frase sem sujeito — o defeito do CP6.0.
    const { pm, edgeInvoke } = remoto(v1({ turn_kind: 'revise', refers_to_draft: true }))
    await pm.interpret('muda para 9h', {
      ...CONTEXTO,
      pending: {
        intent: 'create_task',
        phase: 'awaiting_confirmation',
        awaiting: 'horario',
        data: { title: 'Reunião com os gerentes', date: '2026-09-09', start_time: '08:00', asked: ['dia'] },
      },
    })
    const [, enviado] = edgeInvoke.mock.calls[0]
    expect(enviado.draft.intent).toBe('create_task')
    expect(enviado.draft.data.start_time).toBe('08:00')
    expect(enviado.draft.data.title).toBe('Reunião com os gerentes')
    expect(enviado.awaiting).toBe('horario')
    // Estado interno do slot-filling nao e assunto do interpretador.
    expect(enviado.draft.data.asked).toBeUndefined()
  })
})

describe('a resposta passa pela normalização — não por conversão ad hoc', () => {
  it('categoria por nome vira o id REAL do workspace', async () => {
    const { pm } = remoto(CRIACAO)
    const r = await pm.interpret('marca reuniao', CONTEXTO)
    expect(r.data.category_id).toBe('cat-1')
    expect(r.data.category_hint).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/categoria/i)
  })

  it('categoria que não existe aqui é ignorada, nunca inventada', async () => {
    const { pm } = remoto(v1({ patch: { title: 'X', category_hint: 'Jurídico' } }))
    const r = await pm.interpret('x', CONTEXTO)
    expect(r.data.category_id).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/nao existe/i)
  })

  it('`kind: compromisso` vira exigência de dia, não campo', async () => {
    const { pm } = remoto(CRIACAO)
    const r = await pm.interpret('marca reuniao', CONTEXTO)
    expect(r.data.kind).toBeUndefined()
    expect(r.requires).toContain('dia')
  })

  it('hora do aviso vira antecedência, ancorada no rascunho quando preciso', async () => {
    // "me avisa as 08:30" so faz sentido contra a reuniao que ja esta na tela.
    const { pm } = remoto(v1({
      turn_kind: 'revise', refers_to_draft: true, intent: 'update_task',
      patch: { start_time: '09:00', alert_at_time: '08:30' },
    }))
    const r = await pm.interpret('na verdade muda para 9h e me avisa as 08:30', {
      ...CONTEXTO,
      pending: { intent: 'create_task', phase: 'awaiting_confirmation', data: { title: 'Reunião', start_time: '08:00' } },
    })
    expect(r.data.start_time).toBe('09:00')
    expect(r.data.alert_minutes_before).toBe(30)   // 09:00 - 08:30
    expect(r.data.alert_enabled).toBe(true)
    expect(r.data.alert_at_time).toBeUndefined()   // nao existe coluna para isso
  })

  it('antecedência declarada liga o alerta sozinha', async () => {
    const { pm } = remoto(v1({ patch: { title: 'X', alert_minutes_before: 15 } }))
    const r = await pm.interpret('x', CONTEXTO)
    expect(r.data.alert_minutes_before).toBe(15)
    expect(r.data.alert_enabled).toBe(true)
  })

  it('resposta remota hostil não vira patch — a fronteira roda deste lado também', async () => {
    const { pm } = remoto({ ...CRIACAO, patch: { title: 'Reunião', sql: 'DROP TABLE tasks;', start_time: '25:99' } })
    const r = await pm.interpret('x', CONTEXTO)
    expect(r.data.title).toBe('Reunião')
    expect(r.data.sql).toBeUndefined()
    expect(r.data.start_time).toBeUndefined()
    expect(r.rejected.map((x) => x.field)).toEqual(
      expect.arrayContaining(['patch.sql', 'patch.start_time']),
    )
  })

  it('turno de criação sem `intent` explícito ainda chega utilizável ao runtime', async () => {
    // `turn_kind` e a classificacao; `intent` e a acao. O runtime precisa da
    // acao para achar a tool — deduzir ISSO nao inventa nenhum dado da atividade.
    const { pm } = remoto(v1({ intent: null, patch: { title: 'Reunião', date: '2026-09-09' } }))
    const r = await pm.interpret('x', CONTEXTO)
    expect(r.intent).toBe('create_task')
    expect(r.turn_kind).toBe('create')
  })
})

describe('o fallback existe, funciona e APARECE', () => {
  it('provider fora do ar: a conversa continua, com o local — e carimbada', async () => {
    const flags = createFeatureFlags({ 'ai.remote': true })
    const pm = createProviderManager({ flags, edgeInvoke: async () => { throw new Error('edge 502') } })
    const r = await pm.interpret('agende reuniao amanha as 15h', CONTEXTO)
    expect(r.intent).toBe('create_task')          // a UX nao quebra
    expect(r.source).toBe(SOURCE.FALLBACK)        // e ninguem e enganado
    expect(r.fallback_reason).toBe('falha_remota')
  })

  it('as três origens são distinguíveis entre si', async () => {
    const remota = await remoto(CRIACAO).pm.interpret('x', CONTEXTO)
    const local = await remoto(CRIACAO, { flags: createFeatureFlags() }).pm.interpret('x', CONTEXTO)
    const caiu = await createProviderManager({
      flags: createFeatureFlags({ 'ai.remote': true }),
      edgeInvoke: async () => { throw new Error('boom') },
    }).interpret('x', CONTEXTO)

    expect(new Set([remota.source, local.source, caiu.source]).size).toBe(3)
  })

  it('a mensagem de erro do provider não vaza para o turno', async () => {
    const pm = createProviderManager({
      flags: createFeatureFlags({ 'ai.remote': true }),
      edgeInvoke: async () => { throw new Error('GEMINI_API_KEY invalida em https://interno') },
    })
    const r = await pm.interpret('agende reuniao amanha as 15h', CONTEXTO)
    expect(JSON.stringify(r)).not.toMatch(/GEMINI_API_KEY|interno/)
  })
})

// ---------------------------------------------------------------------------
// A CONVERSA DE TRES TURNOS — o caso que o CP6.0 quebrava.
// ---------------------------------------------------------------------------

function makeServices() {
  return {
    tasks: {
      getById: vi.fn(async (ws, id) => ({ id, workspace_id: ws, title: 'X', status: 'todo' })),
      create: vi.fn(async (ws, uid, data) => ({ id: 'task-new', ...data })),
      update: vi.fn(async (uid, task, patch) => ({ ...task, ...patch })),
      changeStatus: vi.fn(async (uid, task, status) => ({ ...task, status })),
      reschedule: vi.fn(async (uid, task, date) => ({ ...task, date })),
      remove: vi.fn(async () => {}),
      list: vi.fn(async () => []),
    },
    links: { create: vi.fn(async () => ({ id: 'l1' })) },
  }
}

function montarConversa(respostas) {
  const fila = [...respostas]
  const services = makeServices()
  const flags = createFeatureFlags({ 'ai.remote': true })
  const eventBus = createEventBus()
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const runtime = createAgentRuntime({
    registry,
    aiActions: { recordProposed: vi.fn(async () => 'act-1'), recordResult: vi.fn(async () => {}) },
    eventBus,
  })
  const edgeInvoke = vi.fn(async () => fila.shift())
  const providerManager = createProviderManager({ flags, edgeInvoke })

  let pending = null
  const memory = {
    startConversation: vi.fn(async () => 'conv-1'),
    append: vi.fn(async () => ({})),
    history: vi.fn(async () => []),
    getPending: vi.fn(async () => pending),
    setPending: vi.fn(async (_id, p) => { pending = p }),
    clearPending: vi.fn(async () => { pending = null }),
  }
  const contextEngine = {
    build: vi.fn(async (_i, { categories = [], history = [], pending: p = null } = {}) => ({
      ...CONTEXTO, categories, history, pending: p,
    })),
  }
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, services, edgeInvoke, verPending: () => pending }
}

describe('multi-turno: a ponte não pode funcionar só no primeiro turno', () => {
  const TURNO1 = CRIACAO
  const TURNO2 = v1({
    turn_kind: 'revise', refers_to_draft: true, intent: 'update_task', confidence: 0.93,
    patch: { start_time: '09:00', alert_at_time: '08:30' },
  })
  const TURNO3 = v1({
    turn_kind: 'revise', refers_to_draft: true, intent: 'update_task', confidence: 0.9,
    patch: { start_time: '09:00', alert_minutes_before: 30 },
  })

  it('turno 1 propõe — e não escreve nada', async () => {
    const { assistant, services } = montarConversa([TURNO1])
    const r = await assistant.ask({
      text: 'Marca uma reunião com os gerentes amanhã às 8h e me avisa meia hora antes.',
      identity: IDENTITY, categories: CATEGORIAS,
    })
    expect(r.kind).toBe('proposal')
    expect(r.proposal.requiresConfirmation).toBe(true)
    expect(services.tasks.create).not.toHaveBeenCalled()
    expect(r.interpretation_source).toBe(SOURCE.REMOTE)
  })

  it('turno 2 REVISA o mesmo rascunho — não cria atividade nova', async () => {
    const { assistant, services, verPending } = montarConversa([TURNO1, TURNO2])
    await assistant.ask({
      text: 'Marca uma reunião com os gerentes amanhã às 8h e me avisa meia hora antes.',
      identity: IDENTITY, categories: CATEGORIAS,
    })
    const r2 = await assistant.ask({
      text: 'Na verdade, muda para 9h e me avisa às 08:30.',
      identity: IDENTITY, categories: CATEGORIAS,
    })

    expect(r2.kind).toBe('proposal')
    const d = verPending().data
    expect(d.start_time).toBe('09:00')            // alterado
    expect(d.title).toBe('Reunião com os gerentes')  // preservado
    expect(d.date).toBe('2026-09-09')             // preservado
    expect(d.alert_minutes_before).toBe(30)       // 09:00 - 08:30
    expect(d.alert_enabled).toBe(true)
    expect(services.tasks.create).not.toHaveBeenCalled()
    expect(services.tasks.update).not.toHaveBeenCalled()
  })

  it('turno 3 — a frase exata que o CP6.0 tratava como intenção nova — revisa', async () => {
    const { assistant, services, verPending } = montarConversa([TURNO1, TURNO3])
    await assistant.ask({
      text: 'Marca uma reunião com os gerentes amanhã às 8h e me avisa meia hora antes.',
      identity: IDENTITY, categories: CATEGORIAS,
    })
    const r3 = await assistant.ask({
      text: 'mude o horario da reuniao para as 09h me avisando meia hora antes',
      identity: IDENTITY, categories: CATEGORIAS,
    })

    expect(r3.kind).toBe('proposal')
    const d = verPending().data
    expect(d.title).toBe('Reunião com os gerentes')   // o rascunho sobreviveu
    expect(d.start_time).toBe('09:00')
    expect(d.alert_minutes_before).toBe(30)
    expect(services.tasks.create).not.toHaveBeenCalled()
  })

  it('nenhuma escrita acontece sem confirmação humana — nem no fim dos três turnos', async () => {
    const { assistant, services } = montarConversa([TURNO1, TURNO2, TURNO3])
    for (const t of [
      'Marca uma reunião com os gerentes amanhã às 8h e me avisa meia hora antes.',
      'Na verdade, muda para 9h e me avisa às 08:30.',
      'mude o horario da reuniao para as 09h me avisando meia hora antes',
    ]) {
      const r = await assistant.ask({ text: t, identity: IDENTITY, categories: CATEGORIAS })
      expect(r.kind).not.toBe('confirmed')
    }
    for (const m of ['create', 'update', 'remove', 'changeStatus', 'reschedule']) {
      expect(services.tasks[m], m).not.toHaveBeenCalled()
    }
  })

  it('o remoto cair no meio da conversa não escreve nada — e a origem muda', async () => {
    const { assistant, services } = montarConversa([TURNO1])
    await assistant.ask({
      text: 'Marca uma reunião com os gerentes amanhã às 8h e me avisa meia hora antes.',
      identity: IDENTITY, categories: CATEGORIAS,
    })
    // a fila acabou: o proximo `shift()` devolve undefined e a fronteira recusa
    const r2 = await assistant.ask({ text: 'muda para 10h', identity: IDENTITY, categories: CATEGORIAS })
    expect(['proposal', 'clarification']).toContain(r2.kind)
    expect(services.tasks.create).not.toHaveBeenCalled()
  })
})

describe('patch parcial preserva o que a frase não mencionou', () => {
  it('applyPatch: só o campo revisado muda', () => {
    const rascunho = { title: 'Reunião', date: '2026-09-09', start_time: '08:00', alert_minutes_before: 30 }
    const depois = applyPatch(rascunho, { start_time: '09:00' })
    expect(depois).toEqual({ ...rascunho, start_time: '09:00' })
  })
})

describe('segurança: nada de chave no cliente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('o pedido não carrega credencial nenhuma', async () => {
    const { pm, edgeInvoke } = remoto(CRIACAO)
    await pm.interpret('marca reuniao amanha', CONTEXTO)
    const enviado = JSON.stringify(edgeInvoke.mock.calls[0][1])
    expect(enviado).not.toMatch(/api[_-]?key|authorization|bearer|secret/i)
  })
})
