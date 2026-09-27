import { describe, it, expect } from 'vitest'
import { estadoInicial } from '../store/reducer'
import {
  semanaDe, eventosDoDia, semHorario, corDoEvento, situacaoDoEvento,
  faixaDeHoras, posicaoNaGrade, gradeDoMes, disposicaoDoDia, temConflito,
  CORES, COR_RESERVA, COR_PADRAO, MAX_PONTOS, HORA_PADRAO_INICIO,
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
    const p = posicaoNaGrade({ inicio: '09:00', fim: '09:10' }, { inicio: 8, px: 40 })
    expect(p.altura).toBeGreaterThanOrEqual(26)
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
