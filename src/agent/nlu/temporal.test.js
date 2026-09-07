import { describe, it, expect } from 'vitest'
import { resolveTemporal, resolveTemporalAnswer } from './temporal'

// Hoje fixo: DOMINGO 2026-08-23 (mesmo dia do QA real no iPhone).
const CTX = { today: '2026-08-23', now: '19:06' }

const t = (text, ctx = CTX) => resolveTemporal(text, ctx)

describe('temporal — datas relativas PT-BR', () => {
  const cases = [
    ['hoje eu resolvo isso', '2026-08-23'],
    ['amanhã tenho reunião', '2026-08-24'],
    ['depois de amanhã', '2026-08-25'],
    ['sexta tenho reunião', '2026-08-28'],
    ['sexta-feira tenho reunião', '2026-08-28'],
    ['próxima sexta', '2026-08-28'],
    ['na segunda', '2026-08-24'],
    ['daqui a 3 dias', '2026-08-26'],
    ['12/09', '2026-09-12'],
    ['12/09/2027', '2027-09-12'],
  ]
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => {
      expect(t(text).date).toBe(expected)
    })
  }

  it('"depois de amanhã" nao e lido como "amanhã"', () => {
    expect(t('depois de amanhã às 9h').date).toBe('2026-08-25')
  })

  it('dia da semana sempre aponta para o FUTURO (nunca hoje)', () => {
    // 2026-08-28 e uma sexta: "sexta" naquele dia significa a sexta seguinte.
    expect(resolveTemporal('sexta', { today: '2026-08-28' }).date).toBe('2026-09-04')
  })

  it('data inexistente (31/02) e ignorada em vez de virar outro dia', () => {
    expect(t('reunião 31/02').date).toBeNull()
  })

  it('sem expressao temporal NAO inventa data', () => {
    const r = t('preciso resolver o problema da Renault')
    expect(r.date).toBeNull()
    expect(r.range).toBeNull()
    expect(r.hasTemporal).toBe(false)
  })
})

describe('temporal — "semana que vem" e um INTERVALO, nao um dia', () => {
  it('devolve range de segunda a domingo e nenhuma data unica', () => {
    const r = t('preciso resolver o problema da Renault semana que vem')
    expect(r.date).toBeNull()
    expect(r.range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
  })
})

describe('temporal — horarios', () => {
  const cases = [
    ['reunião às 08:30h', '08:30'],
    ['reunião às 08:30hs', '08:30'],
    ['reunião às 8h30', '08:30'],
    ['reunião às 8:30', '08:30'],
    ['reunião 08:30', '08:30'],
    ['reunião às 15h', '15:00'],
    ['reunião as 20 horas', '20:00'],
    ['almoço meio-dia', '12:00'],
  ]
  for (const [text, expected] of cases) {
    it(`"${text}" -> ${expected}`, () => {
      expect(t(text).time).toBe(expected)
    })
  }

  it('"às 9" (hora cheia, sem periodo) e AMBIGUO', () => {
    const r = t('reunião com o Jander às 9')
    expect(r.time).toBe('09:00')
    expect(r.timeAmbiguous).toBe(true)
  })

  it('"às 8:30" NAO e ambiguo (minutos explicitos)', () => {
    expect(t('reunião às 8:30').timeAmbiguous).toBe(false)
  })

  it('periodo do dia desambigua a hora: "às 9 da noite" -> 21:00', () => {
    const r = t('reunião às 9 da noite')
    expect(r.time).toBe('21:00')
    expect(r.timeAmbiguous).toBe(false)
  })

  it('"amanhã" nunca e lido como o periodo "manhã"', () => {
    const r = t('dentista amanhã às 8')
    expect(r.date).toBe('2026-08-24')
    expect(r.daypart).toBeNull()
    expect(r.timeAmbiguous).toBe(true)
  })

  it('"daqui a duas horas" usa a hora atual do contexto', () => {
    const r = t('ligar pro Jander daqui a duas horas')
    expect(r.time).toBe('21:06')
    expect(r.date).toBe('2026-08-23')
  })

  it('"daqui a 2 dias" nao vira horario 02:00', () => {
    const r = t('resolver isso daqui a 2 dias')
    expect(r.date).toBe('2026-08-25')
    expect(r.time).toBeNull()
  })
})

describe('temporal — periodos do dia NAO viram horario inventado', () => {
  const cases = [
    ['pagar isso depois do almoço', 'depois_do_almoco'],
    ['reunião de manhã', 'manha'],
    ['reunião à tarde', 'tarde'],
    ['reunião à noite', 'noite'],
    ['reunião no fim do dia', 'fim_do_dia'],
  ]
  for (const [text, daypart] of cases) {
    it(`"${text}" -> daypart ${daypart} e start_time nulo`, () => {
      const r = t(text)
      expect(r.daypart).toBe(daypart)
      expect(r.time).toBeNull()
    })
  }
})

describe('temporal — respostas curtas (slot-filling)', () => {
  it('"8:30" isolado e horario', () => {
    const r = resolveTemporalAnswer('8:30', CTX)
    expect(r.time).toBe('08:30')
    expect(r.timeAmbiguous).toBe(false)
  })
  it('"9" isolado e horario ambiguo', () => {
    const r = resolveTemporalAnswer('9', CTX)
    expect(r.time).toBe('09:00')
    expect(r.timeAmbiguous).toBe(true)
  })
  it('"08:30hs" isolado', () => {
    expect(resolveTemporalAnswer('08:30hs', CTX).time).toBe('08:30')
  })
  it('"depois do almoço" isolado e periodo, sem horario', () => {
    const r = resolveTemporalAnswer('depois do almoço', CTX)
    expect(r.daypart).toBe('depois_do_almoco')
    expect(r.time).toBeNull()
  })
  it('"amanhã" isolado e data', () => {
    expect(resolveTemporalAnswer('amanhã', CTX).date).toBe('2026-08-24')
  })
  it('"sem horário" marca o slot como dispensado', () => {
    expect(resolveTemporalAnswer('sem horário', CTX).skip).toBe(true)
  })
})
