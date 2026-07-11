import { describe, it, expect } from 'vitest'
import { mockInterpret } from '../providers/mockProvider'

// Contexto fixo: hoje = quarta-feira 2026-07-15 (para datas relativas deterministas)
const CTX = {
  today: '2026-07-15',
  timezone: 'America/Sao_Paulo',
  categories: [
    { id: 'cat-trab', name: 'Trabalho' },
    { id: 'cat-reu', name: 'Reuniao' },
  ],
}

describe('mockProvider.interpret', () => {
  it('create_task com data relativa (amanha), horario e prioridade', () => {
    const r = mockInterpret('Agende reuniao com Rafael amanha as 15h, prioridade alta', CTX)
    expect(r.intent).toBe('create_task')
    expect(r.data.date).toBe('2026-07-16') // amanha
    expect(r.data.start_time).toBe('15:00')
    expect(r.data.priority).toBe('high')
    expect(r.data.title.toLowerCase()).toContain('rafael')
    expect(r.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('"sexta" escolhe a proxima sexta futura', () => {
    const r = mockInterpret('Agende tarefa revisar contrato sexta', CTX)
    expect(r.intent).toBe('create_task')
    // 2026-07-15 e quarta; proxima sexta = 2026-07-17
    expect(r.data.date).toBe('2026-07-17')
  })

  it('horario ambiguo "as 8" pede confirmacao', () => {
    const r = mockInterpret('Agende tarefa dentista as 8', CTX)
    expect(r.intent).toBe('create_task')
    expect(r.ambiguities).toContain('horario')
    expect(r.needs_clarification).toBe(true)
  })

  it('baixa confianca / texto sem sentido pede esclarecimento', () => {
    const r = mockInterpret('asdkjahsd xyz', CTX)
    expect(r.intent).toBe('unknown')
    expect(r.needs_clarification).toBe(true)
  })

  it('list_schedule', () => {
    const r = mockInterpret('O que eu tenho na sexta?', CTX)
    expect(r.intent).toBe('list_schedule')
    expect(r.data.start).toBe('2026-07-17')
  })

  it('search_tasks', () => {
    const r = mockInterpret('Busque tarefas de trabalho', CTX)
    expect(r.intent).toBe('search_tasks')
    expect(r.data.query.toLowerCase()).toContain('trabalho')
  })

  it('complete_task por nome', () => {
    const r = mockInterpret('Conclua a tarefa Treino na academia', CTX)
    expect(r.intent).toBe('complete_task')
    expect(r.data.query.toLowerCase()).toContain('treino')
  })

  it('reschedule_task com data', () => {
    const r = mockInterpret('Reagende a tarefa dentista para amanha', CTX)
    expect(r.intent).toBe('reschedule_task')
    expect(r.data.date).toBe('2026-07-16')
  })

  it('reschedule sem data pede esclarecimento', () => {
    const r = mockInterpret('Reagende a tarefa dentista', CTX)
    expect(r.intent).toBe('reschedule_task')
    expect(r.needs_clarification).toBe(true)
  })

  it('bloqueia acao em massa (excluir todas)', () => {
    const r = mockInterpret('Exclua todas as tarefas', CTX)
    expect(r.needs_clarification).toBe(true)
    expect(r.clarification.toLowerCase()).toContain('massa')
  })

  it('create_link a partir de uma URL', () => {
    const r = mockInterpret('https://linear.app/premium', CTX)
    expect(r.intent).toBe('create_link')
    expect(r.data.url).toContain('linear.app')
  })
})
