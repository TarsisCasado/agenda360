import { describe, it, expect } from 'vitest'
import {
  CANAL_PADRAO,
  PEDIR_HORARIO,
  alertaPrecisaDeHorario,
  validarAlerta,
  mudancaMexeNoAlerta,
} from './alertRules'
import { ALERT_TYPES } from './constants'
import { computeRemindAt } from './reminderTime'

// ---------------------------------------------------------------------------
// CP5.8.1 — a regra do alerta, no lugar onde ela e uma regra e nao uma tela.
// ---------------------------------------------------------------------------
describe('canal padrão', () => {
  it('é PUSH — in_app não tinha consumidor e o worker só entrega push', () => {
    expect(CANAL_PADRAO).toBe(ALERT_TYPES.PUSH)
  })
})

describe('um alerta precisa de horário', () => {
  it('sem horário, o motor não produz lembrete nenhum — a razão da regra', () => {
    // Isto NAO e opiniao: e o comportamento medido de computeRemindAt.
    expect(computeRemindAt('2026-09-10', null, 30, 'America/Fortaleza')).toBeNull()
    expect(computeRemindAt('2026-09-10', '14:00', 30, 'America/Fortaleza')).toBe(
      '2026-09-10T16:30:00.000Z', // 14:00 em Fortaleza = 17:00Z, menos 30min
    )
  })

  it('alerta ligado sem hora: recusa, com a frase do produto', () => {
    const r = validarAlerta({ alert_enabled: true, date: '2026-09-10', start_time: null })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('sem_horario')
    expect(r.mensagem).toBe(PEDIR_HORARIO)
  })

  it('alerta ligado sem dia: recusa (hora sem dia não existe na agenda)', () => {
    const r = validarAlerta({ alert_enabled: true, date: null, start_time: '09:00' })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('sem_data')
  })

  it('alerta ligado com dia e hora: passa', () => {
    expect(validarAlerta({ alert_enabled: true, date: '2026-09-10', start_time: '09:00' }).ok).toBe(true)
  })

  it('sem alerta, tarefa sem data e sem hora continua perfeitamente válida', () => {
    expect(validarAlerta({ alert_enabled: false }).ok).toBe(true)
    expect(validarAlerta({}).ok).toBe(true)
  })

  it('alertaPrecisaDeHorario responde só sobre a hora', () => {
    expect(alertaPrecisaDeHorario({ alert_enabled: true })).toBe(true)
    expect(alertaPrecisaDeHorario({ alert_enabled: true, start_time: '08:00' })).toBe(false)
    expect(alertaPrecisaDeHorario({ alert_enabled: false })).toBe(false)
  })
})

describe('a regra não pune o passado', () => {
  it('só vale quando a mudança mexe no alerta ou na hora', () => {
    expect(mudancaMexeNoAlerta({ title: 'novo titulo' })).toBe(false)
    expect(mudancaMexeNoAlerta({ status: 'done' })).toBe(false)
    expect(mudancaMexeNoAlerta({ alert_enabled: true })).toBe(true)
    expect(mudancaMexeNoAlerta({ start_time: null })).toBe(true)
  })
})
