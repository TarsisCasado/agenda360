import { describe, it, expect } from 'vitest'
import { firstLine, ideaTitle, ideaSnippet, sortIdeasByRecent } from './ideas'

describe('ideas — derivacao de titulo/resumo', () => {
  it('firstLine ignora linhas em branco', () => {
    expect(firstLine('\n\n  Primeira real\nsegunda')).toBe('  Primeira real')
    expect(firstLine('')).toBe('')
    expect(firstLine(null)).toBe('')
  })

  it('ideaTitle usa o title explicito quando existe', () => {
    expect(ideaTitle({ title: 'Reuniao', content: 'corpo' })).toBe('Reuniao')
  })

  it('ideaTitle cai para a 1a linha do corpo quando nao ha title', () => {
    expect(ideaTitle({ title: '  ', content: 'Comprar cafe\nleite' })).toBe('Comprar cafe')
  })

  it('ideaTitle usa o fallback quando tudo vazio', () => {
    expect(ideaTitle({ title: '', content: '' })).toBe('Sem título')
    expect(ideaTitle({}, 'Vazio')).toBe('Vazio')
  })

  it('ideaSnippet retorna a 1a linha do corpo diferente do titulo', () => {
    expect(ideaSnippet({ title: 'Titulo', content: 'Titulo\nlinha de resumo' })).toBe('linha de resumo')
  })

  it('ideaSnippet vazio quando corpo == titulo', () => {
    expect(ideaSnippet({ title: 'X', content: 'X' })).toBe('')
    expect(ideaSnippet({ title: '', content: '' })).toBe('')
  })

  it('sortIdeasByRecent ordena por updated_at desc, sem mutar', () => {
    const notes = [
      { id: 'a', updated_at: '2026-08-01T00:00:00Z' },
      { id: 'b', updated_at: '2026-08-20T00:00:00Z' },
      { id: 'c', created_at: '2026-08-10T00:00:00Z' },
    ]
    const sorted = sortIdeasByRecent(notes)
    expect(sorted.map((n) => n.id)).toEqual(['b', 'c', 'a'])
    expect(notes[0].id).toBe('a') // origem intacta
  })
})
