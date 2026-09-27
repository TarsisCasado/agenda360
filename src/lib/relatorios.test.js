import { describe, it, expect } from 'vitest'
import {
  segundaDa, diasDaSemana, conclusaoDaSemana, variacaoSemanal,
  porDiaDaSemana, remarcacoes, delegacao, porCategoria,
} from './relatorios'
import { toISODate } from './date'

// Sexta-feira, 25/09/2026. Segunda da semana = 21/09.
const SEXTA = '2026-09-25'
const t = (over = {}) => ({
  id: Math.random().toString(36).slice(2),
  title: 'X', date: SEXTA, status: 'todo', reschedule_count: 0,
  category_id: null, delegated_by: null, ...over,
})

describe('semana', () => {
  it('a semana comeca na segunda', () => {
    expect(toISODate(segundaDa(SEXTA))).toBe('2026-09-21')
  })
  it('domingo pertence a semana que comecou na segunda anterior', () => {
    expect(toISODate(segundaDa('2026-09-27'))).toBe('2026-09-21')
  })
  it('sete dias, de segunda a domingo', () => {
    const d = diasDaSemana(SEXTA)
    expect(d).toHaveLength(7)
    expect(d[0]).toBe('2026-09-21')
    expect(d[6]).toBe('2026-09-27')
  })
})

describe('conclusao da semana', () => {
  it('conta o planejado e o concluido', () => {
    const c = conclusaoDaSemana([
      t({ status: 'done' }), t({ status: 'done' }), t({ status: 'todo' }),
    ], SEXTA)
    expect(c).toEqual({ planejado: 3, concluido: 2, pct: 67 })
  })

  it('cancelada e nao-necessaria NAO contam como meta perdida', () => {
    const c = conclusaoDaSemana([
      t({ status: 'done' }), t({ status: 'cancelled' }), t({ status: 'not_needed' }),
    ], SEXTA)
    expect(c.planejado).toBe(1)
    expect(c.pct).toBe(100)
  })

  it('furada conta como planejada e nao concluida', () => {
    const c = conclusaoDaSemana([t({ status: 'done' }), t({ status: 'missed' })], SEXTA)
    expect(c).toEqual({ planejado: 2, concluido: 1, pct: 50 })
  })

  it('semana sem nada e 0 de 0, nunca divisao por zero', () => {
    expect(conclusaoDaSemana([], SEXTA)).toEqual({ planejado: 0, concluido: 0, pct: 0 })
  })

  it('tarefa sem data nao entra na semana', () => {
    expect(conclusaoDaSemana([t({ date: null })], SEXTA).planejado).toBe(0)
  })
})

describe('variacao semanal — comparar so quando ha com o que comparar', () => {
  it('compara com a semana anterior', () => {
    const v = variacaoSemanal([
      t({ status: 'done' }),
      t({ date: '2026-09-15', status: 'todo' }),
      t({ date: '2026-09-15', status: 'done' }),
    ], SEXTA)
    expect(v).toEqual({ atual: 100, anterior: 50, delta: 50 })
  })

  it('sem semana anterior devolve null — nao finge 0%', () => {
    expect(variacaoSemanal([t({ status: 'done' })], SEXTA)).toBeNull()
  })
})

describe('por dia da semana', () => {
  it('devolve os sete dias, com rotulo', () => {
    const d = porDiaDaSemana([], SEXTA)
    expect(d).toHaveLength(7)
    expect(d.map((x) => x.rotulo)).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'])
  })

  it('concluido e SUBCONJUNTO do planejado, nunca uma segunda serie solta', () => {
    const d = porDiaDaSemana([t({ status: 'done' }), t({ status: 'todo' })], SEXTA)
    const sexta = d.find((x) => x.iso === SEXTA)
    expect(sexta.planejado).toBe(2)
    expect(sexta.concluido).toBe(1)
    expect(sexta.concluido).toBeLessThanOrEqual(sexta.planejado)
  })

  it('dia vazio e zero, e continua no grafico — buraco tambem e informacao', () => {
    const d = porDiaDaSemana([t({ status: 'done' })], SEXTA)
    expect(d.filter((x) => x.planejado === 0)).toHaveLength(6)
  })
})

describe('remarcacoes', () => {
  it('soma o total e ordena pelas que mais mudaram', () => {
    const r = remarcacoes([
      t({ title: 'A', reschedule_count: 1 }),
      t({ title: 'B', reschedule_count: 4 }),
      t({ title: 'C', reschedule_count: 0 }),
    ])
    expect(r.total).toBe(5)
    expect(r.itens.map((i) => i.titulo)).toEqual(['B', 'A'])
  })
  it('nada remarcado devolve lista vazia', () => {
    expect(remarcacoes([t()])).toEqual({ total: 0, itens: [] })
  })
})

describe('delegacao — so o que o modelo sustenta', () => {
  it('conta delegadas e concluidas que vieram de delegacao', () => {
    const d = delegacao([
      t({ status: 'delegated' }),
      t({ status: 'done', delegated_by: 'u1' }),
      t({ status: 'done' }),
    ])
    expect(d.delegadas).toBe(1)
    expect(d.concluidas).toBe(1)
  })

  it('declara explicitamente o que NAO consegue medir', () => {
    expect(delegacao([]).naoSuportado).toEqual(['devolvidas', 'bloqueadas'])
  })
})

describe('por categoria — a cor segue a entidade, nao o ranking', () => {
  const corDe = (id) => ({ c1: { name: 'Trabalho', color: '#111' }, c2: { name: 'Saúde', color: '#222' } }[id])

  it('agrupa e ordena por volume', () => {
    const r = porCategoria([
      t({ category_id: 'c1' }), t({ category_id: 'c1' }), t({ category_id: 'c2' }),
    ], corDe)
    expect(r.map((x) => x.rotulo)).toEqual(['Trabalho', 'Saúde'])
    expect(r[0].valor).toBe(2)
  })

  it('a cor de uma categoria nao muda quando outra sai da lista', () => {
    const cheio = porCategoria([t({ category_id: 'c1' }), t({ category_id: 'c2' })], corDe)
    const so = porCategoria([t({ category_id: 'c2' })], corDe)
    const antes = cheio.find((x) => x.rotulo === 'Saúde').cor
    expect(so.find((x) => x.rotulo === 'Saúde').cor).toBe(antes)
  })

  it('sem categoria tem rotulo proprio e nenhuma cor de entidade', () => {
    const r = porCategoria([t({ category_id: null })], corDe)
    expect(r[0].rotulo).toBe('Sem categoria')
    expect(r[0].cor).toBeNull()
  })
})
