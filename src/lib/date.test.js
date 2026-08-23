import { describe, it, expect } from 'vitest'
import { formatShort, formatTimestamp, fromISODate, toDate, isDateOnly, isTaskOverdue, byTime } from './date'

// Estabilizacao T1.2A: helpers de data nao podem quebrar com atividades sem
// data (date NULL). Nada de Invalid Date, nada de "atrasada" sem data.
describe('date helpers — atividades sem data (date NULL)', () => {
  it('formatShort(null) retorna rotulo neutro em vez de Invalid Date', () => {
    expect(formatShort(null)).toBe('sem data')
    expect(formatShort(undefined)).toBe('sem data')
    expect(formatShort('')).toBe('sem data')
  })

  it('formatShort continua formatando datas validas', () => {
    expect(formatShort('2026-07-20')).toBe('20/07/2026')
  })

  it('isTaskOverdue nunca marca atividade sem data como atrasada', () => {
    expect(isTaskOverdue({ status: 'todo', date: null })).toBe(false)
    expect(isTaskOverdue({ status: 'in_progress', date: null })).toBe(false)
  })

  it('isTaskOverdue segue marcando atividade com data passada', () => {
    expect(isTaskOverdue({ status: 'todo', date: '2000-01-01' })).toBe(true)
  })

  it('byTime ordena atividade sem horario para o fim', () => {
    const withTime = { start_time: '09:00' }
    const noTime = { start_time: null }
    expect([noTime, withTime].sort(byTime)).toEqual([withTime, noTime])
  })
})

// ---------------------------------------------------------------------------
// REGRESSAO P0 — crash "Invalid time value" na tela de Ideias.
// Causa raiz: created_at/updated_at sao TIMESTAMPS ISO, mas eram passados a um
// formatador de DATA PURA. fromISODate fazia split('-') e produzia Invalid Date,
// que so estourava (RangeError) dentro do format() do date-fns, derrubando a rota.
// ---------------------------------------------------------------------------
describe('date — timestamp x data pura (regressao "Invalid time value")', () => {
  const TIMESTAMP = '2026-08-22T18:28:11.123Z' // valor real do QA no iPhone

  it('formatShort com TIMESTAMP nao lanca RangeError', () => {
    expect(() => formatShort(TIMESTAMP)).not.toThrow()
  })

  it('fromISODate so aceita YYYY-MM-DD e devolve null para o resto', () => {
    expect(fromISODate(TIMESTAMP)).toBeNull()
    expect(fromISODate('2026-08-32')).toBeNull() // dia inexistente
    expect(fromISODate('2026-02-31')).toBeNull() // nao "rola" para 03/03
    expect(fromISODate('')).toBeNull()
    expect(fromISODate(null)).toBeNull()
    expect(fromISODate('2026-08-22')).toBeInstanceOf(Date)
  })

  it('isDateOnly separa os dois tipos', () => {
    expect(isDateOnly('2026-08-22')).toBe(true)
    expect(isDateOnly(TIMESTAMP)).toBe(false)
  })

  it('toDate aceita timestamp, data pura e Date; recusa lixo', () => {
    expect(toDate(TIMESTAMP)).toBeInstanceOf(Date)
    expect(toDate('2026-08-22')).toBeInstanceOf(Date)
    expect(toDate(new Date('nope'))).toBeNull()
    expect(toDate('nao e data')).toBeNull()
  })

  it('formatTimestamp formata sem lancar e sem Invalid Date', () => {
    const now = new Date('2026-08-22T20:00:00.000Z')
    expect(formatTimestamp(TIMESTAMP, now)).toMatch(/^\d{2}:\d{2}$/) // mesmo dia -> hora
    expect(formatTimestamp('2026-01-05T10:00:00.000Z', now)).not.toMatch(/Invalid/)
    expect(formatTimestamp(null)).toBe('')
    expect(formatTimestamp('quebrado')).toBe('')
  })

  it('nenhum formatador lanca para os valores problematicos conhecidos', () => {
    for (const value of [TIMESTAMP, null, undefined, '', 'x', '2026-13-01', 0, {}]) {
      expect(() => formatShort(value)).not.toThrow()
      expect(() => formatTimestamp(value)).not.toThrow()
    }
  })
})
