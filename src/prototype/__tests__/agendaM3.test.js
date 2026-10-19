import { describe, it, expect } from 'vitest'
import { estadoInicial } from '../store/reducer'
import {
  semanaDe, eventosDoDia, semHorario, corDoEvento, situacaoDoEvento,
  faixaDeHoras, posicaoNaGrade, gradeDoMes, disposicaoDoDia, temConflito,
  CORES, COR_RESERVA, COR_PADRAO, MAX_PONTOS, HORA_PADRAO_INICIO,
  recorteDaSemana, andarNoRecorte, detalheDoBloco, DIAS_VISIVEIS, ALTURA_MINIMA_BLOCO,
  PX_HORA_SEMANA, FONTE_TITULO_BLOCO, FONTE_APOIO_BLOCO,
  faixaDoBloco, RECUO_SOBREPOSICAO, RECUO_TOTAL_MAXIMO,
} from '../store/agendaM3'
import { AGORA_DEMO, ESTADO, iso, somarDias } from '../mock/dados'

// ---------------------------------------------------------------------------
// UX-M3 — AS REGRAS DA AGENDA NO TELEFONE.
//
// O que se guarda aqui e o que cada visao PROMETE: o dia em ordem, a semana
// posicionada no tempo (inclusive quando dois compromissos se encavalam), e o
// mes como orientacao — pontos, nunca titulos.
//
// O visual NAO se testa aqui: o ambiente e Node, sem DOM. Composicao,
// hierarquia e ritmo sao julgados no QA visual, e no iPhone por uma pessoa.
// ---------------------------------------------------------------------------
const HOJE = new Date('2026-09-14T09:00:00') // segunda
const inicial = () => estadoInicial(HOJE)

describe('UX-M3 · a semana', () => {
  it('tem sete dias e começa na segunda', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    expect(dias.length).toBe(7)
    expect(dias[0]).toBe(e.hoje)
    expect(new Date(`${dias[0]}T12:00:00`).getDay()).toBe(1)
    expect(new Date(`${dias[6]}T12:00:00`).getDay()).toBe(0)
  })

  it('a semana de qualquer dia é a mesma semana', () => {
    const e = inicial()
    const quarta = iso(somarDias(new Date(`${e.hoje}T12:00:00`), 2))
    expect(semanaDe(quarta)).toEqual(semanaDe(e.hoje))
  })
})

describe('UX-M3 · o dia', () => {
  it('os eventos saem em ordem de horário', () => {
    const e = inicial()
    const horas = eventosDoDia(e, e.hoje).map((x) => x.inicio)
    expect([...horas].sort()).toEqual(horas)
  })

  it('o horário reservado aparece na linha do tempo, como espécie própria', () => {
    const e = inicial()
    const reservas = eventosDoDia(e, e.hoje).filter((x) => x.especie === 'reserva')
    expect(reservas.length).toBeGreaterThan(0)
    expect(corDoEvento(reservas[0])).toBe(COR_RESERVA)
  })

  it('"sem horário" é o que tem dia e não tem hora — nunca o que já tem', () => {
    const e = inicial()
    const soltas = semHorario(e, e.hoje)
    expect(soltas.length).toBeGreaterThan(0)
    for (const t of soltas) {
      expect(t.reserva).toBeFalsy()
      expect(t.planejadaPara).toBe(e.hoje)
      expect(t.estado).not.toBe(ESTADO.FEITO)
    }
    const naLinha = eventosDoDia(e, e.hoje).map((x) => x.tarefaId).filter(Boolean)
    for (const t of soltas) expect(naLinha).not.toContain(t.id)
  })
})

describe('UX-M3 · a etiqueta diz a verdade sobre o relógio', () => {
  it('às 08:40 a reunião das 09:00 ainda NÃO está acontecendo', () => {
    const e = inicial()
    const reuniao = eventosDoDia(e, e.hoje).find((x) => x.inicio === '09:00')
    const s = situacaoDoEvento(reuniao, AGORA_DEMO)
    expect(s.tipo).toBe('proximo')
    expect(s.texto).toBe('em 20 min')
  })

  it('durante o compromisso, a etiqueta é "Agora"', () => {
    const e = inicial()
    const reuniao = eventosDoDia(e, e.hoje).find((x) => x.inicio === '09:00')
    expect(situacaoDoEvento(reuniao, '09:30').tipo).toBe('agora')
  })

  it('depois dele, não há etiqueta nenhuma', () => {
    const e = inicial()
    const reuniao = eventosDoDia(e, e.hoje).find((x) => x.inicio === '09:00')
    expect(situacaoDoEvento(reuniao, '11:00')).toBeNull()
  })
})

describe('UX-M3 · cor classifica, não ordena', () => {
  it('a mesma categoria tem sempre a mesma cor', () => {
    const e = inicial()
    const porCategoria = {}
    for (const d of semanaDe(e.hoje)) {
      for (const x of eventosDoDia(e, d)) {
        if (x.especie === 'reserva') continue
        const cor = corDoEvento(x)
        if (porCategoria[x.categoria]) expect(porCategoria[x.categoria]).toBe(cor)
        porCategoria[x.categoria] = cor
      }
    }
    expect(Object.keys(porCategoria).length).toBeGreaterThan(1)
  })

  it('categoria desconhecida cai no neutro, não numa cor nova', () => {
    expect(corDoEvento({ especie: 'compromisso', categoria: 'Inexistente' })).toBe(COR_PADRAO)
    expect(corDoEvento({ especie: 'compromisso' })).toBe(COR_PADRAO)
  })

  it('reserva tem cor própria, independente da categoria', () => {
    expect(corDoEvento({ especie: 'reserva', categoria: 'Operação' })).toBe(COR_RESERVA)
    expect(CORES['Operação']).not.toBe(COR_RESERVA)
  })
})

describe('UX-M3 · a grade da semana', () => {
  it('a faixa de horas cobre tudo o que existe na semana', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    const { inicio, fim } = faixaDeHoras(e, dias)
    expect(inicio).toBeLessThanOrEqual(HORA_PADRAO_INICIO)
    for (const d of dias) {
      for (const x of eventosDoDia(e, d)) {
        expect(Number(x.inicio.slice(0, 2))).toBeGreaterThanOrEqual(inicio)
        expect(Number(x.fim.slice(0, 2))).toBeLessThanOrEqual(fim)
      }
    }
  })

  it('altura é duração: uma hora ocupa o dobro de meia hora', () => {
    const base = { inicio: 8, px: 40, alturaMinima: 0 }
    const meia = posicaoNaGrade({ inicio: '09:00', fim: '09:30' }, base)
    const uma = posicaoNaGrade({ inicio: '09:00', fim: '10:00' }, base)
    expect(uma.altura).toBe(meia.altura * 2)
    expect(meia.topo).toBe(40)
  })

  it('bloco curto ainda é tocável — a altura mínima protege isso', () => {
    // UX-M3 exigia >= 26px, com a grade de sete colunas. Em UX-M3.1 a grade
    // tem tres dias e mais ar: o piso subiu para ALTURA_MINIMA_BLOCO (30px),
    // que e o que cabe uma linha de titulo em 14.5px sem cortar.
    const p = posicaoNaGrade(
      { inicio: '09:00', fim: '09:10' },
      { inicio: 8, px: PX_HORA_SEMANA, alturaMinima: ALTURA_MINIMA_BLOCO },
    )
    expect(p.altura).toBeGreaterThanOrEqual(ALTURA_MINIMA_BLOCO)
    expect(ALTURA_MINIMA_BLOCO).toBeGreaterThanOrEqual(26)
  })

  it('dois compromissos que se encavalam DIVIDEM a coluna', () => {
    const e = inicial()
    const quinta = semanaDe(e.hoje)[3]
    expect(temConflito(e, quinta)).toBe(true)
    const disposto = disposicaoDoDia(e, quinta)
    const duplos = disposto.filter((x) => x.colunas > 1)
    expect(duplos.length).toBeGreaterThanOrEqual(2)
    // Nenhum par sobreposto pode cair na mesma coluna.
    for (const a of disposto) {
      for (const b of disposto) {
        if (a === b) continue
        const cruzam = a.evento.inicio < b.evento.fim && b.evento.inicio < a.evento.fim
        if (cruzam) expect(a.coluna).not.toBe(b.coluna)
      }
    }
  })

  it('dia sem sobreposição usa a coluna inteira', () => {
    const e = inicial()
    for (const x of disposicaoDoDia(e, e.hoje)) expect(x.colunas).toBe(1)
  })

  it('a disposição não perde nem inventa evento', () => {
    const e = inicial()
    const quinta = semanaDe(e.hoje)[3]
    const ids = disposicaoDoDia(e, quinta).map((x) => x.evento.id)
    expect(ids.sort()).toEqual(eventosDoDia(e, quinta).map((x) => x.id).sort())
  })
})

describe('UX-M3 · o mês orienta', () => {
  it('são 42 células, começando no domingo', () => {
    const e = inicial()
    const base = new Date(`${e.hoje}T12:00:00`)
    const grade = gradeDoMes(e, base.getFullYear(), base.getMonth())
    expect(grade.length).toBe(42)
    expect(new Date(`${grade[0].data}T12:00:00`).getDay()).toBe(0)
  })

  it('a célula leva pontos, nunca título — e no máximo três', () => {
    const e = inicial()
    const base = new Date(`${e.hoje}T12:00:00`)
    for (const c of gradeDoMes(e, base.getFullYear(), base.getMonth())) {
      expect(c.pontos.length).toBeLessThanOrEqual(MAX_PONTOS)
      expect(Object.keys(c)).not.toContain('titulo')
    }
  })

  it('os pontos são as cores REAIS do dia, sem repetição', () => {
    const e = inicial()
    const base = new Date(`${e.hoje}T12:00:00`)
    const hoje = gradeDoMes(e, base.getFullYear(), base.getMonth()).find((c) => c.data === e.hoje)
    expect(hoje.pontos).toEqual([...new Set(hoje.pontos)])
    for (const cor of hoje.pontos) {
      expect([...Object.values(CORES), COR_RESERVA, COR_PADRAO]).toContain(cor)
    }
  })

  it('dia sem nada não ganha ponto', () => {
    const e = inicial()
    const base = new Date(`${e.hoje}T12:00:00`)
    const vazios = gradeDoMes(e, base.getFullYear(), base.getMonth()).filter((c) => c.total === 0)
    expect(vazios.length).toBeGreaterThan(0)
    for (const c of vazios) expect(c.pontos).toEqual([])
  })

  it('o dia de fora do mês é marcado como tal', () => {
    const e = inicial()
    const base = new Date(`${e.hoje}T12:00:00`)
    const grade = gradeDoMes(e, base.getFullYear(), base.getMonth())
    expect(grade.some((c) => !c.doMes)).toBe(true)
    for (const c of grade) {
      expect(new Date(`${c.data}T12:00:00`).getMonth() === base.getMonth()).toBe(c.doMes)
    }
  })
})

// ---------------------------------------------------------------------------
// UX-M3.1 — A SEMANA EM TRES DIAS.
//
// O contrato ANTERIOR (UX-M3) era: a grade mostra os sete dias ao mesmo tempo,
// e o texto dentro do bloco e so uma pista (chegou a 9,5px). Esse contrato foi
// substituido, nao apagado: a faixa de sete dias continua existindo e e ela
// que preserva a visao da semana inteira. O que mudou e a GRADE.
// ---------------------------------------------------------------------------
describe('UX-M3.1 · a semana mostra sete datas e opera em três dias', () => {
  it('a faixa superior continua com os sete dias', () => {
    const e = inicial()
    expect(semanaDe(e.hoje).length).toBe(7)
  })

  it('a grade mostra exatamente três dias', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    for (const d of dias) expect(recorteDaSemana(dias, d).length).toBe(DIAS_VISIVEIS)
    expect(DIAS_VISIVEIS).toBe(3)
  })

  it('o dia escolhido está SEMPRE dentro do recorte', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    for (const d of dias) expect(recorteDaSemana(dias, d)).toContain(d)
  })

  it('o recorte é determinístico: a mesma seleção dá sempre a mesma janela', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    for (const d of dias) {
      expect(recorteDaSemana(dias, d)).toEqual(recorteDaSemana(dias, d))
    }
  })

  it('o dia escolhido fica no meio, e nas pontas a janela encosta e para', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje) // [seg..dom]
    expect(recorteDaSemana(dias, dias[0])).toEqual(dias.slice(0, 3)) // seg ter qua
    expect(recorteDaSemana(dias, dias[1])).toEqual(dias.slice(0, 3)) // seg ter qua
    expect(recorteDaSemana(dias, dias[2])).toEqual(dias.slice(1, 4)) // ter qua qui
    expect(recorteDaSemana(dias, dias[3])).toEqual(dias.slice(2, 5)) // qua qui sex
    expect(recorteDaSemana(dias, dias[4])).toEqual(dias.slice(3, 6)) // qui sex sab
    expect(recorteDaSemana(dias, dias[5])).toEqual(dias.slice(4, 7)) // sex sab dom
    expect(recorteDaSemana(dias, dias[6])).toEqual(dias.slice(4, 7)) // sex sab dom
  })

  it('o recorte nunca sai da semana', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    for (const d of dias) for (const x of recorteDaSemana(dias, d)) expect(dias).toContain(x)
  })

  it('o recorte é uma janela contígua, na ordem da semana', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    for (const d of dias) {
      const r = recorteDaSemana(dias, d)
      const i = dias.indexOf(r[0])
      expect(dias.slice(i, i + DIAS_VISIVEIS)).toEqual(r)
    }
  })

  it('a grade continua temporal: altura é duração, não posição na lista', () => {
    const base = { inicio: 7, px: PX_HORA_SEMANA, alturaMinima: ALTURA_MINIMA_BLOCO }
    const uma = posicaoNaGrade({ inicio: '09:00', fim: '10:00' }, base)
    const duas = posicaoNaGrade({ inicio: '09:00', fim: '11:00' }, base)
    expect(duas.altura).toBe(uma.altura * 2)
    expect(uma.topo).toBe(2 * PX_HORA_SEMANA)
  })

  it('a sobreposição continua dividindo a largura do dia', () => {
    const e = inicial()
    const quinta = semanaDe(e.hoje)[3]
    expect(disposicaoDoDia(e, quinta).some((x) => x.colunas > 1)).toBe(true)
  })
})

describe('UX-M3.1 · quem encolhe é o conteúdo, nunca a fonte', () => {
  it('a tipografia do bloco é fixa e legível', () => {
    expect(FONTE_TITULO_BLOCO).toBeGreaterThanOrEqual(14)
    expect(FONTE_APOIO_BLOCO).toBeGreaterThanOrEqual(13)
    // UX-M3 chegou a 9,5px dentro do bloco para caber sete colunas. Nunca mais.
    expect(Math.min(FONTE_TITULO_BLOCO, FONTE_APOIO_BLOCO)).toBeGreaterThan(9.5)
  })

  it('bloco alto mostra tudo; bloco curto mostra menos — nesta ordem', () => {
    const duasHoras = detalheDoBloco(2 * PX_HORA_SEMANA)
    const umaHora = detalheDoBloco(PX_HORA_SEMANA)
    const meiaHora = detalheDoBloco(ALTURA_MINIMA_BLOCO)
    expect(duasHoras).toEqual({ linhas: 2, horario: true, intervalo: true, apoio: true })
    expect(umaHora.horario).toBe(true)
    expect(umaHora.apoio).toBe(false)
    expect(meiaHora).toEqual({ linhas: 1, horario: false, intervalo: false, apoio: false })
  })

  it('bloco dividido por sobreposição cede METADADO, nunca fonte', () => {
    const inteiro = detalheDoBloco(2 * PX_HORA_SEMANA, 1)
    const dividido = detalheDoBloco(2 * PX_HORA_SEMANA, 2)
    expect(inteiro.apoio).toBe(true)
    expect(dividido.apoio).toBe(false)      // some o local
    expect(dividido.intervalo).toBe(false)  // o horário vira só o início
    expect(dividido.horario).toBe(true)     // mas não some
    // A linha liberada vai para o título: ele é o que faz reconhecer.
    expect(dividido.linhas).toBeGreaterThan(inteiro.linhas)
    // E a tipografia é a mesma nos dois casos — ela não entra nesta conta.
    expect(FONTE_TITULO_BLOCO).toBe(14.5)
  })

  it('o título nunca fica com menos linhas quando o bloco é dividido', () => {
    for (let h = 0; h <= 200; h += 2) {
      expect(detalheDoBloco(h, 2).linhas).toBeGreaterThanOrEqual(detalheDoBloco(h, 1).linhas)
    }
  })

  it('o conteúdo só cresce com a altura — nunca diminui ao ganhar espaço', () => {
    let anterior = detalheDoBloco(0)
    for (let h = 0; h <= 200; h += 2) {
      const atual = detalheDoBloco(h)
      expect(atual.linhas).toBeGreaterThanOrEqual(anterior.linhas)
      expect(Number(atual.horario)).toBeGreaterThanOrEqual(Number(anterior.horario))
      expect(Number(atual.apoio)).toBeGreaterThanOrEqual(Number(anterior.apoio))
      anterior = atual
    }
  })

  it('o título nunca some: mesmo o menor bloco mostra uma linha', () => {
    for (let h = 0; h <= 200; h += 1) expect(detalheDoBloco(h).linhas).toBeGreaterThanOrEqual(1)
  })
})

describe('UX-M3.1 · andar com o recorte move a grade um dia, sempre', () => {
  it('cada passo desloca a janela em exatamente um dia', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    let atual = dias[0]
    for (let i = 0; i < 4; i += 1) {
      const antes = recorteDaSemana(dias, atual)
      atual = andarNoRecorte(dias, atual, 1)
      const depois = recorteDaSemana(semanaDe(atual), atual)
      expect(depois[0]).toBe(dias[dias.indexOf(antes[0]) + 1])
    }
  })

  it('o dia resultante continua visível no próprio recorte', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    for (const d of dias) {
      for (const delta of [-1, 1]) {
        const novo = andarNoRecorte(dias, d, delta)
        expect(recorteDaSemana(semanaDe(novo), novo)).toContain(novo)
      }
    }
  })

  it('na ponta da semana o passo atravessa em vez de travar', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    const adiante = andarNoRecorte(dias, dias[6], 1) // janela já em sex-sáb-dom
    expect(dias).not.toContain(adiante)
    expect(adiante > dias[6]).toBe(true)
    const atras = andarNoRecorte(dias, dias[0], -1)
    expect(dias).not.toContain(atras)
    expect(atras < dias[0]).toBe(true)
  })

  it('ir e voltar devolve a mesma janela', () => {
    const e = inicial()
    const dias = semanaDe(e.hoje)
    for (const d of dias) {
      const adiante = andarNoRecorte(dias, d, 1)
      const volta = andarNoRecorte(semanaDe(adiante), adiante, -1)
      expect(recorteDaSemana(semanaDe(volta), volta)).toEqual(recorteDaSemana(dias, d))
    }
  })
})

describe('UX-M3.1 · sobreposição escalona, não espreme', () => {
  it('sem conflito o bloco ocupa a coluna inteira', () => {
    expect(faixaDoBloco(0, 1)).toEqual({ esquerda: 0, largura: 100 })
  })

  it('dois conflitantes guardam largura legível — nada de metade da coluna', () => {
    // UX-M3 dava 50% a cada um: em 101px de coluna isso virava 48px, e o
    // titulo aparecia como "Dire — re…". O escalonamento devolve ~72%.
    const a = faixaDoBloco(0, 2)
    const b = faixaDoBloco(1, 2)
    expect(a.largura).toBeGreaterThan(60)
    expect(b.largura).toBe(a.largura)
    expect(b.esquerda).toBeGreaterThan(a.esquerda)
    expect(a.largura).toBeGreaterThan(100 / 2)
  })

  it('cada bloco deixa uma tira do anterior à mostra — o conflito continua visível', () => {
    for (const colunas of [2, 3, 4]) {
      for (let c = 1; c < colunas; c += 1) {
        const atras = faixaDoBloco(c - 1, colunas)
        const frente = faixaDoBloco(c, colunas)
        expect(frente.esquerda).toBeGreaterThan(atras.esquerda)
      }
    }
  })

  it('nenhum bloco sai da coluna', () => {
    for (const colunas of [1, 2, 3, 4, 5]) {
      for (let c = 0; c < colunas; c += 1) {
        const f = faixaDoBloco(c, colunas)
        expect(f.esquerda).toBeGreaterThanOrEqual(0)
        expect(f.esquerda + f.largura).toBeLessThanOrEqual(100.001)
      }
    }
  })

  it('muitos conflitos não derretem a largura: o recuo total tem teto', () => {
    for (const colunas of [2, 3, 4, 5, 8]) {
      expect(faixaDoBloco(0, colunas).largura).toBeGreaterThanOrEqual(100 - RECUO_TOTAL_MAXIMO)
    }
    expect(RECUO_TOTAL_MAXIMO).toBeLessThan(100)
    expect(RECUO_SOBREPOSICAO).toBeLessThanOrEqual(RECUO_TOTAL_MAXIMO)
  })
})
