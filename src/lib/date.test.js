import { describe, it, expect } from 'vitest'
import { formatShort, isTaskOverdue, byTime } from './date'

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
