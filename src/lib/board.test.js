import { describe, it, expect } from 'vitest'
import {
  buildBoard,
  columnOf,
  compareInColumn,
  patchForColumn,
  FLOW_COLUMNS,
  boardDateLabel,
  splitDoneWindow,
  filterBoardTasks,
  daysBetween,
} from './board'
import { STATUS } from './constants'
import { isTaskOverdue } from './date'

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

// ---------------------------------------------------------------------------
// CP5.3 — o quadro de verdade. Os testes abaixo travam exatamente as regras que
// o briefing exigiu, uma a uma, para que nenhuma delas dependa de eu olhar a
// tela e achar que esta certo.
// ---------------------------------------------------------------------------
const HOJE = '2026-09-02'
const AGORA = new Date('2026-09-02T09:00:00')

describe('CP5.3 — a invariante sob movimentacao', () => {
  const universo = [
    t({ status: STATUS.TODO }),
    t({ status: STATUS.TODO, date: '2020-01-01' }),
    t({ status: STATUS.IN_PROGRESS, date: HOJE }),
    t({ status: STATUS.DONE, date: '2026-08-28' }),
    t({ status: STATUS.MISSED, date: '2026-08-01' }),
  ]

  it('atrasada continua em "A fazer" — atraso e atributo, nao coluna', () => {
    const atrasada = t({ status: STATUS.TODO, date: '2020-01-01' })
    expect(columnOf(atrasada)).toBe('a_fazer')
    expect(isTaskOverdue(atrasada, AGORA)).toBe(true)
    expect(FLOW_COLUMNS.map((c) => c.key)).not.toContain('atrasadas')
  })

  it('sem data continua em "Sem data" mesmo com prioridade urgente', () => {
    expect(columnOf(t({ status: STATUS.TODO, date: null, priority: 'urgent' }))).toBe('sem_data')
  })

  it('A fazer -> Em andamento vira in_progress e nao mexe na data', () => {
    const tarefa = t({ status: STATUS.TODO, date: HOJE })
    const patch = patchForColumn(tarefa, 'em_andamento')
    expect(patch).toEqual({ status: STATUS.IN_PROGRESS })
    expect(columnOf({ ...tarefa, ...patch })).toBe('em_andamento')
    expect({ ...tarefa, ...patch }.date).toBe(HOJE)
  })

  it('Em andamento -> Concluido vira done', () => {
    const tarefa = t({ status: STATUS.IN_PROGRESS, date: HOJE })
    const patch = patchForColumn(tarefa, 'concluido')
    expect(patch).toEqual({ status: STATUS.DONE })
    expect(columnOf({ ...tarefa, ...patch })).toBe('concluido')
  })

  it('reabrir uma concluida COM data devolve para A fazer, sem pedir data', () => {
    const tarefa = t({ status: STATUS.DONE, date: HOJE })
    const patch = patchForColumn(tarefa, 'a_fazer')
    expect(patch).toEqual({ status: STATUS.TODO })
    expect(patch.needsDate).toBeUndefined()
    expect(columnOf({ ...tarefa, ...patch })).toBe('a_fazer')
  })

  it('reabrir uma concluida SEM data cai em Sem data, nao inventa dia', () => {
    const tarefa = t({ status: STATUS.DONE, date: null })
    const patch = patchForColumn(tarefa, 'sem_data')
    expect(patch.date).toBeNull()
    expect(columnOf({ ...tarefa, ...patch })).toBe('sem_data')
  })

  it('Sem data -> A fazer EXIGE data: o patch nao carrega dia nenhum', () => {
    const patch = patchForColumn(t({ date: null }), 'a_fazer')
    expect(patch.needsDate).toBe(true)
    expect('date' in patch).toBe(false)
  })

  it('a sequencia completa nao perde nem duplica nenhuma tarefa', () => {
    let atual = [...universo]
    const passos = [
      [0, 'a_fazer'],
      [1, 'em_andamento'],
      [2, 'concluido'],
      [3, 'a_fazer'],
    ]
    for (const [i, destino] of passos) {
      const patch = patchForColumn(atual[i], destino)
      // needsDate NAO e campo da tarefa: a interface pergunta a data antes.
      const { needsDate, ...campos } = patch
      atual = atual.map((x, j) => (j === i ? { ...x, ...campos, ...(needsDate ? { date: HOJE } : {}) } : x))
    }
    const b = buildBoard(atual)
    const ids = [...Object.values(b.colunas).flat(), ...b.arquivadas].map((x) => x.id)
    expect(new Set(ids).size).toBe(universo.length)
    expect(ids.length).toBe(universo.length)
  })

  it('estados arquivados continuam recuperaveis: um patch os traz de volta', () => {
    const furada = t({ status: STATUS.MISSED, date: '2026-08-01' })
    expect(columnOf(furada)).toBeNull()
    const devolvida = { ...furada, ...patchForColumn(furada, 'a_fazer') }
    expect(columnOf(devolvida)).toBe('a_fazer')
  })
})

describe('daysBetween — datas sem hora nao podem mudar de valor por fuso', () => {
  it('conta dias corridos, inclusive atravessando o horario de verao', () => {
    expect(daysBetween('2026-09-01', '2026-09-02')).toBe(1)
    expect(daysBetween('2026-09-02', '2026-09-01')).toBe(-1)
    expect(daysBetween('2026-10-15', '2026-11-15')).toBe(31)
    expect(daysBetween(HOJE, HOJE)).toBe(0)
  })
})

describe('boardDateLabel — o unico metadado que sempre vale', () => {
  it('sem data nao gera rotulo: a coluna ja diz isso', () => {
    expect(boardDateLabel(t({ date: null }), HOJE, AGORA)).toBeNull()
  })

  it('atraso de um dia le "Ontem" com tom de perigo', () => {
    const r = boardDateLabel(t({ status: STATUS.TODO, date: '2026-09-01' }), HOJE, AGORA)
    expect(r).toEqual({ text: 'Ontem', tone: 'danger' })
  })

  it('atraso maior conta os dias', () => {
    const r = boardDateLabel(t({ status: STATUS.TODO, date: '2026-08-31' }), HOJE, AGORA)
    expect(r).toEqual({ text: '2 dias atrasada', tone: 'danger' })
  })

  it('hoje e destaque, nao alarme', () => {
    expect(boardDateLabel(t({ status: STATUS.TODO, date: HOJE }), HOJE, AGORA)).toEqual({
      text: 'Hoje',
      tone: 'accent',
    })
  })

  it('hoje com horario ja vencido vira alarme', () => {
    expect(
      boardDateLabel(t({ status: STATUS.TODO, date: HOJE, start_time: '08:00' }), HOJE, AGORA),
    ).toEqual({ text: 'Hoje', tone: 'danger' })
  })

  it('amanha e dia da semana orientam dentro da semana', () => {
    expect(boardDateLabel(t({ date: '2026-09-03' }), HOJE, AGORA).text).toBe('Amanhã')
    expect(boardDateLabel(t({ date: '2026-09-04' }), HOJE, AGORA).text).toBe('Sex, 04/09')
  })

  it('fora da semana sobra a data curta', () => {
    expect(boardDateLabel(t({ date: '2026-10-20' }), HOJE, AGORA).text).toBe('20/10')
  })

  it('data passada de tarefa ja concluida nao vira alarme', () => {
    const r = boardDateLabel(t({ status: STATUS.DONE, date: '2026-08-20' }), HOJE, AGORA)
    expect(r.tone).toBe('muted')
  })
})

describe('splitDoneWindow — Concluido nao vira arquivo morto', () => {
  it('separa pela janela de sete dias sem perder ninguem', () => {
    const done = [
      t({ status: STATUS.DONE, updated_at: '2026-09-01T10:00:00Z' }),
      t({ status: STATUS.DONE, updated_at: '2026-08-26T10:00:00Z' }),
      t({ status: STATUS.DONE, updated_at: '2026-06-01T10:00:00Z' }),
    ]
    const { recentes, antigas } = splitDoneWindow(done, { today: HOJE })
    expect(recentes).toHaveLength(2)
    expect(antigas).toHaveLength(1)
    expect(recentes.length + antigas.length).toBe(done.length)
  })

  it('cai para `date` quando nao ha updated_at', () => {
    const { antigas } = splitDoneWindow([t({ status: STATUS.DONE, date: '2026-01-01' })], { today: HOJE })
    expect(antigas).toHaveLength(1)
  })

  it('concluida sem nenhuma referencia de tempo aparece — some-la seria pior', () => {
    const { recentes } = splitDoneWindow([t({ status: STATUS.DONE, date: null })], { today: HOJE })
    expect(recentes).toHaveLength(1)
  })
})

describe('filterBoardTasks — filtro e leitura, nao dominio', () => {
  const lista = [
    t({ status: STATUS.TODO, date: '2020-01-01', priority: 'low' }),
    t({ status: STATUS.TODO, date: '2099-01-01', priority: 'urgent' }),
    t({ status: STATUS.DONE, date: HOJE, priority: 'medium' }),
  ]

  it('"todas" devolve a mesma lista', () => {
    expect(filterBoardTasks(lista, 'todas', AGORA)).toEqual(lista)
  })

  it('filtrar NAO altera as tarefas nem a lista original', () => {
    const antes = JSON.parse(JSON.stringify(lista))
    const filtradas = filterBoardTasks(lista, 'atrasadas', AGORA)
    expect(lista).toEqual(antes)
    // mesmas referencias: o filtro nao clona nem reescreve nada
    filtradas.forEach((x) => expect(lista).toContain(x))
  })

  it('atrasadas e prioridade alta recortam o que dizem recortar', () => {
    expect(filterBoardTasks(lista, 'atrasadas', AGORA)).toHaveLength(1)
    expect(filterBoardTasks(lista, 'alta', AGORA)).toHaveLength(1)
  })

  it('limpar o filtro devolve o quadro inteiro', () => {
    const cheio = buildBoard(filterBoardTasks(lista, 'todas', AGORA))
    expect(cheio.total).toBe(lista.length)
  })
})
