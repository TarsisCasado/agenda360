import { describe, it, expect, vi } from 'vitest'

// O caminho remoto so existe com Supabase configurado. `functions.invoke`
// continua espiao: nenhuma chamada externa acontece — nem Supabase, nem Gemini.
vi.mock('../../lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: vi.fn() } },
}))

import { createProviderManager } from '../providerManager'
import { createFeatureFlags } from '../featureFlags'
import { createTools } from '../tools'
import { createToolRegistry } from '../toolRegistry'
import { createAgentRuntime } from '../agentRuntime'
import { createAssistant } from '../assistant'
import { createEventBus } from '../eventBus'
import { mergeTurn, missingSlots } from '../slots'
import { interpretLocal } from '../nlu/localNlu'

// ---------------------------------------------------------------------------
// CP6.5.1 — A RESPOSTA CURTA A UMA PERGUNTA EM ABERTO.
//
// QA real, IA remota: "reuniao amanha as 08 com os gerentes" ->
// "08:00 da manha ou 20:00 da noite?" -> "manha" -> A MESMA PERGUNTA de novo.
//
// A pergunta do turno 1 esta certa: "as 08" e hora nua, genuinamente ambigua.
// O defeito e o turno 2. `mergeTurn` tratava uma interpretacao confiante como
// frase nova ANTES de tentar o slot aberto — e o provider remoto, que recebe o
// rascunho, quase sempre e confiante. `applyAnswer` nunca rodava.
//
// O que estes testes guardam, e que nenhuma resposta do modelo pode afrouxar:
// com pergunta em aberto, resposta curta e primeiro uma RESPOSTA; frase longa
// continua sendo frase nova; e a mesma pergunta nunca volta duas vezes.
//
// Toda resposta remota aqui e um objeto fixo que nos escrevemos. Nada disto
// prova o que o Gemini entende — prova o que a ponte faz com o que ele devolve.
// ---------------------------------------------------------------------------

const IDENTITY = { workspaceId: 'w1', userId: 'u1' }
const HOJE = '2026-09-13'
const AMANHA = '2026-09-14'
const FRASE = 'reuniao amanha as 08 com os gerentes'

function memoriaFake() {
  let ctx = {}
  const msgs = []
  return {
    startConversation: vi.fn(async () => 'c1'),
    append: vi.fn(async (id, role, content) => { msgs.push({ role, content }); return {} }),
    history: vi.fn(async () => msgs.slice(-12)),
    getContext: vi.fn(async () => ctx),
    setContext: vi.fn(async (id, p) => { ctx = { ...ctx, ...p }; return ctx }),
    getPending: vi.fn(async () => ctx.pending || null),
    setPending: vi.fn(async (id, p) => { ctx = { ...ctx, pending: p }; return ctx }),
    clearPending: vi.fn(async () => { ctx = { ...ctx, pending: null }; return ctx }),
    pendente: () => ctx.pending || null,
  }
}

// Resposta da Edge Function no contrato v1 ja canonico.
const v1 = (over = {}) => ({
  version: 1, provider: 'gemini', turn_kind: 'create', refers_to_draft: false,
  intent: 'create_task', confidence: 0.9, patch: {}, needs_clarification: false,
  clarification: null, ambiguities: [], rejected: [], ...over,
})

// Turno 1: o modelo entende a frase e marca a hora nua como ambigua.
const TURNO_1 = v1({
  patch: { title: 'Reuniao com os gerentes', date: AMANHA, start_time: '08:00', kind: 'compromisso' },
  ambiguities: ['horario'],
})

function montar(respostas = []) {
  const flags = createFeatureFlags({ 'ai.remote': true })
  const eventBus = createEventBus()
  const services = {
    tasks: {
      create: vi.fn(async () => ({ id: 't1' })),
      list: vi.fn(async () => []),
      getById: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
      changeStatus: vi.fn(async () => ({})),
      reschedule: vi.fn(async () => ({})),
      remove: vi.fn(async () => {}),
    },
    links: { create: vi.fn(async () => ({})) },
  }
  const registry = createToolRegistry({ tools: createTools(services), flags, eventBus })
  const runtime = createAgentRuntime({ registry, aiActions: null, eventBus })
  const fila = [...respostas]
  const edgeInvoke = vi.fn(async () => fila.shift())
  const providerManager = createProviderManager({ flags, edgeInvoke })
  const contextEngine = {
    build: vi.fn(async (identity, o = {}) => ({
      workspaceId: 'w1', today: HOJE, now: '10:00', timezone: 'America/Fortaleza',
      history: o.history || [],
      pending: o.pending ? { intent: o.pending.intent, data: o.pending.data, awaiting: o.pending.awaiting } : null,
      categories: [], recentTasks: [], overdueTasks: [], preferences: {},
    })),
  }
  const memory = memoriaFake()
  const assistant = createAssistant({ registry, runtime, providerManager, contextEngine, memory })
  return { assistant, memory, services }
}

// Abre a conversa no ponto do QA: pergunta de periodo em aberto.
async function perguntaAberta(respostaDoTurno2) {
  const ctx = montar([TURNO_1, respostaDoTurno2])
  const r1 = await ctx.assistant.ask({ text: FRASE, identity: IDENTITY })
  return { ...ctx, r1 }
}

const responder = (ctx, texto) =>
  ctx.assistant.ask({ text: texto, identity: IDENTITY, conversationId: 'c1' })

describe('CP6.5.1 · turno 1 continua perguntando o periodo', () => {
  it('1. "as 08" e ambiguo: pergunta, guarda o rascunho e o slot aberto', async () => {
    const { r1, memory } = await perguntaAberta(v1())
    expect(r1.kind).toBe('clarification')
    expect(r1.message).toBe('08:00 da manhã ou 20:00 da noite?')

    const p = memory.pendente()
    expect(p.awaiting).toBe('periodo')
    expect(p.phase).toBe('awaiting_slot')
    expect(p.data.time_ambiguous).toBe(true)
    expect(p.data.start_time).toBe('08:00')
  })
})

describe('CP6.5.1 · "manha" resolve no MESMO rascunho', () => {
  // As seis respostas remotas plausiveis do diagnostico CP6.5. C, D e F eram as
  // que entravam em laco — justamente as em que o modelo devolve uma intencao
  // confiante. F e a mais reveladora: o modelo acerta e a pergunta voltava.
  const variantes = {
    'A · revise, patch vazio': v1({ turn_kind: 'revise', refers_to_draft: true, intent: null, patch: {} }),
    'B · revise, start_time 08:00': v1({ turn_kind: 'revise', refers_to_draft: true, intent: null, patch: { start_time: '08:00' }, confidence: 0.95 }),
    'C · create repetindo a ambiguidade': v1({ patch: { start_time: '08:00' }, ambiguities: ['horario'] }),
    'D · revise repetindo a ambiguidade': v1({ turn_kind: 'revise', refers_to_draft: true, intent: 'create_task', patch: { start_time: '08:00' }, ambiguities: ['horario'] }),
    'E · unknown, baixa confianca': v1({ turn_kind: 'unknown', intent: null, patch: {}, confidence: 0.3, needs_clarification: true, clarification: 'Nao entendi.' }),
    'F · create correto, sem ambiguidade': v1({ patch: { start_time: '08:00' } }),
  }

  for (const [nome, resposta] of Object.entries(variantes)) {
    it(`2/3/4. resolve com o remoto devolvendo ${nome}`, async () => {
      const ctx = await perguntaAberta(resposta)
      const r2 = await responder(ctx, 'manha')

      expect(r2.kind).toBe('proposal')
      expect(r2.proposal.payload.start_time).toBe('08:00')
      // MESMO rascunho: titulo e data sobrevivem ao turno curto.
      expect(r2.proposal.payload.title).toBe('Reuniao com os gerentes')
      expect(r2.proposal.payload.date).toBe(AMANHA)
      // A bandeira interna morre aqui e nao vaza para a ferramenta.
      expect(ctx.memory.pendente().data.time_ambiguous).toBe(false)
      expect(r2.proposal.payload.time_ambiguous).toBeUndefined()
      // 12. a escrita continua exigindo confirmacao humana...
      expect(r2.proposal.requiresConfirmation).toBe(true)
      // 11. ...e nada foi criado.
      expect(ctx.services.tasks.create).not.toHaveBeenCalled()
    })
  }

  it('5. "noite" leva a mesma hora nua para 20:00', async () => {
    const ctx = await perguntaAberta(v1({ patch: { start_time: '08:00' }, ambiguities: ['horario'] }))
    const r2 = await responder(ctx, 'noite')
    expect(r2.kind).toBe('proposal')
    expect(r2.proposal.payload.start_time).toBe('20:00')
    expect(ctx.services.tasks.create).not.toHaveBeenCalled()
  })

  it('6. um horario completo tambem responde a pergunta', async () => {
    const ctx = await perguntaAberta(v1({ patch: { start_time: '08:30' } }))
    const r2 = await responder(ctx, '8:30')
    expect(r2.kind).toBe('proposal')
    expect(r2.proposal.payload.start_time).toBe('08:30')
    expect(ctx.services.tasks.create).not.toHaveBeenCalled()
  })
})

describe('CP6.5.1 · o que NAO pode virar laco nem ser engolido', () => {
  it('7 e 8. "azul" nao resolve: avisa e repete UMA vez, sem laco', async () => {
    const ctx = montar([TURNO_1, v1({ turn_kind: 'unknown', intent: null, confidence: 0.3 }), v1({ turn_kind: 'unknown', intent: null, confidence: 0.3 })])
    await ctx.assistant.ask({ text: FRASE, identity: IDENTITY })

    const r2 = await responder(ctx, 'azul')
    expect(r2.kind).toBe('clarification')
    expect(r2.message).toContain('Não consegui entender essa parte')
    expect(r2.slot).toBe('periodo')

    // De novo: continua controlado — mesma resposta, nao um laco silencioso.
    const r3 = await responder(ctx, 'azul')
    expect(r3.kind).toBe('clarification')
    expect(r3.slot).toBe('periodo')
    expect(ctx.services.tasks.create).not.toHaveBeenCalled()
  })

  it('9. frase longa nao e consumida como resposta ao slot', async () => {
    const ctx = await perguntaAberta(
      v1({
        turn_kind: 'revise',
        refers_to_draft: true,
        intent: 'create_task',
        patch: { title: 'Reuniao de diretoria' },
      }),
    )
    const r2 = await responder(ctx, 'na verdade muda o titulo para reuniao de diretoria')

    // Passou pelo fluxo de frase nova: o titulo mudou de verdade...
    expect(r2.proposal?.payload?.title || ctx.memory.pendente()?.data?.title).toBe('Reuniao de diretoria')
    // ...e nao foi interpretada como "manha/noite".
    expect(ctx.services.tasks.create).not.toHaveBeenCalled()
  })

  it('9b. trocar de assunto com o slot aberto continua trocando de assunto', () => {
    // "o que tenho amanha?" tem 4 palavras — e curta — mas e uma CONSULTA. O
    // que a separa de uma resposta e a INTENCAO: outra intencao, entendida com
    // seguranca, abandona a pendente. Sem esta guarda a pergunta viraria
    // "resposta" do slot de horario e a data da consulta entraria no rascunho.
    const pendente = {
      phase: 'awaiting_slot',
      intent: 'create_task',
      data: { title: 'Falar com Francisco', date: AMANHA },
      asked: [],
      awaiting: 'horario',
    }
    const consulta = {
      intent: 'list_schedule',
      confidence: 0.9,
      needs_clarification: false,
      data: { start: AMANHA, end: AMANHA },
      ambiguities: [],
    }
    const t = mergeTurn({ pending: pendente, interp: consulta, text: 'o que tenho amanha?', context: { today: HOJE, now: '10:00' } })

    expect(t.intent).toBe('list_schedule')
    expect(t.continued).toBe(false)
    // o rascunho nao foi contaminado pela frase da consulta
    expect(t.data.title).toBeUndefined()
  })

  it('10. o backstop: periodo ja perguntado nao volta a ser pedido', () => {
    const data = { title: 'X', date: AMANHA, start_time: '08:00', time_ambiguous: true }
    expect(missingSlots('create_task', data, { asked: [] })).toContain('periodo')
    expect(missingSlots('create_task', data, { asked: ['periodo'] })).not.toContain('periodo')
  })
})

describe('CP6.5.1 · caminho local/offline nao regride', () => {
  it('10b. o NLU local resolve "manha" como sempre resolveu', () => {
    const contexto = { today: HOJE, now: '10:00' }
    const i1 = interpretLocal(FRASE, contexto)
    const t1 = mergeTurn({ pending: null, interp: i1, text: FRASE, context: contexto })
    expect(missingSlots(t1.intent, t1.data, { asked: t1.asked })).toContain('periodo')

    const pendente = { phase: 'awaiting_slot', intent: t1.intent, data: t1.data, asked: t1.asked, awaiting: 'periodo' }
    const i2 = interpretLocal('manha', contexto)
    const t2 = mergeTurn({ pending: pendente, interp: i2, text: 'manha', context: contexto })

    expect(t2.continued).toBe(true)
    expect(t2.data.start_time).toBe('08:00')
    expect(t2.data.time_ambiguous).toBe(false)
    expect(missingSlots(t2.intent, t2.data, { asked: t2.asked })).toEqual([])
  })
})
