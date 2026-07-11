import { describe, it, expect } from 'vitest'
import {
  greeting,
  daySummary,
  completionStreak,
  weeklyProgress,
  buildInsights,
} from './insights'
import { STATUS } from './constants'

// Helper para montar tarefa minima.
const T = (over) => ({
  id: Math.random().toString(36).slice(2),
  title: 'Tarefa',
  date: '2026-07-11',
  status: STATUS.TODO,
  priority: 'medium',
  category_id: null,
  ...over,
})

describe('insights.greeting', () => {
  it('varia por periodo do dia', () => {
    expect(greeting(new Date('2026-07-11T08:00:00'))).toBe('Bom dia')
    expect(greeting(new Date('2026-07-11T14:00:00'))).toBe('Boa tarde')
    expect(greeting(new Date('2026-07-11T21:00:00'))).toBe('Boa noite')
  })
})

describe('insights.daySummary', () => {
  it('agenda vazia', () => {
    expect(daySummary({ pending: 0, done: 0, overdue: 0 })).toMatch(/livre/i)
  })
  it('tudo concluido', () => {
    expect(daySummary({ pending: 0, done: 3 })).toMatch(/impecável/i)
  })
  it('dia tranquilo', () => {
    expect(daySummary({ pending: 1, overdue: 0 })).toMatch(/tranquila/i)
  })
  it('muitas atrasadas', () => {
    expect(daySummary({ pending: 2, overdue: 4 })).toMatch(/reorganizar/i)
  })
})

describe('insights.completionStreak', () => {
  it('conta dias consecutivos com conclusao terminando hoje', () => {
    const tasks = [
      T({ date: '2026-07-11', status: STATUS.DONE }),
      T({ date: '2026-07-10', status: STATUS.DONE }),
      T({ date: '2026-07-09', status: STATUS.DONE }),
      // quebra em 08
      T({ date: '2026-07-07', status: STATUS.DONE }),
    ]
    expect(completionStreak(tasks, '2026-07-11')).toBe(3)
  })
  it('permite comecar por ontem se hoje ainda sem conclusao', () => {
    const tasks = [
      T({ date: '2026-07-10', status: STATUS.DONE }),
      T({ date: '2026-07-09', status: STATUS.DONE }),
    ]
    expect(completionStreak(tasks, '2026-07-11')).toBe(2)
  })
  it('sem conclusoes = 0', () => {
    expect(completionStreak([T({ status: STATUS.TODO })], '2026-07-11')).toBe(0)
  })
})

describe('insights.weeklyProgress', () => {
  it('conta concluidas da semana (seg-dom)', () => {
    // 2026-07-11 e sabado; semana = 06(seg)..12(dom)
    const tasks = [
      T({ date: '2026-07-06', status: STATUS.DONE }),
      T({ date: '2026-07-08', status: STATUS.DONE }),
      T({ date: '2026-07-05', status: STATUS.DONE }), // fora (domingo anterior)
    ]
    const r = weeklyProgress(tasks, '2026-07-11', 10)
    expect(r.done).toBe(2)
    expect(r.goal).toBe(10)
    expect(r.pct).toBe(20)
  })
})

describe('insights.buildInsights', () => {
  it('sugere repetir habito recorrente no mesmo dia da semana', () => {
    // hoje 2026-07-11 (sabado). Treino ocorreu nos 2 sabados anteriores.
    const tasks = [
      T({ title: 'Treino na academia', date: '2026-07-04', status: STATUS.DONE }),
      T({ title: 'Treino na academia', date: '2026-06-27', status: STATUS.DONE }),
    ]
    const ins = buildInsights(tasks, { today: '2026-07-11' })
    const habit = ins.find((i) => i.type === 'habit')
    expect(habit).toBeTruthy()
    expect(habit.cta.kind).toBe('create')
    expect(habit.cta.payload.title).toMatch(/treino/i)
  })

  it('alerta quando ha muitas atrasadas', () => {
    const tasks = [
      T({ date: '2026-07-01', status: STATUS.TODO, start_time: '09:00' }),
      T({ date: '2026-07-02', status: STATUS.TODO, start_time: '09:00' }),
      T({ date: '2026-07-03', status: STATUS.TODO, start_time: '09:00' }),
    ]
    const ins = buildInsights(tasks, { today: '2026-07-11' })
    expect(ins.some((i) => i.type === 'overdue')).toBe(true)
  })

  it('fallback de dia calmo quando nao ha nada relevante', () => {
    const ins = buildInsights([], { today: '2026-07-11' })
    expect(ins[0].type).toBe('calm')
  })
})
