import { describe, it, expect } from 'vitest'
import {
  buildBoard,
  columnOf,
  patchForColumn,
  filterBoardTasks,
  splitDoneWindow,
  FLOW_COLUMNS,
  BOARD_FILTERS,
  DONE_WINDOW_DAYS,
} from '../lib/board'
import { STATUS } from '../lib/constants'
import { baseline, invariante, mudaEm } from './contrato'

// ---------------------------------------------------------------------------
// BASELINE — QUADRO DE FLUXO (TAREFAS).
//
// Duas diferencas entre o quadro de HOJE e o quadro do UX1.3.1 estao
// registradas aqui, e as duas sao deliberadas:
//
//   1. o produto tem QUATRO colunas (`sem_data` e uma delas); o 2.0 tem tres,
//      e "sem data" vira filtro. Muda no C7;
//   2. `delegated` mora dentro de `em_andamento`; no 2.0 delegacao e outro
//      eixo e nao ocupa coluna. Muda no C8.
//
// O gesto de arrasto NAO e testado aqui: ele e do produto (`useTouchCardDrag`)
// e ja tem cobertura propria em `board-touchdrag.smoke.test.js`. Area
// congelada — este arquivo nao a toca.
// ---------------------------------------------------------------------------

const t = (over = {}) => ({ id: 'x', title: 'T', status: STATUS.TODO, date: null, ...over })

describe('BASELINE Quadro — as colunas de hoje', () => {
  it(
    mudaEm(
      'C7',
      'o quadro tem QUATRO colunas, e `sem_data` e uma delas',
      'tres colunas (a fazer / em andamento / concluido); "sem data" vira filtro',
    ),
    () => {
      expect(FLOW_COLUMNS.map((c) => c.key)).toEqual(['sem_data', 'a_fazer', 'em_andamento', 'concluido'])
    },
  )

  it(baseline('todo COM data -> a_fazer; todo SEM data -> sem_data'), () => {
    expect(columnOf(t({ date: '2026-09-25' }))).toBe('a_fazer')
    expect(columnOf(t({ date: null }))).toBe('sem_data')
  })

  it(baseline('in_progress -> em_andamento'), () => {
    expect(columnOf(t({ status: STATUS.IN_PROGRESS }))).toBe('em_andamento')
  })

  it(
    mudaEm(
      'C8',
      'DELEGADA mora na coluna em_andamento (delegacao ocupa o lugar da execucao)',
      'delegacao vira eixo proprio; a execucao real da tarefa deixa de ser apagada',
    ),
    () => {
      expect(columnOf(t({ status: STATUS.DELEGATED }))).toBe('em_andamento')
    },
  )

  it(baseline('done -> concluido'), () => {
    expect(columnOf(t({ status: STATUS.DONE }))).toBe('concluido')
  })

  it(
    mudaEm(
      'C8',
      'missed, not_needed e cancelled saem do quadro (viram "arquivadas")',
      'viram DESFECHO, um eixo separado, e param de disputar espaco com a execucao',
    ),
    () => {
      for (const s of [STATUS.MISSED, STATUS.NOT_NEEDED, STATUS.CANCELLED]) {
        expect(columnOf(t({ status: s }))).toBeNull()
      }
    },
  )

  it(baseline('rescheduled continua sendo tratada como aberta'), () => {
    expect(columnOf(t({ status: STATUS.RESCHEDULED, date: '2026-09-25' }))).toBe('a_fazer')
  })

  it(baseline('status desconhecido NAO some do quadro — cai como aberta'), () => {
    expect(columnOf(t({ status: 'algo_do_futuro', date: '2026-09-25' }))).toBe('a_fazer')
    expect(columnOf(t({ status: 'algo_do_futuro', date: null }))).toBe('sem_data')
  })
})

describe('BASELINE Quadro — nada some', () => {
  it(invariante('INV-26 parcial', 'toda tarefa esta numa coluna OU em arquivadas; a soma bate'), () => {
    const tarefas = [
      t({ id: 'a' }),
      t({ id: 'b', date: '2026-09-25' }),
      t({ id: 'c', status: STATUS.IN_PROGRESS }),
      t({ id: 'd', status: STATUS.DONE }),
      t({ id: 'e', status: STATUS.CANCELLED }),
      t({ id: 'f', status: STATUS.MISSED }),
    ]
    const b = buildBoard(tarefas)
    const nasColunas = Object.values(b.colunas).flat().length
    expect(nasColunas + b.arquivadas.length).toBe(b.total)
    expect(b.total).toBe(6)
  })
})

describe('BASELINE Quadro — o que mover significa', () => {
  it(baseline('mover para concluido troca o status para done'), () => {
    expect(patchForColumn(t({ status: STATUS.TODO }), 'concluido')).toMatchObject({ status: STATUS.DONE })
  })

  it(baseline('mover para em_andamento troca o status para in_progress'), () => {
    expect(patchForColumn(t({ status: STATUS.TODO }), 'em_andamento')).toMatchObject({
      status: STATUS.IN_PROGRESS,
    })
  })

  it(
    mudaEm(
      'C5',
      'mover para sem_data APAGA a data da tarefa',
      'apagar o dia planejado deixa de mexer no prazo, que passa a ser outro campo',
    ),
    () => {
      expect(patchForColumn(t({ status: STATUS.TODO, date: '2026-09-25' }), 'sem_data')).toMatchObject({
        date: null,
      })
    },
  )

  it(baseline('mover para "a fazer" uma tarefa SEM data pede a data em vez de inventar um dia'), () => {
    expect(patchForColumn(t({ date: null }), 'a_fazer')).toMatchObject({
      status: STATUS.TODO,
      needsDate: true,
    })
    expect(patchForColumn(t({ date: '2026-09-25' }), 'a_fazer')).toEqual({ status: STATUS.TODO })
  })

  it(
    baseline('o patch e calculado pela coluna de DESTINO, sem olhar onde a tarefa estava'),
    () => {
      // Caracterizado como esta: mover para a coluna em que a tarefa ja se
      // encontra devolve o mesmo patch de sempre, nao `null`. Quem decide se
      // vale gravar e a camada de cima.
      expect(patchForColumn(t({ status: STATUS.DONE }), 'concluido')).toEqual({ status: STATUS.DONE })
    },
  )
})

describe('BASELINE Quadro — ordenacao dentro da coluna', () => {
  it(baseline('atrasada primeiro, depois por data, depois por prioridade'), () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const b = buildBoard([
      t({ id: 'futura-alta', date: '2099-01-01', priority: 'high' }),
      t({ id: 'atrasada', date: ontem }),
      t({ id: 'hoje-baixa', date: hoje, priority: 'low' }),
    ])
    expect(b.colunas.a_fazer[0].id).toBe('atrasada')
  })

  it(baseline('arrastar muda de COLUNA, nunca de posicao — nao existe campo de ordem'), () => {
    // A ordem e derivada (data, prioridade, hora). Duas tarefas identicas em
    // tudo que a ordem le saem na ordem em que entraram.
    const b = buildBoard([t({ id: 'p1', date: '2099-01-01' }), t({ id: 'p2', date: '2099-01-01' })])
    expect(b.colunas.a_fazer.map((x) => x.id)).toEqual(['p1', 'p2'])
  })
})

describe('BASELINE Quadro — filtros e janela de concluidas', () => {
  it(baseline('os filtros disponiveis hoje'), () => {
    expect(BOARD_FILTERS.map((f) => f.key)).toContain('todas')
  })

  it(baseline('filtrar por "todas" nao remove nada'), () => {
    const tarefas = [t({ id: 'a' }), t({ id: 'b', date: '2026-09-25' })]
    expect(filterBoardTasks(tarefas, 'todas').length).toBe(2)
  })

  it(baseline('concluidas antigas saem da coluna depois de 7 dias'), () => {
    expect(DONE_WINDOW_DAYS).toBe(7)
    const hoje = '2026-09-21'
    const { recentes, antigas } = splitDoneWindow(
      [
        { id: 'nova', status: STATUS.DONE, date: '2026-09-20' },
        { id: 'velha', status: STATUS.DONE, date: '2026-08-01' },
      ],
      { today: hoje },
    )
    expect(recentes.map((x) => x.id)).toEqual(['nova'])
    expect(antigas.map((x) => x.id)).toEqual(['velha'])
  })
})
