import { describe, it, expect } from 'vitest'
import { computeRemindAt } from './reminderTime'

describe('computeRemindAt — fuso do destinatario, deterministico', () => {
  it('America/Sao_Paulo (UTC-3, sem DST): 09:00 -15min = 11:45Z', () => {
    expect(computeRemindAt('2026-08-15', '09:00', 15, 'America/Sao_Paulo'))
      .toBe('2026-08-15T11:45:00.000Z')
  })

  it('minutes_before = 0: remind_at = o proprio horario', () => {
    expect(computeRemindAt('2026-08-15', '09:00', 0, 'America/Sao_Paulo'))
      .toBe('2026-08-15T12:00:00.000Z')
  })

  it('Asia/Tokyo (UTC+9): 09:00 = 00:00Z', () => {
    expect(computeRemindAt('2026-08-15', '09:00', 0, 'Asia/Tokyo'))
      .toBe('2026-08-15T00:00:00.000Z')
  })

  it('America/New_York respeita DST: verao (EDT -4) vs inverno (EST -5)', () => {
    expect(computeRemindAt('2026-07-01', '09:00', 0, 'America/New_York'))
      .toBe('2026-07-01T13:00:00.000Z') // EDT
    expect(computeRemindAt('2026-01-15', '09:00', 0, 'America/New_York'))
      .toBe('2026-01-15T14:00:00.000Z') // EST
  })

  it('antecedencia atravessa o dia (00:15 -30min = dia anterior)', () => {
    expect(computeRemindAt('2026-08-15', '00:15', 30, 'America/Sao_Paulo'))
      .toBe('2026-08-15T02:45:00.000Z') // 00:15-03 => 03:15Z; -30 => 02:45Z
  })

  it('sem data ou sem hora -> null (nao ha lembrete a calcular)', () => {
    expect(computeRemindAt(null, '09:00', 15, 'America/Sao_Paulo')).toBeNull()
    expect(computeRemindAt('2026-08-15', '', 15, 'America/Sao_Paulo')).toBeNull()
  })

  it('fuso ausente ou invalido -> lanca (surfado como falha, nunca silencioso)', () => {
    expect(() => computeRemindAt('2026-08-15', '09:00', 15, '')).toThrow(/timezone/i)
    expect(() => computeRemindAt('2026-08-15', '09:00', 15, 'Nao/EexisteZ')).toThrow(/invalido/i)
  })
})
