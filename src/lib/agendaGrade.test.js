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

// ===========================================================================
// A TABELA DE VERDADE DA NAVEGACAO — sete dias, duas direcoes, sem depender
// da data de hoje.
//
// POR QUE ESTE BLOCO EXISTE. O contrato da navegacao estava protegido por uma
// assercao de navegador que usava a DATA REAL da execucao, e afirmava "um
// passo, um dia" para qualquer dia. Dentro da semana isso vale; nas pontas,
// nao — e o teste so descobria isso quando a CI calhava de rodar num desses
// dias. Em 18/10/2026, um domingo, ele descobriu.
//
// O COMPORTAMENTO NAO E DEFEITO, E A FORMA DO MODELO. A janela de tres dias
// vive DENTRO de uma semana de segunda a domingo (`recorteDaSemana` fatia um
// array de sete). Uma janela [sab, dom, seg-da-proxima] e inexprimivel: nao e
// que ninguem a programou, e que ela nao cabe no modelo — e isso e deliberado,
// como diz o teste `encosta na ponta em vez de vazar para outra semana`.
//
// Logo, na ponta a janela vira PAGINA em vez de deslizar. E simetrico:
//
//   +1  anda 1 dia de seg a sex;  vira pagina (+3) no sab e no dom
//   -1  anda 1 dia de qua a dom;  vira pagina (-3) na seg e na ter
//
// Nada e pulado em nenhum dos casos: a janela nova sempre comeca no dia
// seguinte ao ultimo da antiga, ou antes dele. E o que o teste de
// CONTINUIDADE abaixo garante, e e a propriedade que de fato importa para
// quem navega.
// ===========================================================================
describe('a navegacao temporal, nos sete dias e nas duas direcoes', () => {
  const janelaDe = (dia) => recorteDaSemana(semanaDe(dia), dia)
  const andar = (dia, delta) => andarNoRecorte(semanaDe(dia), dia, delta)
  const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)
  const passo = (antes, depois) => dias(antes[0], depois[0])

  // dia -> passo esperado em +1 e em -1, para a semana de 12 a 18/10/2026.
  const ESPERADO = [
    { dia: '2026-10-12', nome: 'segunda', mais: 1, menos: -3 },
    { dia: '2026-10-13', nome: 'terca', mais: 1, menos: -3 },
    { dia: '2026-10-14', nome: 'quarta', mais: 1, menos: -1 },
    { dia: '2026-10-15', nome: 'quinta', mais: 1, menos: -1 },
    { dia: '2026-10-16', nome: 'sexta', mais: 1, menos: -1 },
    { dia: '2026-10-17', nome: 'sabado', mais: 3, menos: -1 },
    { dia: '2026-10-18', nome: 'domingo', mais: 3, menos: -1 },
  ]

  for (const { dia, nome, mais, menos } of ESPERADO) {
    it(`${nome}: avanca ${mais} e recua ${menos}`, () => {
      const antes = janelaDe(dia)
      expect(passo(antes, janelaDe(andar(dia, 1)))).toBe(mais)
      expect(passo(antes, janelaDe(andar(dia, -1)))).toBe(menos)
    })
  }

  it('a pagina so e virada nas pontas — no meio da semana o passo e de UM dia', () => {
    const viraPagina = ESPERADO.filter((e) => Math.abs(e.mais) === 3).map((e) => e.nome)
    const recuaPagina = ESPERADO.filter((e) => Math.abs(e.menos) === 3).map((e) => e.nome)
    expect(viraPagina).toEqual(['sabado', 'domingo'])
    expect(recuaPagina).toEqual(['segunda', 'terca'])
  })

  // A PROPRIEDADE QUE IMPORTA. Pagina ou passo, o que nao pode acontecer e
  // sumir com um dia entre uma janela e a outra.
  it('nenhum dia e pulado entre a janela antiga e a nova, em nenhum dos sete dias', () => {
    for (const { dia, nome } of ESPERADO) {
      const antes = janelaDe(dia)
      const frente = janelaDe(andar(dia, 1))
      // A janela nova comeca, no maximo, no dia seguinte ao ultimo da antiga.
      expect(dias(antes[2], frente[0]), `${nome} para frente`).toBeLessThanOrEqual(1)
      expect(dias(antes[0], frente[0]), `${nome} para frente`).toBeGreaterThan(0)

      const tras = janelaDe(andar(dia, -1))
      expect(dias(tras[2], antes[0]), `${nome} para tras`).toBeLessThanOrEqual(1)
      expect(dias(antes[0], tras[0]), `${nome} para tras`).toBeLessThan(0)
    }
  })

  it('a janela continua com tres dias e com o dia escolhido dentro, sempre', () => {
    for (const { dia } of ESPERADO) {
      for (const delta of [1, -1]) {
        const novo = andar(dia, delta)
        const janela = janelaDe(novo)
        expect(janela).toHaveLength(DIAS_VISIVEIS)
        expect(janela).toContain(novo)
      }
    }
  })

  it('ir e voltar devolve a janela de origem — no meio da semana', () => {
    for (const dia of ['2026-10-14', '2026-10-15', '2026-10-16']) {
      const antes = janelaDe(dia)
      const ida = andar(dia, 1)
      expect(janelaDe(andar(ida, -1))).toEqual(antes)
    }
  })
})

// ===========================================================================
// LIMITES DE CALENDARIO. A aritmetica de data e o lugar classico de erro por
// off-by-one, e nenhum destes casos acontece com frequencia suficiente para
// alguem notar em producao antes de um usuario notar.
// ===========================================================================
describe('a navegacao atravessa mes, ano e 29 de fevereiro', () => {
  const janelaDe = (dia) => recorteDaSemana(semanaDe(dia), dia)
  const andar = (dia, delta) => andarNoRecorte(semanaDe(dia), dia, delta)

  it('uma janela pode conter dois meses', () => {
    // Sexta 30/10/2026: a janela cobre a virada sem sair da semana.
    expect(janelaDe('2026-10-30')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31'])
    expect(janelaDe(andar('2026-10-30', 1))).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })

  it('na ponta da semana a pagina vira para o mes seguinte', () => {
    // Sabado 31/10/2026 -> a semana seguinte comeca em 02/11.
    expect(janelaDe(andar('2026-10-31', 1))).toEqual(['2026-11-02', '2026-11-03', '2026-11-04'])
  })

  it('a virada de ANO e so mais uma virada de dia', () => {
    expect(janelaDe('2026-12-31')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
    expect(janelaDe(andar('2026-12-31', 1))).toEqual(['2026-12-31', '2027-01-01', '2027-01-02'])
    expect(janelaDe(andar('2027-01-01', -1))).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
  })

  it('29 de fevereiro existe e nao desloca nada', () => {
    // 2028 e bissexto; 28/02 cai numa segunda.
    expect(janelaDe('2028-02-28')).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
    expect(janelaDe(andar('2028-02-28', 1))).toEqual(['2028-02-29', '2028-03-01', '2028-03-02'])
  })

  it('num ano NAO bissexto, marco vem logo depois de 28 de fevereiro', () => {
    // 2027 nao e bissexto: 26/02 e uma sexta.
    expect(janelaDe('2027-02-26')).toEqual(['2027-02-25', '2027-02-26', '2027-02-27'])
    expect(janelaDe(andar('2027-02-26', 1))).toEqual(['2027-02-26', '2027-02-27', '2027-02-28'])
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
