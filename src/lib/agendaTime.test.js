import { describe, it, expect } from 'vitest'
import { toMinutes, blockGeometry } from './agendaTime'

describe('agendaTime — geometria da timeline', () => {
  it('toMinutes converte HH:MM', () => {
    expect(toMinutes('06:00')).toBe(360)
    expect(toMinutes('08:30')).toBe(510)
    expect(toMinutes('')).toBe(0)
    expect(toMinutes(null)).toBe(0)
  })

  it('bloco posiciona a partir da hora inicial da grade', () => {
    // 08:00–09:00 com grade a partir das 06:00, 56px/h => top = 2h*56=112
    const g = blockGeometry('08:00', '09:00', { startHour: 6, hourPx: 56 })
    expect(g.top).toBe(112)
    expect(g.height).toBe(56 - 4)
  })

  it('sem end_time assume 60 min', () => {
    const g = blockGeometry('06:00', null, { startHour: 6, hourPx: 56 })
    expect(g.top).toBe(0)
    expect(g.height).toBe(52)
  })

  it('respeita altura minima para eventos muito curtos', () => {
    const g = blockGeometry('06:00', '06:05', { startHour: 6, hourPx: 56, minHeight: 30 })
    expect(g.height).toBe(30)
  })

  it('evento mais longo ocupa proporcionalmente mais', () => {
    const g = blockGeometry('06:00', '09:00', { startHour: 6, hourPx: 56 })
    expect(g.height).toBe(3 * 56 - 4)
  })
})
