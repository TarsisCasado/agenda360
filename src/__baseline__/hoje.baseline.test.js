import { describe, it, expect } from 'vitest'
import { buildToday, baldeDe, estaAtrasada, HOJE_BALDES, AMOSTRA_ATRASADAS, AMOSTRA_SEM_DATA } from '../lib/today'
import { STATUS } from '../lib/constants'
import { baseline, invariante, mudaEm } from './contrato'

// ---------------------------------------------------------------------------
// BASELINE — HOJE.
//
// `today.test.js` prova que a regra esta implementada. Este arquivo REGISTRA
// qual regra e, com rotulo de contrato, para o proximo checkpoint saber o que
// pode cair e o que nao pode.
//
// O ponto sensivel esta todo numa linha: HOJE O ATRASO VEM DE `date`, que no
// vocabulario do UX1.3.1 e o DIA PLANEJADO, nao o prazo. Isso contradiz a
// INV-05 e muda no C5. Os testes que dependem disso estao marcados [MUDA:C5];
// os demais sao contrato para sempre.
// ---------------------------------------------------------------------------

const HOJE = '2026-09-21'
const AGORA = new Date('2026-09-21T08:40:00')

// Uma tarefa minima. Sem campos a mais: o que nao esta aqui nao influencia.
const t = (over = {}) => ({
  id: 'x',
  title: 'T',
  status: STATUS.TODO,
  date: null,
  start_time: null,
  ...over,
})

const ctx = { today: HOJE, now: AGORA }

describe('BASELINE Hoje — quem entra', () => {
  it(baseline('quatro baldes, nesta ordem de exibicao'), () => {
    expect(HOJE_BALDES.map((b) => b.key)).toEqual(['atrasada', 'hoje', 'em_andamento', 'sem_data'])
  })

  it(baseline('tarefa com a data de hoje cai em "hoje"'), () => {
    expect(baldeDe(t({ date: HOJE }), ctx)).toBe('hoje')
  })

  it(invariante('INV-05 parcial', 'tarefa futura com data NAO entra em Hoje — ja tem lugar, e o lugar e a Agenda'), () => {
    expect(baldeDe(t({ date: '2026-09-25' }), ctx)).toBeNull()
  })

  it(baseline('tarefa sem data nenhuma cai em "sem_data"'), () => {
    expect(baldeDe(t({ date: null }), ctx)).toBe('sem_data')
  })

  it(baseline('tarefa em andamento cai em "em_andamento", mesmo com data de hoje'), () => {
    expect(baldeDe(t({ status: STATUS.IN_PROGRESS, date: HOJE }), ctx)).toBe('em_andamento')
  })

  it(baseline('tarefa concluida nao entra em balde nenhum'), () => {
    expect(baldeDe(t({ status: STATUS.DONE, date: HOJE }), ctx)).toBeNull()
  })

  it(baseline('desfechos (cancelada, furei, nao necessaria) nao entram'), () => {
    for (const s of [STATUS.CANCELLED, STATUS.MISSED, STATUS.NOT_NEEDED]) {
      expect(baldeDe(t({ status: s, date: HOJE }), ctx)).toBeNull()
    }
  })

  it(baseline('delegada continua entrando em Hoje (status aberto)'), () => {
    expect(baldeDe(t({ status: STATUS.DELEGATED, date: HOJE }), ctx)).toBe('hoje')
  })
})

describe('BASELINE Hoje — atraso', () => {
  it(
    mudaEm(
      'C5',
      'ATRASO VEM DE `date` (o dia planejado): data no passado = atrasada',
      'atraso passa a depender de `due_date`; dia planejado vencido deixa de ser atraso',
    ),
    () => {
      expect(estaAtrasada(t({ date: '2026-09-18' }), ctx)).toBe(true)
      expect(baldeDe(t({ date: '2026-09-18' }), ctx)).toBe('atrasada')
    },
  )

  it(
    mudaEm(
      'C5',
      'atraso ganha de "em andamento" na ordem de precedencia',
      'a precedencia continua, mas o criterio de atraso muda',
    ),
    () => {
      expect(baldeDe(t({ status: STATUS.IN_PROGRESS, date: '2026-09-18' }), ctx)).toBe('atrasada')
    },
  )

  it(
    mudaEm(
      'C5',
      'REAGENDADA para data passada tambem conta como atrasada NESTA tela',
      'reagendamento deixa de ser status e o atraso vem do prazo',
    ),
    () => {
      // O dominio (`isTaskOverdue`) nao considera `rescheduled` atrasada; esta
      // tela considera, para a tarefa nao sumir de Hoje sem estar em lugar
      // nenhum. E leitura, nao dominio — registrado aqui como esta.
      expect(estaAtrasada(t({ status: STATUS.RESCHEDULED, date: '2026-09-18' }), ctx)).toBe(true)
    },
  )

  it(baseline('tarefa sem data NUNCA e atrasada'), () => {
    expect(estaAtrasada(t({ date: null }), ctx)).toBe(false)
  })
})

describe('BASELINE Hoje — deduplicacao e soma', () => {
  it(invariante('contagem', 'cada tarefa cai em EXATAMENTE um balde e a soma bate'), () => {
    const tarefas = [
      t({ id: 'a', date: '2026-09-15' }),
      t({ id: 'b', status: STATUS.IN_PROGRESS, date: '2026-09-18' }), // atrasada E em andamento
      t({ id: 'c', status: STATUS.IN_PROGRESS, date: HOJE }),
      t({ id: 'd', date: HOJE }),
      t({ id: 'e', date: null }),
      t({ id: 'f', date: '2026-09-30' }), // futura: fora
      t({ id: 'g', status: STATUS.DONE, date: HOJE }), // concluida: fora
    ]
    const r = buildToday(tarefas, ctx)

    const ids = Object.values(r.baldes).flat().map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length) // nenhuma aparece duas vezes
    expect(r.total).toBe(ids.length)
    expect(r.total).toBe(
      r.contagens.atrasada + r.contagens.hoje + r.contagens.em_andamento + r.contagens.sem_data,
    )
    expect(r.total).toBe(5)
  })

  it(baseline('dia sem nada devolve vazio=true'), () => {
    expect(buildToday([], ctx).vazio).toBe(true)
  })
})

describe('BASELINE Hoje — a lente "agora / proximo"', () => {
  it(baseline('o proximo e o primeiro compromisso de hoje que ainda nao passou'), () => {
    const r = buildToday(
      [
        t({ id: 'cedo', date: HOJE, start_time: '08:00' }),
        t({ id: 'depois', date: HOJE, start_time: '09:00' }),
        t({ id: 'tarde', date: HOJE, start_time: '16:00' }),
      ],
      ctx,
    )
    expect(r.proximo.id).toBe('depois') // agora sao 08:40
  })

  it(invariante('INV-nao-duplica', 'o proximo NAO se repete na lista de hoje'), () => {
    const r = buildToday([t({ id: 'p', date: HOJE, start_time: '09:00' })], ctx)
    expect(r.proximo.id).toBe('p')
    expect(r.hojeSemProximo.map((x) => x.id)).not.toContain('p')
  })

  it(baseline('todos os compromissos ja passados: nao ha proximo'), () => {
    const r = buildToday([t({ id: 'p', date: HOJE, start_time: '07:00' })], ctx)
    expect(r.proximo).toBeNull()
  })
})

describe('BASELINE Hoje — amostras', () => {
  it(baseline('atrasadas e sem data sao AMOSTRA de 3, nao inventario'), () => {
    expect(AMOSTRA_ATRASADAS).toBe(3)
    expect(AMOSTRA_SEM_DATA).toBe(3)
  })

  it(baseline('a amostra e um limite de EXIBICAO: o balde continua completo'), () => {
    const muitas = Array.from({ length: 9 }, (_, i) => t({ id: 's' + i, date: null }))
    const r = buildToday(muitas, ctx)
    expect(r.contagens.sem_data).toBe(9)
  })
})

describe('BASELINE Hoje — ordenacao dentro do balde', () => {
  it(baseline('atrasadas: a mais antiga primeiro'), () => {
    const r = buildToday(
      [t({ id: 'novo', date: '2026-09-20' }), t({ id: 'velho', date: '2026-09-01' })],
      ctx,
    )
    expect(r.baldes.atrasada.map((x) => x.id)).toEqual(['velho', 'novo'])
  })

  it(baseline('hoje: com hora antes de sem hora'), () => {
    const r = buildToday(
      [t({ id: 'sem', date: HOJE }), t({ id: 'com', date: HOJE, start_time: '11:00' })],
      ctx,
    )
    expect(r.baldes.hoje.map((x) => x.id)).toEqual(['com', 'sem'])
  })
})
