import { describe, it, expect } from 'vitest'
import {
  reducer, estadoInicial, paraHoje, decisoes, motivoDeDecisao, minhas, delegadasPorMim,
  recebidas, conflitosDoDia, conflitosDaSemana, ocupacaoDoDia, relatorio, naoLidas,
  porOrganizar, memoriaAtiva, buscar, tarefaPorId, memoriaPorId, colunaDe,
} from '../store/reducer'
import { ESTADO, RESPONSABILIDADE, EU, iso, somarDias, inicioDaSemana } from '../mock/dados'
import { referenciaDe, descreverAlerta, momentoDoAlerta } from '../mock/alerta'
import { responder, revisar } from '../mock/ia'

// ---------------------------------------------------------------------------
// UX1.2 — AS REGRAS DA CONSOLIDACAO, em teste.
//
// O que se guarda aqui nao e a aparencia: e o conjunto de promessas que o
// prototipo faz sobre o produto e que, se quebrarem em silencio, fariam a
// avaliacao inteira apoiar-se numa mentira.
//
//   . delegar troca o responsavel da MESMA tarefa — nunca cria copia;
//   . responsabilidade e execucao sao eixos separados;
//   . devolver EXIGE motivo;
//   . historico registra tudo; notificacao interrompe so o que merece;
//   . nota deliberada nao nasce "por organizar", e nota vazia nao cria lixo;
//   . alerta relativo acompanha a referencia; alerta especifico nao se desloca;
//   . perguntar nao escreve; escrever espera confirmacao.
// ---------------------------------------------------------------------------
const HOJE = new Date('2026-09-14T09:00:00') // uma segunda-feira
const inicial = () => estadoInicial(HOJE)
const seg = inicioDaSemana(HOJE)
const dia = (n) => iso(somarDias(seg, n))
const [SEG, TER, QUA, QUI] = [dia(0), dia(1), dia(2), dia(3)]

// --- 1 a 5, 10 · arquitetura, central de ação e Hoje -----------------------
describe('Hoje é seleção — e delegação não enche o dia de ninguém', () => {
  it('tarefa que está com outra pessoa NÃO entra no meu dia', () => {
    const e = inicial()
    const docs = tarefaPorId(e, 't-docs')
    expect(docs.responsavelId).toBe('p-rubens')
    expect(paraHoje(e).some((t) => t.id === 't-docs')).toBe(false)
  })

  it('mas volta como DECISÃO quando exige algo de mim', () => {
    const e = inicial()
    const ids = decisoes(e).map((t) => t.id)
    expect(ids).toContain('t-site')      // devolvida
    expect(ids).toContain('t-escala')    // bloqueada
    expect(ids).toContain('t-reajuste')  // atribuída a mim, sem aceite
    expect(ids).not.toContain('t-docs')  // aceita e andando: não é assunto meu
  })

  it('cada decisão carrega o motivo de estar ali', () => {
    const e = inicial()
    for (const t of decisoes(e)) expect(t.motivoDecisao).toBeTruthy()
    expect(motivoDeDecisao(tarefaPorId(e, 't-site'), e.hoje)).toMatch(/devolvida/i)
    expect(motivoDeDecisao(tarefaPorId(e, 't-escala'), e.hoje)).toMatch(/bloqueada/i)
  })

  it('captura comum "por organizar" não ganha urgência falsa', () => {
    const e = reducer(inicial(), { tipo: 'guardar', texto: 'ver preço do guincho' })
    const nova = e.memoria[0]
    expect(nova.porOrganizar).toBe(true)
    expect(decisoes(e).some((t) => t.titulo.includes('guincho'))).toBe(false)
    expect(paraHoje(e).some((t) => t.titulo.includes('guincho'))).toBe(false)
  })

  it('capturar continua não criando tarefa nem compromisso', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'guardar', texto: 'trocar a frota de apoio' })
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
    expect(e1.compromissos).toHaveLength(e0.compromissos.length)
  })
})

// --- 6, 7, 8, 9, 30 · notas ------------------------------------------------
describe('Nova nota — o bloco de notas de volta', () => {
  it('nota deliberada NÃO nasce em "Por organizar"', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'criarNota', titulo: '', texto: 'Rever política de desconto no fim do mês.' })
    expect(e1.memoria[0].porOrganizar).toBe(false)
    expect(porOrganizar(e1)).toHaveLength(porOrganizar(e0).length)
  })

  it('o título é opcional: sai da primeira linha quando não é dado', () => {
    const e = reducer(inicial(), { tipo: 'criarNota', texto: 'Comprar pneus\nfalar com o Jorge' })
    expect(e.memoria[0].titulo).toBe('Comprar pneus')
  })

  it('nota vazia não cria lixo', () => {
    const e0 = inicial()
    expect(reducer(e0, { tipo: 'criarNota', titulo: '', texto: '   ' }).memoria).toHaveLength(e0.memoria.length)
  })

  it('a captura livre continua entrando como "por organizar" — são coisas diferentes', () => {
    const e = reducer(inicial(), { tipo: 'guardar', texto: 'pensar no consórcio' })
    expect(e.memoria[0].porOrganizar).toBe(true)
  })

  it('nota gera tarefa e CONTINUA existindo, com o caminho de volta', () => {
    const e0 = inicial()
    const antes = memoriaPorId(e0, 'm-preparacao')
    const e1 = reducer(e0, {
      tipo: 'criarTarefa',
      dados: { titulo: 'Montar o checklist com o pós-venda', origemId: 'm-preparacao' },
    })
    expect(memoriaPorId(e1, 'm-preparacao')).toEqual(antes)
    expect(e1.tarefas[0].origemId).toBe('m-preparacao')
  })

  it('arquivar tira da lista de trabalho sem excluir e sem virar tarefa', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'arquivarMemoria', id: 'm-garantia' })
    expect(memoriaAtiva(e1).some((m) => m.id === 'm-garantia')).toBe(false)
    expect(memoriaPorId(e1, 'm-garantia').arquivada).toBe(true)
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
    expect(buscar(e1, 'garantia').memoria.length).toBeGreaterThan(0) // continua encontrável
  })

  it('editar, desarquivar e excluir continuam funcionando', () => {
    let e = reducer(inicial(), { tipo: 'editarNota', id: 'm-testdrive', patch: { texto: 'Novo texto' } })
    expect(memoriaPorId(e, 'm-testdrive').texto).toBe('Novo texto')
    e = reducer(e, { tipo: 'arquivarMemoria', id: 'm-testdrive' })
    e = reducer(e, { tipo: 'arquivarMemoria', id: 'm-testdrive', valor: false })
    expect(memoriaPorId(e, 'm-testdrive').arquivada).toBe(false)
    e = reducer(e, { tipo: 'excluirMemoria', id: 'm-testdrive' })
    expect(memoriaPorId(e, 'm-testdrive')).toBeNull()
  })
})

// --- 11 · mês ---------------------------------------------------------------
describe('Mês mostra ocupação conhecida, não disponibilidade', () => {
  it('a ocupação de um dia soma a duração do que o Agenda conhece', () => {
    const e = inicial()
    // segunda: 09–10, 12:30–14, 16–17 + reserva 14:15–15:30 = 60+90+60+75
    expect(ocupacaoDoDia(e, SEG)).toBe(285)
  })

  it('um dia sem nada tem ocupação zero — e isso não afirma que está livre', () => {
    const e = inicial()
    expect(ocupacaoDoDia(e, dia(5))).toBe(0)
  })
})

// --- 13, 14, 15 · mover ------------------------------------------------------
describe('Mover: arrasto, toque e "Mover para…" usam a mesma regra', () => {
  it('mover muda a coluna e registra no histórico', () => {
    const e = reducer(inicial(), { tipo: 'moverTarefa', id: 't-porcino', paraEstado: ESTADO.FAZENDO })
    const t = tarefaPorId(e, 't-porcino')
    expect(t.estado).toBe(ESTADO.FAZENDO)
    expect(t.atividade.at(-1).evento).toBe('moveu')
    expect(t.atividade.at(-1).detalhe).toBe('A fazer → Em andamento')
  })

  it('mover NÃO aceita responsabilidade nem mexe no dia planejado', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'moverTarefa', id: 't-jorge', paraEstado: ESTADO.FAZENDO })
    const t = tarefaPorId(e1, 't-jorge')
    expect(t.responsabilidade).toBe(RESPONSABILIDADE.AGUARDANDO)
    expect(t.planejadaPara).toBe(tarefaPorId(e0, 't-jorge').planejadaPara)
  })

  it('"sem data" continua filtro, não coluna', () => {
    const e = inicial()
    const semData = e.tarefas.filter((t) => !t.planejadaPara && !t.prazo)
    expect(semData.some((t) => t.estado === ESTADO.FAZENDO)).toBe(true)
    expect(colunaDe(e, ESTADO.A_FAZER).length + colunaDe(e, ESTADO.FAZENDO).length + colunaDe(e, ESTADO.FEITO).length)
      .toBe(e.tarefas.length)
  })
})

// --- 21, 22, 23, 24 · delegação ---------------------------------------------
describe('Delegação: a mesma tarefa, nunca uma cópia', () => {
  it('delegar troca o responsável sem duplicar nada', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'delegar', id: 't-proposta', paraId: 'p-carla' })
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
    expect(e1.tarefas.filter((t) => t.id === 't-proposta')).toHaveLength(1)
    const t = tarefaPorId(e1, 't-proposta')
    expect(t.responsavelId).toBe('p-carla')
    expect(t.delegadorId).toBe(EU)
    expect(t.responsabilidade).toBe(RESPONSABILIDADE.AGUARDANDO)
    expect(t.atividade.at(-1)).toMatchObject({ autorId: EU, evento: 'delegou', detalhe: 'para Carla' })
  })

  it('criador, delegador e responsável são campos distintos', () => {
    const e = inicial()
    const t = tarefaPorId(e, 't-reajuste')
    expect(t.criadorId).toBe('p-marina')
    expect(t.delegadorId).toBe('p-marina')
    expect(t.responsavelId).toBe(EU)
  })

  it('aceitar NÃO move de coluna: responsabilidade e execução são eixos separados', () => {
    const e0 = inicial()
    const antes = tarefaPorId(e0, 't-reajuste').estado
    const e1 = reducer(e0, { tipo: 'aceitarResponsabilidade', id: 't-reajuste' })
    const t = tarefaPorId(e1, 't-reajuste')
    expect(t.responsabilidade).toBe(RESPONSABILIDADE.ACEITA)
    expect(t.estado).toBe(antes)
  })

  it('devolver EXIGE motivo — sem motivo nada muda', () => {
    const e0 = inicial()
    expect(reducer(e0, { tipo: 'devolverResponsabilidade', id: 't-reajuste' })).toBe(e0)
    expect(reducer(e0, { tipo: 'devolverResponsabilidade', id: 't-reajuste', motivo: '   ' })).toBe(e0)
  })

  it('devolver registra o motivo e devolve a responsabilidade a quem delegou', () => {
    const e = reducer(inicial(), {
      tipo: 'devolverResponsabilidade', id: 't-docs', motivo: 'Faltam os CRVs', porId: 'p-rubens',
    })
    const t = tarefaPorId(e, 't-docs')
    expect(t.responsabilidade).toBe(RESPONSABILIDADE.DEVOLVIDA)
    expect(t.motivoDevolucao).toBe('Faltam os CRVs')
    expect(t.responsavelId).toBe(EU)
    expect(t.atividade.at(-1).evento).toBe('devolveu')
  })

  it('devolução cria decisão visível para o delegador', () => {
    const e = reducer(inicial(), {
      tipo: 'devolverResponsabilidade', id: 't-docs', motivo: 'Faltam os CRVs', porId: 'p-rubens',
    })
    expect(decisoes(e).some((t) => t.id === 't-docs')).toBe(true)
    expect(naoLidas(e).some((n) => n.titulo.includes('devolveu'))).toBe(true)
  })

  it('retomar encerra a delegação sem apagar o histórico', () => {
    const e = reducer(inicial(), { tipo: 'retomarTarefa', id: 't-site' })
    const t = tarefaPorId(e, 't-site')
    expect(t.delegadorId).toBeNull()
    expect(t.responsabilidade).toBeNull()
    expect(t.atividade.length).toBeGreaterThan(1)
    expect(t.atividade.some((a) => a.evento === 'devolveu')).toBe(true)
  })

  it('bloqueio é condição, não coluna', () => {
    const e0 = inicial()
    const antes = tarefaPorId(e0, 't-proposta').estado
    const e1 = reducer(e0, { tipo: 'bloquearTarefa', id: 't-proposta', motivo: 'esperando a tabela' })
    expect(tarefaPorId(e1, 't-proposta').bloqueio).toBe('esperando a tabela')
    expect(tarefaPorId(e1, 't-proposta').estado).toBe(antes)
  })

  it('os três recortes são do mesmo conjunto — e a tarefa aparece nos que a descrevem', () => {
    const e = inicial()
    expect(minhas(e).some((t) => t.id === 't-docs')).toBe(false)
    expect(delegadasPorMim(e).some((t) => t.id === 't-docs')).toBe(true)
    expect(recebidas(e).some((t) => t.id === 't-reajuste')).toBe(true)
    expect(minhas(e).some((t) => t.id === 't-reajuste')).toBe(true)
  })

  it('a Atividade registra autor, evento e momento', () => {
    const t = tarefaPorId(inicial(), 't-docs')
    for (const a of t.atividade) {
      expect(a.autorId).toBeTruthy()
      expect(a.evento).toBeTruthy()
      expect(a.quando).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    }
    expect(t.atividade.map((a) => a.evento)).toEqual(
      expect.arrayContaining(['delegou', 'aceitou', 'moveu', 'alterou o prazo', 'comentou']),
    )
  })
})

// --- 25, 26 · notificações ---------------------------------------------------
describe('Histórico ≠ notificação', () => {
  it('as duas origens existem e não se misturam', () => {
    const e = inicial()
    expect(e.notificacoes.some((n) => n.origem === 'lembrete')).toBe(true)
    expect(e.notificacoes.some((n) => n.origem === 'atividade')).toBe(true)
  })

  it('mudança rotineira de estado entra no histórico e NÃO notifica', () => {
    const e0 = inicial()
    const antes = e0.notificacoes.length
    const e1 = reducer(e0, { tipo: 'mudarEstado', id: 't-porcino', estado: ESTADO.FAZENDO })
    expect(e1.notificacoes).toHaveLength(antes)
    expect(tarefaPorId(e1, 't-porcino').atividade.at(-1).evento).toBe('moveu')
  })

  it('o mock já nasce com mais eventos no histórico do que notificações', () => {
    const e = inicial()
    const eventos = e.tarefas.flatMap((t) => t.atividade || []).length
    expect(eventos).toBeGreaterThan(e.notificacoes.length)
    // "moveu A fazer → Em andamento" está no histórico do Rubens e em
    // notificação nenhuma. (A ALTERAÇÃO DE PRAZO, sim: aquela interrompe.)
    expect(tarefaPorId(e, 't-docs').atividade.some((a) => a.evento === 'moveu')).toBe(true)
    const textoDasNotificacoes = e.notificacoes.map((n) => `${n.titulo} ${n.detalhe || ''}`).join(' | ')
    expect(textoDasNotificacoes).not.toMatch(/A fazer →|Em andamento →|moveu/i)
    expect(textoDasNotificacoes).toMatch(/alterou o prazo/i)
  })

  it('bloqueio e aceite por outra pessoa INTERROMPEM', () => {
    let e = reducer(inicial(), { tipo: 'aceitarResponsabilidade', id: 't-jorge', porId: 'p-jorge' })
    expect(naoLidas(e).some((n) => n.titulo.includes('Jorge aceitou'))).toBe(true)
    e = reducer(e, { tipo: 'bloquearTarefa', id: 't-jorge', motivo: 'sem guincho', porId: 'p-jorge' })
    expect(naoLidas(e).some((n) => n.titulo.includes('bloqueou'))).toBe(true)
  })

  it('silenciar muda o que interrompe, não o que fica registrado', () => {
    const e = reducer(inicial(), { tipo: 'alternarAcompanhar', id: 't-docs' })
    expect(tarefaPorId(e, 't-docs').acompanhando).toBe(false)
    expect(tarefaPorId(e, 't-docs').atividade.length).toBe(tarefaPorId(inicial(), 't-docs').atividade.length)
  })

  it('ler uma notificação não apaga nada', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'lerNotificacao', id: 'n-3' })
    expect(e1.notificacoes).toHaveLength(e0.notificacoes.length)
    expect(e1.notificacoes.find((n) => n.id === 'n-3').lida).toBe(true)
    expect(naoLidas(reducer(e1, { tipo: 'lerTodasNotificacoes' }))).toHaveLength(0)
  })
})

// --- 27 · alertas ------------------------------------------------------------
describe('Alerta se apoia sempre em alguma referência', () => {
  it('a referência de um compromisso é o próprio horário', () => {
    const c = inicial().compromissos.find((x) => x.id === 'c-gerentes')
    expect(referenciaDe(c)).toEqual({ tipo: 'compromisso', data: SEG, hora: '09:00' })
    expect(descreverAlerta(c.alerta, referenciaDe(c))).toBe('15 min antes do compromisso')
  })

  it('numa tarefa, o horário reservado ganha do prazo — é mais preciso', () => {
    const t = tarefaPorId(inicial(), 't-repasse')
    expect(referenciaDe(t).tipo).toBe('reserva')
    expect(descreverAlerta(t.alerta, referenciaDe(t))).toBe('15 min antes do horário reservado')
  })

  it('sem horário nem prazo não há referência — e o texto diz isso', () => {
    const t = tarefaPorId(inicial(), 't-treinamento')
    expect(referenciaDe(t)).toBeNull()
    expect(descreverAlerta(null, null)).toBe('sem alerta')
  })

  it('o alerta relativo ACOMPANHA a referência quando o horário muda', () => {
    const e0 = inicial()
    const t0 = tarefaPorId(e0, 't-repasse')
    expect(momentoDoAlerta(t0.alerta, referenciaDe(t0)).hora).toBe('14:00') // 14:15 − 15

    const e1 = reducer(e0, { tipo: 'reservarHorario', id: 't-repasse', data: SEG, inicio: '16:00', fim: '17:00' })
    const t1 = tarefaPorId(e1, 't-repasse')
    expect(momentoDoAlerta(t1.alerta, referenciaDe(t1)).hora).toBe('15:45') // acompanhou sozinho
  })

  it('o alerta específico NÃO se desloca', () => {
    const alerta = { em: `${TER}T07:30` }
    expect(momentoDoAlerta(alerta, { tipo: 'compromisso', data: QUA, hora: '10:00' }))
      .toEqual({ data: TER, hora: '07:30', especifico: true })
  })
})

// --- 16, 17, 18 · copiloto ---------------------------------------------------
describe('Copiloto: perguntar não escreve, pedir mudança espera', () => {
  it('consulta responde direto e não vira proposta', () => {
    const r = responder('o que está atrasado?', inicial(), null)
    expect(r.especie).toBe('resposta')
    expect(r.texto).toMatch(/prazo vencido/)
  })

  it('a busca na memória devolve fontes abríveis', () => {
    const r = responder('encontrar algo que anotei', inicial(), null)
    expect(r.fontes.length).toBeGreaterThan(0)
    expect(r.fontes[0]).toHaveProperty('id')
  })

  it('pedido de alteração vira proposta — e a proposta sozinha não muda nada', () => {
    const e0 = inicial()
    const r = responder('organizar meu dia', e0, null)
    expect(r.especie).toBe('proposta')
    const e1 = reducer(e0, { tipo: 'copilotoProposta', proposta: r })
    expect(e1.tarefas).toEqual(e0.tarefas)
    expect(e1.compromissos).toEqual(e0.compromissos)
  })

  it('só o que foi escolhido é aplicado', () => {
    const e0 = inicial()
    const r = responder('organizar meu dia', e0, null)
    const e1 = reducer(e0, { tipo: 'aplicarPlano', mudancas: [r.mudancas[0].acao] })
    expect(tarefaPorId(e1, 't-consorcio').paraHoje).toBe(true)
    expect(tarefaPorId(e1, 't-porcino').reserva).toBeNull() // a segunda não foi escolhida
  })

  it('revisar altera a MESMA proposta em vez de recomeçar', () => {
    const r = responder('organizar meu dia', inicial(), null)
    const revisada = revisar(r, 'deixe para mais tarde')
    expect(revisada.resumo).toBe(r.resumo)
    expect(revisada.revisada).toBeTruthy()
    expect(revisada.mudancas.find((m) => m.acao.tipo === 'reservarHorario').acao.inicio).toBe('16:30')
  })

  it('a conversa vive no estado — sair e voltar não reinicia', () => {
    let e = inicial()
    e = reducer(e, { tipo: 'copilotoTurno', turno: { de: 'pessoa', texto: 'o que está atrasado?' } })
    e = reducer(e, { tipo: 'copilotoTurno', turno: { de: 'ia', texto: 'Há 1 com prazo vencido.' } })
    expect(e.copiloto.turnos).toHaveLength(2)
    // uma navegação qualquer não toca na conversa
    e = reducer(e, { tipo: 'mudarEstado', id: 't-porcino', estado: ESTADO.FAZENDO })
    expect(e.copiloto.turnos).toHaveLength(2)
  })

  it('o histórico do Copiloto NÃO vira memória sozinho', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'copilotoTurno', turno: { de: 'ia', texto: 'Uma resposta qualquer.' } })
    expect(e1.memoria).toHaveLength(e0.memoria.length)
    // guardar é ação explícita
    const e2 = reducer(e1, { tipo: 'guardarReferencia', texto: 'Uma resposta qualquer.', titulo: 'Resposta do Copiloto' })
    expect(e2.memoria).toHaveLength(e0.memoria.length + 1)
  })
})

// --- 19, 20 · revisão e relatórios -------------------------------------------
describe('Revisão e Relatórios respondem perguntas diferentes', () => {
  it('o conflito da quinta existe de verdade nos dados', () => {
    const e = inicial()
    const pares = conflitosDoDia(e, QUI)
    expect(pares).toHaveLength(1)
    expect(pares[0].map((x) => x.id).sort()).toEqual(['c-auditoria', 'c-diretoria'])
    expect(conflitosDaSemana(e, [SEG, TER, QUA, QUI])).toHaveLength(1)
  })

  it('a Revisão tem situações acionáveis de verdade no cenário', () => {
    const e = inicial()
    expect(e.tarefas.some((t) => (t.reagendamentos || 0) >= 3)).toBe(true)
    expect(e.tarefas.some((t) => t.bloqueio)).toBe(true)
    expect(porOrganizar(e).some((m) => m.criadoEm < iso(somarDias(HOJE, -7)))).toBe(true)
  })

  it('o relatório sempre declara o período que analisou', () => {
    const e = inicial()
    const dias = [SEG, TER, QUA, QUI, dia(4), dia(5), dia(6)]
    const r = relatorio(e, dias)
    expect(r.periodo).toEqual({ de: SEG, ate: dia(6) })
  })

  it('a taxa tem denominador e ele é o conjunto considerado', () => {
    const e = inicial()
    const r = relatorio(e, [SEG, TER, QUA, QUI, dia(4), dia(5), dia(6)])
    expect(r.consideradas.length).toBeGreaterThan(0)
    expect(r.taxa).toBe(Math.round((r.concluidas.length / r.consideradas.length) * 100))
    // atividade sem data nenhuma fica FORA do denominador
    expect(r.consideradas.some((t) => t.id === 't-treinamento')).toBe(false)
  })

  it('dá para abrir os registros que compõem cada número', () => {
    const r = relatorio(inicial(), [SEG, TER, QUA, QUI, dia(4), dia(5), dia(6)])
    expect(Array.isArray(r.concluidas)).toBe(true)
    expect(Array.isArray(r.abertas)).toBe(true)
    expect(r.concluidas.every((t) => t.id)).toBe(true)
  })

  it('os números vêm dos mesmos registros das outras telas', () => {
    const e = inicial()
    const r = relatorio(e, [SEG, TER, QUA, QUI, dia(4), dia(5), dia(6)])
    for (const t of r.concluidas) expect(tarefaPorId(e, t.id)).toBeTruthy()
    expect(r.delegadas).toEqual(delegadasPorMim(e))
  })
})

// --- 28 · tema ---------------------------------------------------------------
describe('Tema', () => {
  it('parte em "sistema" e aceita as três escolhas', () => {
    let e = inicial()
    expect(e.tema).toBe('sistema')
    for (const t of ['claro', 'escuro', 'sistema']) {
      e = reducer(e, { tipo: 'definirTema', tema: t })
      expect(e.tema).toBe(t)
    }
  })
})

// --- 31 · continuidade -------------------------------------------------------
describe('Continuidade depois da interrupção', () => {
  it('o rascunho da captura sobrevive a fechar, sem criar nada', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'guardarRascunho', rascunho: { texto: 'meio pensamento' } })
    expect(e1.rascunho.texto).toBe('meio pensamento')
    expect(e1.memoria).toHaveLength(e0.memoria.length)
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
  })

  it('retirar o horário reservado não conclui, não exclui e não tira o dia', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'retirarReserva', id: 't-repasse' })
    const t = tarefaPorId(e1, 't-repasse')
    expect(t.reserva).toBeNull()
    expect(t.estado).toBe(tarefaPorId(e0, 't-repasse').estado)
    expect(t.planejadaPara).toBe(SEG)
  })

  it('trocar de responsável não cria cópia nem perde o progresso', () => {
    const e0 = inicial()
    const antes = tarefaPorId(e0, 't-docs')
    const e1 = reducer(e0, { tipo: 'delegar', id: 't-docs', paraId: 'p-carla' })
    const depois = tarefaPorId(e1, 't-docs')
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
    expect(depois.estado).toBe(antes.estado)
    expect(depois.atividade.length).toBe(antes.atividade.length + 1)
  })

  it('arquivar um conteúdo não o transforma em tarefa', () => {
    const e0 = inicial()
    const e1 = reducer(e0, { tipo: 'arquivarMemoria', id: 'm-cap-1' })
    expect(e1.tarefas).toHaveLength(e0.tarefas.length)
  })
})
