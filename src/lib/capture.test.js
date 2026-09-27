import { describe, it, expect } from 'vitest'
import { tipoDaProposta, destinoDaProposta, TIPOS, ESTADOS } from './capture'

const p = (intent, payload = {}) => ({ intent, payload })

describe('tipoDaProposta — o TIPO e derivado, nunca escolhido antes de escrever', () => {
  it('hora marcada é compromisso', () => {
    expect(tipoDaProposta(p('create_task', { title: 'X', date: '2026-09-04', start_time: '08:30' })))
      .toEqual(TIPOS.compromisso)
  })

  it('sem hora é tarefa — mesmo tendo data', () => {
    expect(tipoDaProposta(p('create_task', { title: 'X', date: '2026-09-04' }))).toEqual(TIPOS.tarefa)
  })

  it('sem data nenhuma continua sendo tarefa (sem data é informação, não falta dela)', () => {
    expect(tipoDaProposta(p('create_task', { title: 'X' }))).toEqual(TIPOS.tarefa)
  })

  it('link é link', () => {
    expect(tipoDaProposta(p('create_link', { url: 'https://x.dev' }))).toEqual(TIPOS.link)
  })

  it.each(['update_task', 'reschedule_task', 'complete_task', 'mark_missed', 'cancel_task', 'delete_task'])(
    '%s é ALTERAÇÃO, não um artefato novo',
    (intent) => {
      expect(tipoDaProposta(p(intent, { title: 'X', start_time: '09:00' }))).toEqual(TIPOS.alteracao)
    },
  )

  it('sem proposta não há tipo', () => {
    expect(tipoDaProposta(null)).toBeNull()
    expect(tipoDaProposta(undefined)).toBeNull()
  })
})

describe('destinoDaProposta — depois de confirmar, dizer PARA ONDE foi', () => {
  it.each([
    [p('create_task', { start_time: '10:00' }), 'Criado na Agenda.'],
    [p('create_task', {}), 'Criado em Tarefas.'],
    [p('create_link', {}), 'Criado em Links.'],
    [p('update_task', {}), 'Atualizado.'],
  ])('%o -> %s', (proposta, esperado) => {
    expect(destinoDaProposta(proposta)).toBe(esperado)
  })

  it('sem proposta não afirma nada', () => {
    expect(destinoDaProposta(null)).toBeNull()
  })
})

describe('estados da superfície', () => {
  it('os onze estados do briefing estão nomeados', () => {
    expect(ESTADOS).toHaveLength(11)
    expect(ESTADOS).toContain('nao_interpretado')
    expect(ESTADOS).toContain('recuperado')
  })
})
