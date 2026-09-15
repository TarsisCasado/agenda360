import { describe, it, expect } from 'vitest'
import { plural, pluralize } from './plural'

describe('plural pt-BR', () => {
  it('escolhe a forma inteira da palavra (nunca concatena sufixo)', () => {
    expect(plural(1, 'anotação', 'anotações')).toBe('anotação')
    expect(plural(2, 'anotação', 'anotações')).toBe('anotações')
    expect(plural(0, 'anotação', 'anotações')).toBe('anotações')
  })

  it('pluralize monta contagem + palavra', () => {
    expect(pluralize(0, 'anotação', 'anotações')).toBe('0 anotações')
    expect(pluralize(1, 'anotação', 'anotações')).toBe('1 anotação')
    expect(pluralize(2, 'anotação', 'anotações')).toBe('2 anotações')
    expect(pluralize(12, 'tarefa', 'tarefas')).toBe('12 tarefas')
  })

  it('regressao: "2 anotaçõões" nao pode acontecer', () => {
    expect(pluralize(2, 'anotação', 'anotações')).not.toMatch(/õõ|ãoõ/)
  })

  it('tolera valores invalidos', () => {
    expect(pluralize(undefined, 'item', 'itens')).toBe('0 itens')
    expect(pluralize(null, 'item', 'itens')).toBe('0 itens')
  })
})
