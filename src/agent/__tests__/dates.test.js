import { describe, it, expect } from 'vitest'
import { mockInterpret } from '../providers/mockProvider'
import { toISODate, fromISODate } from '../../lib/date'

// Datas/fuso — cenarios criticos (sem deslocamento de 1 dia; datas relativas
// baseadas no "hoje" do contexto = timezone local do usuario).

describe('Round-trip de data (sem deslocamento de fuso)', () => {
  it('toISODate(fromISODate(x)) preserva a data em varios dias', () => {
    for (const d of ['2026-01-01', '2026-03-15', '2026-07-31', '2026-12-31', '2027-02-28']) {
      expect(toISODate(fromISODate(d))).toBe(d)
    }
  })

  it('fromISODate interpreta como data local (meia-noite local, nao UTC)', () => {
    const dt = fromISODate('2026-07-15')
    expect(dt.getFullYear()).toBe(2026)
    expect(dt.getMonth()).toBe(6) // julho (0-based)
    expect(dt.getDate()).toBe(15)
    expect(dt.getHours()).toBe(0) // meia-noite LOCAL
  })
})

describe('"amanha" com o timezone/hoje do contexto', () => {
  it('vira o proximo dia mesmo na virada de mes', () => {
    const r = mockInterpret('Agende tarefa pagar contas amanha', { today: '2026-07-31', categories: [] })
    expect(r.data.date).toBe('2026-08-01')
  })
  it('vira o proximo dia na virada de ano', () => {
    const r = mockInterpret('Agende tarefa balanco amanha', { today: '2026-12-31', categories: [] })
    expect(r.data.date).toBe('2027-01-01')
  })
  it('formato de data e sempre YYYY-MM-DD', () => {
    const r = mockInterpret('Agende tarefa x amanha', { today: '2026-07-15', categories: [] })
    expect(r.data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('"sexta" escolhe a proxima sexta FUTURA', () => {
  const cases = [
    { today: '2026-07-13', expected: '2026-07-17' }, // segunda -> sexta desta semana
    { today: '2026-07-15', expected: '2026-07-17' }, // quarta -> sexta desta semana
    { today: '2026-07-17', expected: '2026-07-24' }, // sexta -> proxima sexta (nao hoje)
    { today: '2026-07-18', expected: '2026-07-24' }, // sabado -> sexta seguinte
  ]
  for (const c of cases) {
    it(`hoje ${c.today} -> ${c.expected}`, () => {
      const r = mockInterpret('Agende tarefa reuniao sexta', { today: c.today, categories: [] })
      expect(r.data.date).toBe(c.expected)
    })
  }
})

describe('Horario: ambiguo vs explicito', () => {
  it('"as 8" e ambiguo e pede confirmacao', () => {
    const r = mockInterpret('Agende tarefa dentista as 8', { today: '2026-07-15', categories: [] })
    expect(r.ambiguities).toContain('horario')
    expect(r.needs_clarification).toBe(true)
  })
  it('"as 15h" e explicito (sem ambiguidade)', () => {
    const r = mockInterpret('Agende reuniao as 15h', { today: '2026-07-15', categories: [] })
    expect(r.data.start_time).toBe('15:00')
    expect(r.ambiguities).not.toContain('horario')
  })
  it('"as 20h" e explicito e formato HH:MM', () => {
    const r = mockInterpret('Agende jantar as 20h', { today: '2026-07-15', categories: [] })
    expect(r.data.start_time).toMatch(/^\d{2}:\d{2}$/)
    expect(r.data.start_time).toBe('20:00')
  })
})
