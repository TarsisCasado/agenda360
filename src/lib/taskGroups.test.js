import { describe, it, expect } from 'vitest'
import { groupTasksByStatus } from './taskGroups'

const S = ['todo', 'in_progress', 'done']

describe('taskGroups — agrupamento por status (area Tarefas)', () => {
  it('separa por status e ignora status fora das colunas', () => {
    const tasks = [
      { id: '1', status: 'todo', date: '2026-08-10' },
      { id: '2', status: 'in_progress', date: null },
      { id: '3', status: 'done', date: '2026-08-01' },
      { id: '4', status: 'cancelled', date: null }, // fora das colunas
    ]
    const g = groupTasksByStatus(tasks, S)
    expect(g.todo.map((t) => t.id)).toEqual(['1'])
    expect(g.in_progress.map((t) => t.id)).toEqual(['2'])
    expect(g.done.map((t) => t.id)).toEqual(['3'])
    expect(Object.values(g).flat().find((t) => t.id === '4')).toBeUndefined()
  })

  it('tarefas SEM data vem primeiro dentro da coluna, depois por data asc', () => {
    const tasks = [
      { id: 'datada-tarde', status: 'todo', date: '2026-08-20' },
      { id: 'sem-data', status: 'todo', date: null },
      { id: 'datada-cedo', status: 'todo', date: '2026-08-05' },
    ]
    const g = groupTasksByStatus(tasks, S)
    expect(g.todo.map((t) => t.id)).toEqual(['sem-data', 'datada-cedo', 'datada-tarde'])
  })

  it('colunas vazias existem mesmo sem tarefas', () => {
    const g = groupTasksByStatus([], S)
    expect(g).toEqual({ todo: [], in_progress: [], done: [] })
  })

  it('tarefa sem data (date=null) e realmente suportada (nao lanca)', () => {
    const g = groupTasksByStatus([{ id: 'x', status: 'todo' }], S)
    expect(g.todo).toHaveLength(1)
  })
})
