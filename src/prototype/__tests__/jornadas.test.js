import { describe, it, expect } from 'vitest'
import { reducer, estadoInicial, paraHoje, atrasadas, porOrganizar, agendaDoDia, planejadasDoDia, tarefaPorId, memoriaPorId, buscar } from '../store/reducer'
import { ESTADO, iso, somarDias, inicioDaSemana } from '../mock/dados'

// ---------------------------------------------------------------------------
// AS PROMESSAS DO PROTOTIPO, em teste.
//
// Nao se testa aqui compreensao de linguagem: a IA e mock e nao entende nada.
// O que se guarda sao as REGRAS DE PRODUTO que a demonstracao precisa sustentar
// — e que, se quebrarem em silencio, fariam o prototipo mentir sobre o produto
// que estamos avaliando:
//
//   . guardar nao cria acao nenhuma;
//   . proposta sem confirmacao nao muda nada;
//   . uma acao derivada nao destroi a origem;
//   . "fazer na terça" nao reserva horario;
//   . retirar horario nao conclui nem apaga.
// ---------------------------------------------------------------------------

const HOJE = new Date('2026-09-14T09:00:00') // uma segunda-feira
const inicial = () => estadoInicial(HOJE)
const seg = inicioDaSemana(HOJE)
const TERCA = iso(somarDias(seg, 1))
const QUARTA = iso(somarDias(seg, 2))

describe('A · capturar sem classificar', () => {
  it('guardar cria um item por organizar — e nenhuma tarefa ou compromisso', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'guardar', texto: 'ideia para melhorar a preparação dos carros' })

    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
    expect(e1.compromissos).toHaveLength(e0.compromissos.length)
    expect(porOrganizar(e1)).toHaveLength(porOrganizar(e0).length + 1)
    expect(e1.memoria[0].porOrganizar).toBe(true)
    expect(e1.aviso.texto).toBe('Guardado · Por organizar')
  })

  it('o que foi guardado é reencontrável por busca, não só navegando', () => {
    const e1 = reducer(inicial(), { tipo: 'guardar', texto: 'trocar a frota de apoio no fim do ano' })
    const r = buscar(e1, 'frota de apoio')
    expect(r.memoria.length).toBeGreaterThan(0)
  })

  it('um link pode ser guardado como referência sem gerar tarefa', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'guardarReferencia', texto: 'https://exemplo.com/pauta', titulo: 'Pauta do comitê' })
    expect(e1.memoria[0].referencia).toBe(true)
    expect(e1.memoria[0].porOrganizar).toBe(false)
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
  })
})

describe('B · proposta sem confirmação não muda nada', () => {
  it('abrir e fechar a captura não cria compromisso nem tarefa', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'guardarRascunho', rascunho: { texto: 'reunião com gerentes amanhã às 8h' } })

    expect(e1.compromissos).toHaveLength(e0.compromissos.length)
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
    expect(e1.memoria).toHaveLength(e0.memoria.length)
    // o rascunho sobrevive DENTRO da sessão: desistir não é perder o que se escreveu
    expect(e1.rascunho.texto).toContain('gerentes')
  })

  it('só a confirmação cria o compromisso — e ele aparece na agenda', () => {
    const e1 = reducer(inicial(), {
      tipo: 'criarCompromisso',
      dados: { titulo: 'Reunião com os gerentes', data: TERCA, inicio: '08:30', fim: '09:30' },
    })
    const naAgenda = agendaDoDia(e1, TERCA).find((c) => c.titulo === 'Reunião com os gerentes')
    expect(naAgenda).toBeTruthy()
    expect(naAgenda.inicio).toBe('08:30')   // o ajuste de 8:00 para 8:30 valeu
    expect(e1.rascunho).toBeNull()
  })

  it('descartar o rascunho não deixa resíduo', () => {
    const e1 = reducer(inicial(), { tipo: 'guardarRascunho', rascunho: { texto: 'x' } })
    const e2 = reducer(e1, { tipo: 'descartarRascunho' })
    expect(e2.rascunho).toBeNull()
  })
})

describe('C · memória → ação, sem destruir a origem', () => {
  it('criar tarefa a partir de uma nota mantém a nota e guarda o caminho de volta', () => {
    const e0 = inicial()
    const nota = memoriaPorId(e0, 'm-preparacao')
    const e1 = reducer(e0, {
      tipo: 'criarTarefa',
      dados: { titulo: 'Revisar o checklist com o pós-venda', origemId: nota.id },
    })

    // a nota continua existindo, inteira
    expect(memoriaPorId(e1, 'm-preparacao')).toEqual(nota)
    expect(e1.memoria).toHaveLength(e0.memoria.length)
    // e a tarefa aponta de volta
    expect(e1.tarefas[0].origemId).toBe('m-preparacao')
  })

  it('a tarefa que já vem da história aponta para a nota certa', () => {
    const e0 = inicial()
    const t = tarefaPorId(e0, 't-gerentes')
    expect(memoriaPorId(e0, t.origemId).titulo).toMatch(/prepara/i)
  })
})

describe('D · Hoje é seleção, não agrupamento', () => {
  it('cada item de Hoje carrega o motivo de estar lá', () => {
    const e0 = inicial()
    for (const t of paraHoje(e0)) expect(t.motivo).toBeTruthy()
  })

  it('tarefa sem data NÃO aparece em Hoje', () => {
    const e0 = inicial()
    const ids = paraHoje(e0).map((t) => t.id)
    expect(ids).not.toContain('t-apresentacao')  // sem dia nenhum
    expect(ids).not.toContain('t-higienizacao')  // em andamento, mas sem dia
  })

  it('atraso é prazo vencido de verdade, não "qualquer pendência"', () => {
    const e0 = inicial()
    const ids = atrasadas(e0).map((t) => t.id)
    expect(ids).toContain('t-consorcio')
    expect(ids).not.toContain('t-apresentacao')
  })

  it('concluir em Hoje muda só o estado daquela tarefa', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'mudarEstado', id: 't-porcino', estado: ESTADO.FEITO })
    expect(tarefaPorId(e1, 't-porcino').estado).toBe(ESTADO.FEITO)
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
    expect(paraHoje(e1).map((t) => t.id)).not.toContain('t-porcino')
  })
})

describe('E · dia e horário são decisões diferentes', () => {
  it('"fazer na terça" planeja o DIA e não reserva horário nenhum', () => {
    const e1 = reducer(inicial(), { tipo: 'planejarPara', id: 't-higienizacao', data: TERCA })
    const t = tarefaPorId(e1, 't-higienizacao')

    expect(t.planejadaPara).toBe(TERCA)
    expect(t.reserva).toBeNull()
    // aparece como tarefa planejada do dia, fora da linha do tempo
    expect(planejadasDoDia(e1, TERCA).map((x) => x.id)).toContain('t-higienizacao')
    expect(agendaDoDia(e1, TERCA).map((x) => x.tarefaId)).not.toContain('t-higienizacao')
    // e continua em andamento: planejar não mexe no estado
    expect(t.estado).toBe(ESTADO.FAZENDO)
  })

  it('reservar horário cria o intervalo na agenda', () => {
    const e1 = reducer(inicial(), {
      tipo: 'reservarHorario', id: 't-gerentes', data: TERCA, inicio: '14:00', fim: '15:00',
    })
    const bloco = agendaDoDia(e1, TERCA).find((x) => x.tarefaId === 't-gerentes')

    expect(bloco).toBeTruthy()
    expect(bloco.especie).toBe('reserva')
    expect(`${bloco.inicio}–${bloco.fim}`).toBe('14:00–15:00')
    // reservar um intervalo de terça implica fazer na terça
    expect(tarefaPorId(e1, 't-gerentes').planejadaPara).toBe(TERCA)
  })

  it('retirar o horário reservado não conclui, não exclui e não tira o dia', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'reservarHorario', id: 't-higienizacao', data: TERCA, inicio: '14:00', fim: '15:00' })
    const e2 = reducer(e1, { tipo: 'retirarReserva', id: 't-higienizacao' })
    const t = tarefaPorId(e2, 't-higienizacao')

    expect(t).toBeTruthy()                       // não excluiu
    expect(t.estado).toBe(ESTADO.FAZENDO)        // não concluiu
    expect(t.planejadaPara).toBe(TERCA)          // não desplanejou
    expect(t.reserva).toBeNull()                 // só tirou o horário
    expect(e2.tarefas).toHaveLength(e0.tarefas.length)
  })

  it('tirar o dia é outra decisão, e também não apaga a tarefa', () => {
    const e1 = reducer(inicial(), { tipo: 'retirarPlanejamento', id: 't-gerentes' })
    const t = tarefaPorId(e1, 't-gerentes')
    expect(t.planejadaPara).toBeNull()
    expect(t.estado).toBe(ESTADO.A_FAZER)
    expect(t.origemId).toBe('m-preparacao')      // a origem sobrevive a tudo isso
  })
})

describe('F · IA contextual aplica só o que foi confirmado', () => {
  it('nenhuma subtarefa entra sem confirmação', () => {
    const e0 = inicial()
    expect(tarefaPorId(e0, 't-apresentacao').subtarefas).toHaveLength(0)
    const e1 = reducer(e0, { tipo: 'adicionarSubtarefas', id: 't-apresentacao', titulos: [] })
    expect(tarefaPorId(e1, 't-apresentacao').subtarefas).toHaveLength(0)
  })

  it('só os passos selecionados são adicionados', () => {
    const e1 = reducer(inicial(), {
      tipo: 'adicionarSubtarefas',
      id: 't-apresentacao',
      titulos: ['Levantar números de giro do trimestre', 'Montar o esqueleto dos slides'],
    })
    const sub = tarefaPorId(e1, 't-apresentacao').subtarefas
    expect(sub).toHaveLength(2)
    expect(sub.every((s) => !s.feito)).toBe(true)
  })
})

describe('G · copiloto ampliado não aplica nada sozinho', () => {
  const plano = [
    { tipo: 'reservarHorario', id: 't-gerentes', data: TERCA, inicio: '14:00', fim: '15:00' },
    { tipo: 'planejarPara', id: 't-apresentacao', data: QUARTA },
  ]

  it('desistir do plano deixa o estado exatamente como estava', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'aplicarPlano', mudancas: [] })
    expect(e1.tarefas).toEqual(e0.tarefas)
    expect(e1.compromissos).toEqual(e0.compromissos)
  })

  it('confirmar aplica apenas as mudanças escolhidas', () => {
    const e1 = reducer(inicial(), { tipo: 'aplicarPlano', mudancas: plano })
    expect(tarefaPorId(e1, 't-gerentes').reserva.inicio).toBe('14:00')
    expect(tarefaPorId(e1, 't-apresentacao').planejadaPara).toBe(QUARTA)
    // o que não foi escolhido não mudou
    expect(tarefaPorId(e1, 't-consorcio').paraHoje).toBe(false)
  })
})

describe('a história dos mocks se sustenta', () => {
  it('tem tudo que o protótipo precisa para ser julgado', () => {
    const e = inicial()
    expect(e.compromissos.filter((c) => c.data === e.hoje).length).toBeGreaterThanOrEqual(3)
    expect(e.tarefas.some((t) => t.estado === ESTADO.FAZENDO && !t.planejadaPara)).toBe(true)
    expect(e.tarefas.some((t) => t.estado === ESTADO.FEITO)).toBe(true)
    expect(atrasadas(e).length).toBeGreaterThan(0)
    expect(porOrganizar(e).length).toBeGreaterThanOrEqual(3)
    expect(e.memoria.some((m) => m.referencia)).toBe(true)
  })
})
