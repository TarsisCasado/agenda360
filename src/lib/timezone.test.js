import { describe, it, expect } from 'vitest'
import {
  FUSO_PADRAO,
  detectarFuso,
  fusoValido,
  offsetLegivel,
  rotuloFuso,
  deveSincronizar,
} from './timezone'
import { computeRemindAt } from './reminderTime'

describe('fuso — IANA por dentro, cidade por fora', () => {
  it('reconhece um IANA válido e recusa lixo', () => {
    expect(fusoValido('America/Fortaleza')).toBe(true)
    expect(fusoValido('Europe/Lisbon')).toBe(true)
    expect(fusoValido('')).toBe(false)
    expect(fusoValido('GMT-3')).toBe(false)
    expect(fusoValido('Marte/Olympus')).toBe(false)
  })

  it('detecta o fuso do aparelho (ou null, nunca um chute)', () => {
    const tz = detectarFuso()
    expect(tz === null || fusoValido(tz)).toBe(true)
  })

  it('mostra a cidade, não o IANA', () => {
    const setembro = new Date('2026-09-10T12:00:00Z')
    expect(rotuloFuso('America/Fortaleza', setembro)).toBe('Fortaleza (GMT−3)')
    expect(rotuloFuso('America/Sao_Paulo', setembro)).toBe('Sao Paulo (GMT−3)')
    expect(rotuloFuso('lixo', setembro)).toBe('—')
  })

  it('offset acompanha o horário de verão do fuso', () => {
    // Lisboa: verão (WEST, GMT+1) e inverno (WET, GMT+0).
    expect(offsetLegivel('Europe/Lisbon', new Date('2026-07-10T12:00:00Z'))).toBe('GMT+1')
    expect(offsetLegivel('Europe/Lisbon', new Date('2026-01-10T12:00:00Z'))).toBe('GMT+0')
  })

  it('DST não desalinha o cálculo do lembrete', () => {
    // Mesmo relógio de parede, dois lados do horário de verão de Lisboa:
    // instantes UTC diferentes, exatamente como tem de ser.
    const verao = computeRemindAt('2026-07-10', '14:00', 30, 'Europe/Lisbon')
    const inverno = computeRemindAt('2026-01-10', '14:00', 30, 'Europe/Lisbon')
    expect(verao).toBe('2026-07-10T12:30:00.000Z') // 14:00 WEST = 13:00Z, −30min
    expect(inverno).toBe('2026-01-10T13:30:00.000Z') // 14:00 WET = 14:00Z, −30min
  })
})

describe('sincronizar o fuso só quando é seguro', () => {
  it('sem nada guardado, sincroniza', () => {
    expect(deveSincronizar(null, 'America/Fortaleza')).toBe(true)
  })

  it('guardado é o default que ninguém escolheu: sincroniza', () => {
    expect(deveSincronizar(FUSO_PADRAO, 'America/Fortaleza')).toBe(true)
  })

  it('guardado é uma escolha: NÃO sobrescreve porque a pessoa viajou', () => {
    expect(deveSincronizar('America/Fortaleza', 'Europe/Lisbon')).toBe(false)
  })

  it('igual não mexe; detecção inválida não mexe', () => {
    expect(deveSincronizar('America/Fortaleza', 'America/Fortaleza')).toBe(false)
    expect(deveSincronizar(FUSO_PADRAO, null)).toBe(false)
    expect(deveSincronizar(FUSO_PADRAO, 'lixo')).toBe(false)
  })
})
