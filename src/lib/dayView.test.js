import { describe, it, expect } from 'vitest'
import { partitionDayTasks, timeToHour, resolveDayDate } from './dayView'

const T = (over) => ({ id: Math.random().toString(36).slice(2), title: 'x', ...over })

describe('A1 — resolveDayDate (precedencia do ?date)', () => {
  it('parametro ?date manda sobre o fallback', () => {
    expect(resolveDayDate('2026-07-20', '2026-07-11')).toBe('2026-07-20')
  })
  it('usa o fallback quando nao ha parametro', () => {
    expect(resolveDayDate(null, '2026-07-11')).toBe('2026-07-11')
    expect(resolveDayDate('', '2026-07-11')).toBe('2026-07-11')
  })
})

describe('A2 — timeToHour', () => {
  it('extrai a hora inteira', () => {
    expect(timeToHour('05:30')).toBe(5)
    expect(timeToHour('23:59')).toBe(23)
    expect(timeToHour('00:00')).toBe(0)
  })
  it('retorna null para ausente/invalido', () => {
    expect(timeToHour('')).toBeNull()
    expect(timeToHour(null)).toBeNull()
    expect(timeToHour(undefined)).toBeNull()
  })
})

describe('A2 — partitionDayTasks (nenhuma tarefa some)', () => {
  it('separa sem-horario, dentro e fora da grade (06-23)', () => {
    const tasks = [
      T({ start_time: null }), // untimed
      T({ start_time: '' }), // untimed
      T({ start_time: '05:00' }), // fora (antes das 06)
      T({ start_time: '02:30' }), // fora
      T({ start_time: '06:00' }), // dentro (borda)
      T({ start_time: '23:00' }), // dentro (borda)
      T({ start_time: '09:00' }), // dentro
    ]
    const { untimed, timed, outOfGrid } = partitionDayTasks(tasks, {
      startHour: 6,
      endHour: 23,
    })
    expect(untimed).toHaveLength(2)
    expect(timed).toHaveLength(3)
    expect(outOfGrid).toHaveLength(2)
    // total preservado: nada desaparece
    expect(untimed.length + timed.length + outOfGrid.length).toBe(tasks.length)
    // fora da grade ordenado por horario
    expect(outOfGrid.map((t) => t.start_time)).toEqual(['02:30', '05:00'])
  })

  it('a tarefa das 05:00 nao fica invisivel (vai para fora da grade)', () => {
    const { outOfGrid, timed } = partitionDayTasks([T({ start_time: '05:00' })], {
      startHour: 6,
      endHour: 23,
    })
    expect(timed).toHaveLength(0)
    expect(outOfGrid).toHaveLength(1)
  })
})
