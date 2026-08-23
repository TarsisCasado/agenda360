import { describe, it, expect } from 'vitest'
import { greetingFor, todayPhrase } from './todayContext'

const at = (h) => new Date(2026, 7, 22, h, 0, 0)

describe('todayContext — saudacao por horario', () => {
  it('manha / tarde / noite', () => {
    expect(greetingFor(at(8))).toBe('Bom dia')
    expect(greetingFor(at(14))).toBe('Boa tarde')
    expect(greetingFor(at(21))).toBe('Boa noite')
  })
})

describe('todayContext — frase do momento (regras, sem IA)', () => {
  it('atrasadas tem prioridade sobre tudo', () => {
    const s = todayPhrase({ overdueCount: 3, pendingCount: 2, nextStartTime: '15:30', now: at(10) })
    expect(s).toBe('Você tem 3 tarefas atrasadas.')
  })

  it('singular de atrasada', () => {
    expect(todayPhrase({ overdueCount: 1, now: at(10) })).toBe('Você tem 1 tarefa atrasada.')
  })

  it('proximo compromisso quando nao ha atraso', () => {
    expect(todayPhrase({ overdueCount: 0, nextStartTime: '15:30', now: at(10) }))
      .toBe('Seu próximo compromisso é às 15:30.')
  })

  it('progresso do dia quando ha tarefas mas sem proximo horario', () => {
    expect(todayPhrase({ overdueCount: 0, nextStartTime: null, pendingCount: 4, doneCount: 3, totalToday: 7, now: at(14) }))
      .toBe('Você concluiu 3 de 7 tarefas hoje.')
  })

  it('tudo concluido', () => {
    expect(todayPhrase({ overdueCount: 0, pendingCount: 0, doneCount: 5, totalToday: 5, now: at(18) }))
      .toBe('Tudo concluído por hoje. 🎉')
  })

  it('dia sem nada — mensagem por periodo', () => {
    expect(todayPhrase({ totalToday: 0, now: at(9) })).toMatch(/planejar o dia/)
    expect(todayPhrase({ totalToday: 0, now: at(14) })).toMatch(/livre a partir/)
    expect(todayPhrase({ totalToday: 0, now: at(21) })).toMatch(/Bom descanso/)
  })
})
