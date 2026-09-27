import { describe, it, expect } from 'vitest'
import {
  buildToday,
  baldeDe,
  estaAtrasada,
  minutosAte,
  proximidade,
  HOJE_BALDES,
} from './today'
import { STATUS } from './constants'

// ---------------------------------------------------------------------------
// HOJE — os sete cenarios que o briefing exigiu, mais a invariante da
// deduplicacao, que e o que impede a tela de mentir sobre quantas coisas
// existem.
// ---------------------------------------------------------------------------
const HOJE = '2026-09-03'
const AGORA = new Date('2026-09-03T10:00:00')
const ctx = { today: HOJE, now: AGORA }

let seq = 0
const t = (over = {}) => ({
  id: `t${(seq += 1)}`,
  title: 'X',
  status: STATUS.TODO,
  date: null,
  start_time: null,
  ...over,
})

describe('baldeDe — cada tarefa em exatamente um lugar', () => {
  it.each([
    ['atrasada de ontem', { date: '2026-09-02' }, 'atrasada'],
    ['hoje com hora já vencida', { date: HOJE, start_time: '08:00' }, 'atrasada'],
    ['hoje com hora à frente', { date: HOJE, start_time: '14:00' }, 'hoje'],
    ['hoje sem hora', { date: HOJE }, 'hoje'],
    ['sem data', { date: null }, 'sem_data'],
    ['em andamento sem data', { status: STATUS.IN_PROGRESS, date: null }, 'em_andamento'],
    ['em andamento de hoje', { status: STATUS.IN_PROGRESS, date: HOJE }, 'em_andamento'],
  ])('%s -> %s', (_, over, esperado) => {
    expect(baldeDe(t(over), ctx)).toBe(esperado)
  })

  it('ATRASO vence EM ANDAMENTO: começar não diminui o atraso', () => {
    expect(baldeDe(t({ status: STATUS.IN_PROGRESS, date: '2026-09-01' }), ctx)).toBe('atrasada')
  })

  it('EM ANDAMENTO vence HOJE: trabalho começado pesa mais que agendado', () => {
    expect(baldeDe(t({ status: STATUS.IN_PROGRESS, date: HOJE }), ctx)).toBe('em_andamento')
  })

  it('tarefa FUTURA com data não é assunto de Hoje', () => {
    expect(baldeDe(t({ date: '2026-09-10' }), ctx)).toBeNull()
  })

  it('fechadas não aparecem em Hoje', () => {
    for (const s of [STATUS.DONE, STATUS.MISSED, STATUS.CANCELLED, STATUS.NOT_NEEDED]) {
      expect(baldeDe(t({ status: s, date: HOJE }), ctx), s).toBeNull()
    }
  })

  it('reagendada para data passada NÃO some — o domínio não a chama de atrasada, a tela sim', () => {
    const tarefa = t({ status: STATUS.RESCHEDULED, date: '2026-08-20' })
    expect(estaAtrasada(tarefa, ctx)).toBe(true)
    expect(baldeDe(tarefa, ctx)).toBe('atrasada')
  })
})

describe('buildToday — a invariante da deduplicação', () => {
  const universo = [
    t({ date: '2026-09-01' }), // atrasada
    t({ status: STATUS.IN_PROGRESS, date: '2026-08-30' }), // atrasada E em andamento
    t({ status: STATUS.IN_PROGRESS, date: null }), // em andamento
    t({ status: STATUS.IN_PROGRESS, date: HOJE }), // em andamento E hoje
    t({ date: HOJE, start_time: '14:00' }), // hoje
    t({ date: HOJE }), // hoje
    t({ date: null }), // sem data
    t({ date: '2026-09-20' }), // futura: fora
    t({ status: STATUS.DONE, date: HOJE }), // fechada: fora
  ]

  it('nenhuma tarefa aparece em dois baldes', () => {
    const b = buildToday(universo, ctx)
    const ids = Object.values(b.baldes).flat().map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('as quatro contagens SOMAM o total — 2+2+2+1', () => {
    const b = buildToday(universo, ctx)
    expect(b.contagens).toEqual({ atrasada: 2, em_andamento: 2, hoje: 2, sem_data: 1 })
    expect(b.total).toBe(7)
    expect(Object.values(b.contagens).reduce((n, x) => n + x, 0)).toBe(b.total)
  })

  it('o destaque "próximo" não se repete na lista de hoje', () => {
    const b = buildToday(universo, ctx)
    expect(b.proximo?.start_time).toBe('14:00')
    expect(b.hojeSemProximo.some((x) => x.id === b.proximo.id)).toBe(false)
    expect(b.hojeSemProximo).toHaveLength(b.baldes.hoje.length - 1)
  })

  it('lista vazia não quebra', () => {
    const b = buildToday()
    expect(b.total).toBe(0)
    expect(b.vazio).toBe(true)
    expect(Object.keys(b.baldes)).toEqual(HOJE_BALDES.map((x) => x.key))
  })

  it('atrasadas vêm da mais antiga para a mais nova', () => {
    const b = buildToday(universo, ctx)
    expect(b.baldes.atrasada.map((x) => x.date)).toEqual(['2026-08-30', '2026-09-01'])
  })
})

describe('buildToday — os sete cenários do briefing', () => {
  it('A) nada hoje: a tela sabe que está vazia', () => {
    const b = buildToday([t({ date: '2026-09-20' }), t({ status: STATUS.DONE, date: HOJE })], ctx)
    expect(b.vazio).toBe(true)
    expect(b.proximo).toBeNull()
  })

  it('B) somente tarefa sem data', () => {
    const b = buildToday([t(), t()], ctx)
    expect(b.contagens).toEqual({ atrasada: 0, em_andamento: 0, hoje: 0, sem_data: 2 })
    expect(b.vazio).toBe(false)
  })

  it('C) somente atrasadas', () => {
    const b = buildToday([t({ date: '2026-09-01' }), t({ date: '2026-08-11' })], ctx)
    expect(b.contagens.atrasada).toBe(2)
    expect(b.total).toBe(2)
  })

  it('D) somente compromisso', () => {
    const b = buildToday([t({ date: HOJE, start_time: '16:00' })], ctx)
    expect(b.contagens.hoje).toBe(1)
    expect(b.proximo?.start_time).toBe('16:00')
    expect(b.compromissos).toHaveLength(1)
  })

  it('E) somente tarefa em andamento', () => {
    const b = buildToday([t({ status: STATUS.IN_PROGRESS })], ctx)
    expect(b.contagens.em_andamento).toBe(1)
    expect(b.proximo).toBeNull()
  })

  it('F) dia cheio: nada some e nada duplica', () => {
    const cheio = [
      ...Array.from({ length: 6 }, (_, i) => t({ date: HOJE, start_time: `1${i}:00` })),
      ...Array.from({ length: 5 }, () => t({ date: HOJE })),
      ...Array.from({ length: 4 }, () => t({ date: '2026-08-25' })),
    ]
    const b = buildToday(cheio, ctx)
    expect(b.total).toBe(15)
    // 10:00 ja passou (agora = 10:00 -> >= agora, entao 10:00 conta como proximo)
    expect(b.proximo).not.toBeNull()
    expect(new Set(Object.values(b.baldes).flat().map((x) => x.id)).size).toBe(15)
  })

  it('G) mistura de todos os tipos', () => {
    const b = buildToday(
      [
        t({ date: '2026-09-01' }),
        t({ status: STATUS.IN_PROGRESS }),
        t({ date: HOJE, start_time: '15:00' }),
        t(),
      ],
      ctx,
    )
    expect(b.contagens).toEqual({ atrasada: 1, em_andamento: 1, hoje: 1, sem_data: 1 })
  })

  it('muitas atrasadas continuam contadas por inteiro (quem corta é a tela)', () => {
    const b = buildToday(
      Array.from({ length: 20 }, (_, i) => t({ date: `2026-08-${String(i + 1).padStart(2, '0')}` })),
      ctx,
    )
    expect(b.contagens.atrasada).toBe(20)
  })
})

describe('proximidade — leitura temporal sem inventar hora', () => {
  it('não diz nada sobre tarefa sem horário', () => {
    expect(minutosAte(null, AGORA)).toBeNull()
    expect(proximidade(null, AGORA)).toBeNull()
  })

  it('conta os minutos quando está perto', () => {
    expect(proximidade('10:25', AGORA)).toEqual({ texto: 'em 25 min', tom: 'breve' })
  })

  it('vira horas depois de uma hora', () => {
    expect(proximidade('11:30', AGORA)).toEqual({ texto: 'em 1h30', tom: 'breve' })
    expect(proximidade('12:00', AGORA)).toEqual({ texto: 'em 2h', tom: 'breve' })
  })

  it('cala a boca quando falta muito — "em 360 min" não ajuda ninguém', () => {
    expect(proximidade('18:00', AGORA)).toBeNull()
  })

  it('reconhece o que está acontecendo agora', () => {
    expect(proximidade('10:00', AGORA).tom).toBe('agora')
    expect(proximidade('09:30', AGORA)).toEqual({ texto: 'começou', tom: 'agora' })
  })
})
