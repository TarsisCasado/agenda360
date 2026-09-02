import { describe, it, expect } from 'vitest'
import { buildBoard, columnOf, compareInColumn, patchForColumn, FLOW_COLUMNS } from './board'
import { STATUS } from './constants'

// ---------------------------------------------------------------------------
// COLUNAS DE FLUXO — base do CP5.3, testada antes de existir quadro na tela.
//
// A invariante que mais importa: NENHUMA atividade some entre as derivacoes.
// Foi o risco que o product owner levantou ao aprovar o Kanban, e e o tipo de
// bug que so aparece com dado real se nao for travado aqui.
// ---------------------------------------------------------------------------
const t = (over = {}) => ({ id: Math.random().toString(36).slice(2), title: 'X', status: STATUS.TODO, date: null, ...over })

describe('columnOf — os oito status do dominio', () => {
  it.each([
    [STATUS.TODO, null, 'sem_data'],
    [STATUS.TODO, '2026-09-04', 'a_fazer'],
    [STATUS.RESCHEDULED, null, 'sem_data'],
    [STATUS.RESCHEDULED, '2026-09-04', 'a_fazer'],
    [STATUS.IN_PROGRESS, null, 'em_andamento'],
    [STATUS.IN_PROGRESS, '2026-09-04', 'em_andamento'],
    [STATUS.DELEGATED, '2026-09-04', 'em_andamento'],
    [STATUS.DONE, '2026-09-04', 'concluido'],
    [STATUS.DONE, null, 'concluido'],
  ])('status %s com data %s -> %s', (status, date, esperado) => {
    expect(columnOf(t({ status, date }))).toBe(esperado)
  })

  it.each([STATUS.MISSED, STATUS.NOT_NEEDED, STATUS.CANCELLED])(
    '%s e desfecho, nao estagio: fica fora do quadro',
    (status) => {
      expect(columnOf(t({ status }))).toBeNull()
    },
  )

  it('status desconhecido nao faz a atividade sumir', () => {
    expect(columnOf(t({ status: 'algo_novo' }))).toBe('sem_data')
    expect(columnOf(t({ status: 'algo_novo', date: '2026-09-04' }))).toBe('a_fazer')
  })

  it('status ausente e tratado como aberta', () => {
    expect(columnOf({ id: '1', title: 'X' })).toBe('sem_data')
  })
})

describe('buildBoard — a invariante', () => {
  const universo = [
    t({ status: STATUS.TODO }),
    t({ status: STATUS.TODO, date: '2026-09-04' }),
    t({ status: STATUS.RESCHEDULED, date: '2026-09-01' }),
    t({ status: STATUS.RESCHEDULED }),
    t({ status: STATUS.IN_PROGRESS, date: '2026-09-02' }),
    t({ status: STATUS.DELEGATED }),
    t({ status: STATUS.DONE, date: '2026-08-30' }),
    t({ status: STATUS.MISSED, date: '2026-08-20' }),
    t({ status: STATUS.NOT_NEEDED }),
    t({ status: STATUS.CANCELLED }),
    t({ status: 'desconhecido' }),
  ]

  it('nenhuma atividade some: colunas + arquivadas = total', () => {
    const b = buildBoard(universo)
    const nasColunas = Object.values(b.colunas).reduce((n, c) => n + c.length, 0)
    expect(nasColunas + b.arquivadas.length).toBe(universo.length)
    expect(b.total).toBe(universo.length)
  })

  it('nenhuma atividade aparece em duas colunas', () => {
    const b = buildBoard(universo)
    const ids = Object.values(b.colunas).flat().map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('as quatro colunas existem mesmo vazias', () => {
    const b = buildBoard([])
    expect(Object.keys(b.colunas)).toEqual(FLOW_COLUMNS.map((c) => c.key))
    for (const c of FLOW_COLUMNS) expect(b.colunas[c.key]).toEqual([])
  })

  it('lista vazia nao quebra', () => {
    expect(buildBoard().total).toBe(0)
  })
})

describe('ordenacao dentro da coluna', () => {
  it('atrasada vem antes de tudo', () => {
    const atrasada = t({ status: STATUS.TODO, date: '2020-01-01' })
    const futura = t({ status: STATUS.TODO, date: '2099-01-01', priority: 'urgent' })
    expect([futura, atrasada].sort(compareInColumn)[0]).toBe(atrasada)
  })

  it('sem data vai para o fim quando comparada com data', () => {
    const comData = t({ date: '2026-09-04' })
    const semData = t({ date: null })
    expect([semData, comData].sort(compareInColumn)[0]).toBe(comData)
  })

  it('mesma data: prioridade decide', () => {
    const alta = t({ date: '2099-01-01', priority: 'urgent' })
    const baixa = t({ date: '2099-01-01', priority: 'low' })
    expect([baixa, alta].sort(compareInColumn)[0]).toBe(alta)
  })

  it('mesma data e prioridade: hora decide', () => {
    const cedo = t({ date: '2099-01-01', start_time: '08:00' })
    const tarde = t({ date: '2099-01-01', start_time: '18:00' })
    expect([tarde, cedo].sort(compareInColumn)[0]).toBe(cedo)
  })
})

describe('patchForColumn — o que mover significa', () => {
  it('mover para Sem data tira da agenda por completo', () => {
    expect(patchForColumn(t({ date: '2026-09-04', start_time: '15:00' }), 'sem_data')).toEqual({
      status: STATUS.TODO,
      date: null,
      start_time: null,
      end_time: null,
    })
  })

  it('mover para A fazer NAO inventa data — pede uma', () => {
    expect(patchForColumn(t({ date: null }), 'a_fazer')).toEqual({ status: STATUS.TODO, needsDate: true })
    expect(patchForColumn(t({ date: '2026-09-04' }), 'a_fazer')).toEqual({ status: STATUS.TODO })
  })

  it('em andamento e concluido mudam so o status', () => {
    expect(patchForColumn(t(), 'em_andamento')).toEqual({ status: STATUS.IN_PROGRESS })
    expect(patchForColumn(t(), 'concluido')).toEqual({ status: STATUS.DONE })
  })

  it('coluna desconhecida nao gera patch', () => {
    expect(patchForColumn(t(), 'inexistente')).toEqual({})
  })
})
