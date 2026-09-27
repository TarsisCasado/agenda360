import { describe, it, expect } from 'vitest'
import {
  parseInterpretation,
  emptyInterpretation,
  TURN_KIND,
  KIND,
  CONTRACT_VERSION,
} from './interpretation'
import { normalizeInterpretation, minutosEntre, isRevisionOf } from './normalizeInterpretation'
import { buildInterpreterInput, INPUT_KIND, MAX_TEXT, MAX_HISTORY_TURNS } from './input'
import { createLocalAdapter, createRemoteAdapterStub } from '../providers/adapter'
import {
  A_CRIAR, B_REVISAR_HORA, C_AVISO_POR_RELOGIO, D_TROCAR_DATA,
  E_TIRAR_ALERTA, F_CONSULTA, G_CANCELAR, H_HOSTIL,
  RASCUNHO, CATEGORIAS, HOJE, AMANHA, SEXTA,
} from './__fixtures__/turnos'

// ---------------------------------------------------------------------------
// O CONTRATO DO COPILOTO 2.0 — provado SEM provider (CP6.1).
//
// Nenhum teste aqui chama um modelo. O que se prova e que o Agenda 360 sabe
// consumir uma interpretacao competente e recusar uma hostil — as duas coisas
// antes de existir a primeira chave de API, que e a ordem que permite trocar de
// provider depois sem reescrever o produto.
// ---------------------------------------------------------------------------

describe('A — criar: uma frase, cinco informações', () => {
  const i = parseInterpretation(A_CRIAR, { provider: 'fixture' })
  const n = normalizeInterpretation(i, { categories: CATEGORIAS })

  it('turno é create, e não fala de rascunho nenhum', () => {
    expect(i.turn_kind).toBe(TURN_KIND.CREATE)
    expect(i.refers_to_draft).toBe(false)
    expect(i.intent).toBe('create_task')
  })

  it('data, horário e alerta chegam inteiros', () => {
    expect(n.patch).toMatchObject({
      title: 'Reunião com os gerentes',
      date: AMANHA,
      start_time: '08:00',
      alert_enabled: true,
      alert_minutes_before: 30,
    })
  })

  it('"compromisso" NÃO vira campo — vira exigência de dia', () => {
    // O CP5.9.1 provou que nao existe coluna `kind`. O contrato carrega a
    // intencao declarada; o dominio a traduz em regra.
    expect(n.patch.kind).toBeUndefined()
    expect(n.requires).toContain('dia')
  })

  it('a categoria vem por NOME e é resolvida para o id do workspace', () => {
    expect(n.patch.category_hint).toBeUndefined()
    expect(n.patch.category_id).toBe('cat-reuniao')
  })

  it('categoria que não existe aqui é ignorada, não inventada', () => {
    const outro = parseInterpretation(
      { ...A_CRIAR, patch: { ...A_CRIAR.patch, category_hint: 'Jardinagem' } },
      { provider: 'fixture' },
    )
    const r = normalizeInterpretation(outro, { categories: CATEGORIAS })
    expect(r.patch.category_id).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/nao existe neste workspace/)
  })
})

describe('B — revisar: o patch é MÍNIMO', () => {
  const i = parseInterpretation(B_REVISAR_HORA, { provider: 'fixture' })

  it('é revisão do rascunho vivo', () => {
    expect(i.turn_kind).toBe(TURN_KIND.REVISE)
    expect(i.refers_to_draft).toBe(true)
    expect(isRevisionOf(i, RASCUNHO)).toBe(true)
  })

  it('só o horário viaja — o resto do rascunho não é tocado', () => {
    expect(Object.keys(i.patch)).toEqual(['start_time'])
    expect(i.patch.start_time).toBe('09:00')
  })

  it('uma "revisão" sem patch não é revisão', () => {
    const vazio = parseInterpretation({ ...B_REVISAR_HORA, patch: {} }, { provider: 'fixture' })
    expect(isRevisionOf(vazio, RASCUNHO)).toBe(false)
  })

  it('sem rascunho vivo, não há o que revisar', () => {
    expect(isRevisionOf(i, null)).toBe(false)
  })
})

describe('C — "me avisa às 08:30": relógio vira antecedência', () => {
  const i = parseInterpretation(C_AVISO_POR_RELOGIO, { provider: 'fixture' })
  const n = normalizeInterpretation(i, { categories: CATEGORIAS, draft: RASCUNHO })

  it('a conta é nossa: 09:00 − 08:30 = 30 min antes', () => {
    expect(n.patch.alert_minutes_before).toBe(30)
    expect(n.patch.alert_enabled).toBe(true)
  })

  it('o relógio não vaza para o domínio — nenhuma coluna guarda isso', () => {
    expect(n.patch.alert_at_time).toBeUndefined()
  })

  it('sem início para ancorar, o aviso é descartado em vez de inventado', () => {
    const r = normalizeInterpretation(i, { categories: CATEGORIAS, draft: null })
    expect(r.patch.alert_minutes_before).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/sem inicio para ancorar/)
  })

  it('aviso DEPOIS do início não existe: descartado', () => {
    expect(minutosEntre('10:00', '09:00')).toBeNull()
    expect(minutosEntre('09:00', '09:00')).toBe(0) // "na hora" é válido
    expect(minutosEntre('lixo', '09:00')).toBeNull()
  })
})

describe('D — "não, amanhã não, sexta"', () => {
  const i = parseInterpretation(D_TROCAR_DATA, { provider: 'fixture' })
  it('substitui a data, e só ela', () => {
    expect(i.turn_kind).toBe(TURN_KIND.REVISE)
    expect(Object.keys(i.patch)).toEqual(['date'])
    expect(i.patch.date).toBe(SEXTA)
    expect(i.patch.date).not.toBe(AMANHA)
  })
})

describe('E — "tira o alerta"', () => {
  const i = parseInterpretation(E_TIRAR_ALERTA, { provider: 'fixture' })
  const n = normalizeInterpretation(i, {})
  it('desliga sem mexer em mais nada', () => {
    expect(n.patch).toEqual({ alert_enabled: false })
  })
  it('pedir antecedência liga o alerta; desligar não é sobrescrito', () => {
    const so = parseInterpretation(
      { turn_kind: 'revise', refers_to_draft: true, patch: { alert_minutes_before: 10 } },
      { provider: 'fixture' },
    )
    expect(normalizeInterpretation(so, {}).patch.alert_enabled).toBe(true)
  })
})

describe('F — consulta e G — cancelamento: nenhuma mutação', () => {
  it('consulta não altera nada', () => {
    const i = parseInterpretation(F_CONSULTA, { provider: 'fixture' })
    expect(i.turn_kind).toBe(TURN_KIND.QUERY)
    expect(i.patch).toEqual({})
    expect(isRevisionOf(i, RASCUNHO)).toBe(false)
  })

  it('cancelamento não altera nada', () => {
    const i = parseInterpretation(G_CANCELAR, { provider: 'fixture' })
    expect(i.turn_kind).toBe(TURN_KIND.CANCEL)
    expect(i.patch).toEqual({})
    expect(isRevisionOf(i, RASCUNHO)).toBe(false)
  })
})

describe('H — output hostil: recusado inteiro, sem derrubar a conversa', () => {
  const i = parseInterpretation(H_HOSTIL, { provider: 'fixture' })

  it('turn_kind inventado vira unknown', () => {
    expect(i.turn_kind).toBe(TURN_KIND.UNKNOWN)
    expect(i.needs_clarification).toBe(true)
  })

  it('intent fora da allowlist é recusada', () => {
    expect(i.intent).toBeNull()
    expect(i.rejected.some((r) => r.field === 'intent')).toBe(true)
  })

  it('data e hora impossíveis não entram', () => {
    expect(i.patch.date).toBeUndefined()
    expect(i.patch.start_time).toBeUndefined()
  })

  it('antecedência absurda não entra (teto de uma semana)', () => {
    expect(i.patch.alert_minutes_before).toBeUndefined()
  })

  it('enum inválido não entra', () => {
    expect(i.patch.priority).toBeUndefined()
  })

  it('campos que não existem no contrato somem — inclusive os perigosos', () => {
    expect(i.patch.sql).toBeUndefined()
    expect(i.patch.service_role_key).toBeUndefined()
    expect(i.rejected.some((r) => r.field === 'patch.sql')).toBe(true)
    expect(i.rejected.some((r) => r.field === 'patch.service_role_key')).toBe(true)
  })

  it('não polui o prototype', () => {
    expect(Object.prototype.hasOwnProperty.call({}, 'admin')).toBe(false)
    expect({}.admin).toBeUndefined()
  })

  it('confiança fora da escala é limitada a 0..1', () => {
    expect(i.confidence).toBeLessThanOrEqual(1)
    expect(i.confidence).toBeGreaterThanOrEqual(0)
  })

  it('o texto injetado sobrevive apenas como TÍTULO — dado, nunca ordem', () => {
    // Ele passa (é uma string válida), e é exatamente isso que deve acontecer:
    // vira o título de uma proposta que a pessoa vai ver e recusar. O que NÃO
    // pode é virar ação — e não vira, porque intent é null e nada executa sem
    // confirmação humana.
    expect(i.patch.title).toContain('Ignore as instruções')
    expect(i.intent).toBeNull()
    expect(isRevisionOf(i, RASCUNHO)).toBe(false)
  })
})

describe('a fronteira nunca lança', () => {
  for (const lixo of [null, undefined, 42, 'texto', [], true, { patch: 'nao e objeto' }]) {
    it(`${JSON.stringify(lixo)} vira um turno unknown válido`, () => {
      const i = parseInterpretation(lixo, { provider: 'x' })
      expect(i.turn_kind).toBe(TURN_KIND.UNKNOWN)
      expect(i.patch).toEqual({})
      expect(i.version).toBe(CONTRACT_VERSION)
    })
  }

  it('emptyInterpretation é um turno válido', () => {
    const i = emptyInterpretation({ provider: 'local' })
    expect(i.turn_kind).toBe(TURN_KIND.UNKNOWN)
    expect(i.provider).toBe('local')
  })

  it('null é VALOR quando o campo aceita ("tira a data")', () => {
    const i = parseInterpretation(
      { turn_kind: 'revise', refers_to_draft: true, patch: { date: null, title: null } },
      { provider: 'x' },
    )
    expect(i.patch.date).toBeNull()          // date é nullable: apagar é legítimo
    expect(i.patch.title).toBeUndefined()    // título não é: apagar seria perder o objeto
  })
})

describe('contrato de ENTRADA', () => {
  const input = buildInterpreterInput({
    text: '  muda para 9h  ',
    context: {
      today: HOJE, now: '20:00', timezone: 'America/Fortaleza',
      categories: CATEGORIAS,
      history: Array.from({ length: 30 }, (_, k) => ({ role: 'user', content: `turno ${k}` })),
    },
    draft: RASCUNHO,
  })

  it('a entrada é uma MÍDIA, não uma string — o multimodal já cabe', () => {
    expect(input.input.kind).toBe(INPUT_KIND.TEXT)
    expect(input.input).toHaveProperty('media')
    expect(INPUT_KIND.IMAGE).toBe('image')
    expect(INPUT_KIND.AUDIO).toBe('audio')
  })

  it('tipo não suportado cai para texto em vez de vazar', () => {
    expect(buildInterpreterInput({ kind: 'video', text: 'x' }).input.kind).toBe(INPUT_KIND.TEXT)
  })

  it('o texto é aparado e limitado', () => {
    expect(input.input.text).toBe('muda para 9h')
    const longo = buildInterpreterInput({ text: 'a'.repeat(5000) })
    expect(longo.input.text.length).toBe(MAX_TEXT)
  })

  it('o histórico é curto por decisão, não por acaso', () => {
    expect(input.history).toHaveLength(MAX_HISTORY_TURNS)
    expect(input.history.at(-1).content).toBe('turno 29')
  })

  it('o rascunho vivo viaja ESTRUTURADO — é o que desambigua a anáfora', () => {
    expect(input.draft.data.start_time).toBe('09:00')
    expect(input.draft.phase).toBe('awaiting_confirmation')
  })

  it('estado interno do slot-filling NÃO viaja', () => {
    const comInterno = buildInterpreterInput({
      text: 'x',
      draft: { ...RASCUNHO, data: { ...RASCUNHO.data, time_ambiguous: true, date_skipped: true } },
    })
    expect(comInterno.draft.data.time_ambiguous).toBeUndefined()
    expect(comInterno.draft.data.date_skipped).toBeUndefined()
  })

  it('categorias vão por NOME; ids não saem daqui', () => {
    expect(input.categories).toEqual(['Reuniao', 'Pessoal'])
    expect(JSON.stringify(input)).not.toContain('cat-reuniao')
  })
})

describe('adaptadores', () => {
  it('o LocalAdapter fala o contrato novo com o NLU de sempre', async () => {
    const a = createLocalAdapter()
    const i = await a.interpret(
      buildInterpreterInput({
        text: 'Reuniao com gerentes amanha as 8:30',
        context: { today: HOJE, now: '20:00', timezone: 'America/Fortaleza', categories: [] },
      }),
    )
    expect(i.provider).toBe('local')
    expect(i.intent).toBe('create_task')
    expect(i.patch.date).toBe(AMANHA)
    expect(i.patch.start_time).toBe('08:30')
  })

  it('o local NÃO finge resolver anáfora — e isso é a garantia, não a falha', async () => {
    const a = createLocalAdapter()
    const i = await a.interpret(buildInterpreterInput({ text: 'muda para as 9h', draft: RASCUNHO }))
    // Dizer `true` sem base descartaria ou contaminaria o rascunho por engano.
    expect(i.refers_to_draft).toBe(false)
  })

  it('texto vazio não vira turno', async () => {
    const i = await createLocalAdapter().interpret(buildInterpreterInput({ text: '   ' }))
    expect(i.turn_kind).toBe(TURN_KIND.UNKNOWN)
  })

  it('um NLU que explode não derruba a conversa', async () => {
    const a = createLocalAdapter({ interpret: () => { throw new Error('boom') } })
    const i = await a.interpret(buildInterpreterInput({ text: 'qualquer coisa' }))
    expect(i.turn_kind).toBe(TURN_KIND.UNKNOWN)
    expect(i.provider).toBe('local')
  })

  it('o stub remoto não pretende funcionar — e diz isso', async () => {
    const i = await createRemoteAdapterStub('gemini').interpret(buildInterpreterInput({ text: 'x' }))
    expect(i.provider).toBe('gemini')
    expect(i.turn_kind).toBe(TURN_KIND.UNKNOWN)
    expect(i.clarification).toMatch(/não está configurada/i)
  })
})

describe('o contrato não promete o que o domínio não entrega', () => {
  it('kind é semântico e nunca vira campo persistido', () => {
    const i = parseInterpretation(
      { turn_kind: 'create', intent: 'create_task', patch: { kind: KIND.COMPROMISSO, title: 'X' } },
      { provider: 'x' },
    )
    expect(i.patch.kind).toBe(KIND.COMPROMISSO)               // viaja no contrato
    expect(normalizeInterpretation(i, {}).patch.kind).toBeUndefined() // não chega ao domínio
  })

  it('interpretar NÃO é validar: o alerta sem horário passa aqui e é o domínio que recusa', () => {
    // alertRules (CP5.8.1) é quem diz não. O interpretador só relata o que ouviu.
    const i = parseInterpretation(
      { turn_kind: 'create', intent: 'create_task', patch: { title: 'Pagar', alert_minutes_before: 30 } },
      { provider: 'x' },
    )
    const n = normalizeInterpretation(i, {})
    expect(n.patch.alert_enabled).toBe(true)
    expect(n.patch.start_time).toBeUndefined()
  })
})

describe('o campo tem onde pousar no domínio', () => {
  it('create_task e update_task aceitam alerta e antecedência', async () => {
    // Sem isto o contrato mentiria: `validation.js` descarta chave desconhecida
    // em silêncio, e "me avisa meia hora antes" morreria na fronteira da
    // ferramenta depois de ter sido corretamente interpretado.
    const { createTools } = await import('../tools')
    const tools = createTools({ tasks: {}, links: {} })
    for (const intent of ['create_task', 'update_task']) {
      const t = tools.find((x) => x.intent === intent)
      expect(t.schema.alert_enabled, `${intent}.alert_enabled`).toBeDefined()
      expect(t.schema.alert_minutes_before, `${intent}.alert_minutes_before`).toBeDefined()
    }
  })
})
