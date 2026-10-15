import { describe, it, expect } from 'vitest'
import {
  recorteDaSemana, andarNoRecorte, detalheDoBloco, faixaDoBloco, posicaoNaGrade,
  disporDia, faixaDeHoras, conflitosDoDia, temConflito, semanaDe,
  DIAS_VISIVEIS, PX_HORA_SEMANA, ALTURA_MINIMA_BLOCO,
} from './agendaGrade'

// O PROTOTIPO, importado so aqui. Ver a nota de arquitetura no topo de
// `agendaGrade.js`: o produto real NAO importa de `src/prototype/` para que a
// maquete continue descartavel. O preco e geometria repetida em dois lugares,
// e o seguro contra divergencia silenciosa e este arquivo.
import * as proto from '../prototype/store/agendaM3'

const SEMANA = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']

describe('a semana do produto comeca na segunda', () => {
  it('sete dias, segunda a domingo', () => {
    expect(semanaDe('2026-10-15')).toEqual(SEMANA)
  })

  it('o domingo pertence a semana que comecou na segunda anterior', () => {
    expect(semanaDe('2026-10-18')).toEqual(SEMANA)
  })
})

describe('o recorte de tres dias (UX-M3.1)', () => {
  it('poe o dia escolhido no meio', () => {
    expect(recorteDaSemana(SEMANA, '2026-10-14')).toEqual(['2026-10-13', '2026-10-14', '2026-10-15'])
  })

  it('encosta na ponta em vez de vazar para outra semana', () => {
    expect(recorteDaSemana(SEMANA, SEMANA[0])).toEqual(SEMANA.slice(0, 3))
    expect(recorteDaSemana(SEMANA, SEMANA[6])).toEqual(SEMANA.slice(4))
  })

  it('mostra sempre tres dias', () => {
    for (const d of SEMANA) expect(recorteDaSemana(SEMANA, d)).toHaveLength(DIAS_VISIVEIS)
  })

  it('o dia escolhido esta SEMPRE visivel — a regra que o recorte existe para cumprir', () => {
    for (const d of SEMANA) expect(recorteDaSemana(SEMANA, d)).toContain(d)
  })
})

describe('andar com o recorte', () => {
  it('um passo move a janela um dia', () => {
    const antes = recorteDaSemana(SEMANA, '2026-10-13')
    const depois = recorteDaSemana(SEMANA, andarNoRecorte(SEMANA, '2026-10-13', 1))
    expect(depois[0]).toBe(antes[1])
  })

  it('na ponta da semana atravessa para a vizinha, em vez de nao fazer nada', () => {
    expect(andarNoRecorte(SEMANA, SEMANA[6], 1)).toBe('2026-10-19')
    expect(andarNoRecorte(SEMANA, SEMANA[0], -1)).toBe('2026-10-11')
  })
})

describe('o conteudo de um bloco cede antes da fonte', () => {
  it('um bloco alto mostra tudo', () => {
    expect(detalheDoBloco(120, 1)).toEqual({ linhas: 2, horario: true, apoio: true, intervalo: true })
  })

  it('um bloco de meia hora mostra so o titulo', () => {
    expect(detalheDoBloco(ALTURA_MINIMA_BLOCO, 1)).toMatchObject({ linhas: 1, horario: false, apoio: false })
  })

  it('bloco escalonado troca o local pela linha de titulo, e o intervalo pelo inicio', () => {
    const d = detalheDoBloco(120, 2)
    expect(d.apoio).toBe(false)
    expect(d.intervalo).toBe(false)
    expect(d.horario).toBe(true)
    expect(d.linhas).toBe(3)
  })
})

describe('sobreposicao: escalonar, nao espremer', () => {
  it('coluna inteira quando nao ha conflito', () => {
    expect(faixaDoBloco(0, 1)).toEqual({ esquerda: 0, largura: 100 })
  })

  it('dois conflitantes guardam ~72% da coluna cada', () => {
    expect(faixaDoBloco(0, 2)).toEqual({ esquerda: 0, largura: 72 })
    expect(faixaDoBloco(1, 2)).toEqual({ esquerda: 28, largura: 72 })
  })

  it('o recuo total tem teto: tres ou mais conflitos nao derretem a largura', () => {
    // UX-M3 dividia a coluna em partes iguais e tres eventos deixavam cada um
    // com 33%. Aqui o pior caso continua acima de 55%.
    for (const n of [3, 4, 5, 6]) {
      for (let c = 0; c < n; c += 1) {
        expect(faixaDoBloco(c, n).largura).toBeGreaterThan(55)
      }
    }
  })

  it('cada bloco cabe na coluna (recuo + largura nunca passa de 100%)', () => {
    for (const n of [2, 3, 4, 5]) {
      for (let c = 0; c < n; c += 1) {
        const { esquerda, largura } = faixaDoBloco(c, n)
        expect(esquerda + largura).toBeLessThanOrEqual(100.0001)
      }
    }
  })

  it('agrupa por encavalamento e da coluna livre a cada um', () => {
    const d = disporDia([
      { id: 'a', inicio: '10:00', fim: '12:00' },
      { id: 'b', inicio: '11:30', fim: '12:30' },
      { id: 'c', inicio: '14:00', fim: '15:00' },
    ])
    const por = (id) => d.find((x) => x.evento.id === id)
    expect(por('a').colunas).toBe(2)
    expect(por('b').colunas).toBe(2)
    expect(por('a').coluna).not.toBe(por('b').coluna)
    expect(por('c').colunas).toBe(1)
  })

  it('encostar nao e encavalar: 10-11 e 11-12 ficam em coluna inteira', () => {
    const d = disporDia([
      { id: 'a', inicio: '10:00', fim: '11:00' },
      { id: 'b', inicio: '11:00', fim: '12:00' },
    ])
    expect(d.every((x) => x.colunas === 1)).toBe(true)
    expect(temConflito([
      { id: 'a', inicio: '10:00', fim: '11:00' },
      { id: 'b', inicio: '11:00', fim: '12:00' },
    ])).toBe(false)
  })

  it('conflito e dito em pares, para poder dizer QUAIS depois', () => {
    const pares = conflitosDoDia([
      { id: 'a', inicio: '10:00', fim: '12:00' },
      { id: 'b', inicio: '11:30', fim: '12:30' },
    ])
    expect(pares).toHaveLength(1)
    expect(pares[0].map((e) => e.id)).toEqual(['a', 'b'])
  })
})

describe('a posicao na grade', () => {
  it('altura E duracao acima do piso', () => {
    const { topo, altura } = posicaoNaGrade({ inicio: '09:00', fim: '11:00' }, { inicio: 7, px: PX_HORA_SEMANA })
    expect(topo).toBe(2 * PX_HORA_SEMANA)
    expect(altura).toBe(2 * PX_HORA_SEMANA)
  })

  it('um compromisso curto nunca fica abaixo do piso tocavel', () => {
    const { altura } = posicaoNaGrade({ inicio: '09:00', fim: '09:10' }, { inicio: 7, px: PX_HORA_SEMANA })
    expect(altura).toBe(ALTURA_MINIMA_BLOCO)
  })
})

describe('a faixa de horas se abre o quanto o dado exigir', () => {
  it('sem dado, fica no expediente padrao', () => {
    expect(faixaDeHoras([])).toEqual({ inicio: 7, fim: 20 })
  })

  it('um compromisso as 06:30 abre a grade para as 06:00', () => {
    expect(faixaDeHoras([{ inicio: '06:30', fim: '07:30' }]).inicio).toBe(6)
  })

  it('um compromisso que termina 21:15 fecha a grade em 22', () => {
    expect(faixaDeHoras([{ inicio: '20:00', fim: '21:15' }]).fim).toBe(22)
  })
})

// ===========================================================================
// PARIDADE COM O PROTOTIPO.
//
// O produto real e a maquete tem copias proprias desta geometria, de proposito
// (ver o topo de `agendaGrade.js`). Isto existe para que uma divergencia nao
// passe calada: se alguem mexer num dos dois lados, estes testes caem.
// ===========================================================================
describe('paridade com src/prototype/store/agendaM3.js', () => {
  it('as constantes sao as mesmas', () => {
    expect(DIAS_VISIVEIS).toBe(proto.DIAS_VISIVEIS)
    expect(PX_HORA_SEMANA).toBe(proto.PX_HORA_SEMANA)
    expect(ALTURA_MINIMA_BLOCO).toBe(proto.ALTURA_MINIMA_BLOCO)
    expect(proto.RECUO_SOBREPOSICAO).toBe(28)
    expect(proto.RECUO_TOTAL_MAXIMO).toBe(44)
  })

  it('recorteDaSemana devolve o mesmo recorte para todo dia da semana', () => {
    for (const d of SEMANA) {
      expect(recorteDaSemana(SEMANA, d)).toEqual(proto.recorteDaSemana(SEMANA, d))
    }
    expect(recorteDaSemana(SEMANA, 'fora-da-semana')).toEqual(proto.recorteDaSemana(SEMANA, 'fora-da-semana'))
  })

  it('andarNoRecorte anda igual nos dois lados, inclusive nas pontas', () => {
    for (const d of SEMANA) {
      for (const delta of [-1, 1]) {
        expect(andarNoRecorte(SEMANA, d, delta)).toBe(proto.andarNoRecorte(SEMANA, d, delta))
      }
    }
  })

  it('detalheDoBloco decide o mesmo conteudo em toda a escala', () => {
    for (let altura = 20; altura <= 200; altura += 1) {
      for (const colunas of [1, 2, 3]) {
        expect(detalheDoBloco(altura, colunas)).toEqual(proto.detalheDoBloco(altura, colunas))
      }
    }
  })

  it('faixaDoBloco escalona igual', () => {
    for (let colunas = 1; colunas <= 6; colunas += 1) {
      for (let c = 0; c < colunas; c += 1) {
        expect(faixaDoBloco(c, colunas)).toEqual(proto.faixaDoBloco(c, colunas))
      }
    }
  })

  it('posicaoNaGrade posiciona igual', () => {
    const casos = [
      { inicio: '06:30', fim: '07:00' },
      { inicio: '09:00', fim: '11:00' },
      { inicio: '13:15', fim: '13:25' },
      { inicio: '19:45', fim: '21:30' },
    ]
    for (const e of casos) {
      const opcoes = { inicio: 7, px: PX_HORA_SEMANA, alturaMinima: ALTURA_MINIMA_BLOCO }
      expect(posicaoNaGrade(e, opcoes)).toEqual(proto.posicaoNaGrade(e, opcoes))
    }
  })

  it('a disposicao das colunas e a mesma', () => {
    const compromissos = [
      { id: 'a', data: '2026-10-15', inicio: '09:00', fim: '10:00', titulo: 'A' },
      { id: 'b', data: '2026-10-15', inicio: '10:00', fim: '12:00', titulo: 'B' },
      { id: 'c', data: '2026-10-15', inicio: '11:30', fim: '12:30', titulo: 'C' },
      { id: 'd', data: '2026-10-15', inicio: '11:45', fim: '12:15', titulo: 'D' },
      { id: 'e', data: '2026-10-15', inicio: '16:00', fim: '17:00', titulo: 'E' },
    ]
    const meu = disporDia(compromissos)
      .map((x) => ({ id: x.evento.id, coluna: x.coluna, colunas: x.colunas }))
      .sort((p, q) => p.id.localeCompare(q.id))
    const dele = proto.disposicaoDoDia({ compromissos, tarefas: [] }, '2026-10-15')
      .map((x) => ({ id: x.evento.id, coluna: x.coluna, colunas: x.colunas }))
      .sort((p, q) => p.id.localeCompare(q.id))
    expect(meu).toEqual(dele)
  })
})
