// ---------------------------------------------------------------------------
// O ESTADO DO PROTOTIPO — puro, em memoria, sem efeito nenhum.
//
// Duas regras de produto vivem aqui, e e por isso que elas sao testaveis sem
// abrir tela nenhuma:
//
// 1. NADA ACONTECE SEM CONFIRMACAO. Uma proposta e uma proposta; fechar a tela
//    nao cria nada. O reducer nao tem nenhuma acao que crie algo "de passagem".
//
// 2. PLANEJAR E RESERVAR SAO DECISOES DIFERENTES.
//      "fazer na terça"   -> planejadaPara = terça, SEM horario;
//      "reservar horário" -> reserva = { data, inicio, fim }.
//    Retirar o horario reservado NAO conclui, NAO exclui e NAO desplaneja a
//    tarefa. Sao tres coisas separadas porque na cabeca da pessoa sao tres
//    coisas separadas.
//
// Uma acao derivada NUNCA destroi a origem: criar tarefa a partir de uma nota
// guarda `origemId` e deixa a nota onde estava.
// ---------------------------------------------------------------------------
import { semearEstado, ESTADO, TIPO_MEMORIA } from '../mock/dados'

// ---------------------------------------------------------------------------
// ORDEM DENTRO DA COLUNA (UX1.1).
//
// O produto de hoje NAO tem coluna `position`: a ordem e derivada — atrasadas
// primeiro, depois data, depois prioridade, depois hora — e arrastar muda de
// COLUNA, nunca de posicao (ver src/lib/board.js).
//
// O UX1.1 pediu soltar ENTRE atividades e atualizar posicao. Isso e uma
// mudanca de politica, e ela esta aqui declarada em vez de acontecer no
// silencio: cada tarefa ganha `ordem`, semeada pela MESMA regra derivada de
// hoje, e o arrasto passa a escreve-la. Mostrar um ponto de insercao e depois
// reordenar por regra seria pior que nao mostrar: a tela prometeria um lugar
// que nao existe.
//
// Consequencia para a migracao real, que fica registrada: sustentar isto no
// produto exige uma coluna de posicao no banco.
// ---------------------------------------------------------------------------
const PESO_PRIORIDADE = { urgente: 0, alta: 1, media: 2, baixa: 3 }

export function compararDerivado(a, b, hoje) {
  const atrasoA = a.prazo && a.prazo < hoje ? 0 : 1
  const atrasoB = b.prazo && b.prazo < hoje ? 0 : 1
  if (atrasoA !== atrasoB) return atrasoA - atrasoB

  const dataA = a.planejadaPara || a.prazo || '9999-12-31'
  const dataB = b.planejadaPara || b.prazo || '9999-12-31'
  if (dataA !== dataB) return dataA < dataB ? -1 : 1

  const pA = PESO_PRIORIDADE[a.prioridade] ?? 2
  const pB = PESO_PRIORIDADE[b.prioridade] ?? 2
  if (pA !== pB) return pA - pB

  return (a.reserva?.inicio || '99:99').localeCompare(b.reserva?.inicio || '99:99')
}

// A ordem visivel: `ordem` manual quando existe; a regra derivada como criterio
// de desempate e para quem nunca foi arrastado.
export function ordenarColuna(tarefas, hoje) {
  return [...tarefas].sort((a, b) => {
    if (a.ordem != null && b.ordem != null && a.ordem !== b.ordem) return a.ordem - b.ordem
    return compararDerivado(a, b, hoje)
  })
}

export function colunaDe(estado, coluna) {
  return ordenarColuna(estado.tarefas.filter((t) => t.estado === coluna), estado.hoje)
}

let seq = 0
const novoId = (prefixo) => `${prefixo}-${++seq}`

export const estadoInicial = (hoje) => ({
  ...semearEstado(hoje),
  // Rascunho da captura: sobrevive a fechar o overlay DURANTE a sessao, para
  // que desistir nao seja o mesmo que perder o que se escreveu. Nao persiste
  // depois do reload, e isso e proposital num prototipo.
  rascunho: null,
  aviso: null, // feedback discreto ("Guardado · Por organizar")
})

export function reducer(estado, acao) {
  switch (acao.tipo) {
    // --- captura -----------------------------------------------------------
    // GUARDAR nao classifica, nao pergunta e nao depende de interpretacao.
    case 'guardar': {
      const texto = String(acao.texto || '').trim()
      if (!texto) return estado
      const ehLink = /^https?:\/\//i.test(texto)
      const item = {
        id: novoId('m'),
        tipo: ehLink ? TIPO_MEMORIA.LINK : TIPO_MEMORIA.NOTA,
        titulo: texto.length > 72 ? `${texto.slice(0, 72)}…` : texto,
        texto,
        url: ehLink ? texto : undefined,
        porOrganizar: true,
        criadoEm: estado.hoje,
      }
      return {
        ...estado,
        memoria: [item, ...estado.memoria],
        rascunho: null,
        aviso: { texto: 'Guardado · Por organizar', verId: item.id, ver: 'memoria' },
      }
    }

    case 'guardarReferencia': {
      const texto = String(acao.texto || '').trim()
      if (!texto) return estado
      const item = {
        id: novoId('m'),
        tipo: /^https?:\/\//i.test(texto) ? TIPO_MEMORIA.LINK : TIPO_MEMORIA.NOTA,
        titulo: acao.titulo || texto,
        texto,
        url: /^https?:\/\//i.test(texto) ? texto : undefined,
        porOrganizar: false,
        referencia: true,
        criadoEm: estado.hoje,
      }
      return {
        ...estado,
        memoria: [item, ...estado.memoria],
        rascunho: null,
        aviso: { texto: 'Guardado como referência', verId: item.id, ver: 'memoria' },
      }
    }

    case 'guardarRascunho':
      return { ...estado, rascunho: acao.rascunho || null }

    case 'descartarRascunho':
      return { ...estado, rascunho: null }

    // --- criacoes, sempre com confirmacao explicita ------------------------
    case 'criarCompromisso': {
      const c = { id: novoId('c'), ...acao.dados }
      return {
        ...estado,
        compromissos: [...estado.compromissos, c],
        rascunho: null,
        aviso: { texto: 'Compromisso criado', verId: c.id, verData: c.data, ver: 'agenda' },
      }
    }

    case 'criarTarefa': {
      const t = {
        id: novoId('t'),
        estado: ESTADO.A_FAZER,
        prazo: null,
        paraHoje: false,
        planejadaPara: null,
        reserva: null,
        prioridade: 'media',
        contexto: null,
        origemId: null,
        subtarefas: [],
        ...acao.dados,
      }
      return {
        ...estado,
        tarefas: [t, ...estado.tarefas],
        rascunho: null,
        aviso: { texto: 'Tarefa criada', verId: t.id, ver: 'tarefas' },
      }
    }

    // --- tarefas ------------------------------------------------------------
    // Edicao estruturada: um patch sobre a tarefa, sem tocar no que nao veio.
    case 'editarTarefa':
      return mapTarefa(estado, acao.id, (t) => ({ ...t, ...acao.patch }), { texto: 'Atualizada' })

    case 'excluirTarefa':
      return {
        ...estado,
        tarefas: estado.tarefas.filter((t) => t.id !== acao.id),
        aviso: { texto: 'Atividade excluída' },
      }

    case 'editarCompromisso':
      return {
        ...estado,
        compromissos: estado.compromissos.map((c) => (c.id === acao.id ? { ...c, ...acao.patch } : c)),
        aviso: { texto: 'Compromisso atualizado' },
      }

    case 'excluirCompromisso':
      return {
        ...estado,
        compromissos: estado.compromissos.filter((c) => c.id !== acao.id),
        aviso: { texto: 'Compromisso excluído' },
      }

    // MOVER — uma funcao so para o arrasto, o "Mover para..." e o teclado.
    // Nao existe uma segunda regra de movimentacao em lugar nenhum.
    case 'moverTarefa': {
      const tarefa = estado.tarefas.find((t) => t.id === acao.id)
      if (!tarefa) return estado

      const destino = acao.paraEstado || tarefa.estado
      // A coluna de destino SEM a tarefa movida, na ordem que esta na tela.
      const coluna = ordenarColuna(
        estado.tarefas.filter((t) => t.estado === destino && t.id !== acao.id),
        estado.hoje,
      )
      const alvo = acao.antesDe ? coluna.findIndex((t) => t.id === acao.antesDe) : -1
      const posicao = alvo >= 0 ? alvo : coluna.length
      coluna.splice(posicao, 0, { ...tarefa, estado: destino })

      // Reescreve a ordem inteira da coluna: posicao relativa so e estavel se
      // todos os vizinhos souberem onde estao.
      const ordens = new Map(coluna.map((t, i) => [t.id, i]))
      return {
        ...estado,
        tarefas: estado.tarefas.map((t) =>
          ordens.has(t.id)
            ? { ...t, estado: t.id === acao.id ? destino : t.estado, ordem: ordens.get(t.id) }
            : t,
        ),
        aviso: acao.silencioso ? estado.aviso : { texto: rotuloDoDestino(destino) },
      }
    }

    case 'mudarEstado':
      return mapTarefa(estado, acao.id, (t) => ({ ...t, estado: acao.estado }), {
        texto: acao.estado === ESTADO.FEITO ? 'Concluída' : 'Atualizada',
      })

    case 'escolherParaHoje':
      return mapTarefa(estado, acao.id, (t) => ({
        ...t,
        paraHoje: acao.valor !== false,
        planejadaPara: acao.valor !== false ? estado.hoje : t.planejadaPara,
      }))

    // "Fazer na terça": planeja o DIA. Nao cria, nao toca, nao inventa horario.
    case 'planejarPara':
      return mapTarefa(
        estado,
        acao.id,
        (t) => ({ ...t, planejadaPara: acao.data, paraHoje: acao.data === estado.hoje }),
        { texto: 'Planejada' },
      )

    case 'retirarPlanejamento':
      return mapTarefa(estado, acao.id, (t) => ({ ...t, planejadaPara: null, paraHoje: false }), {
        texto: 'Sem dia definido',
      })

    // "Reservar horário": decisao SEPARADA. Reservar tambem planeja o dia —
    // proteger um intervalo de terça implica fazer na terça —, mas o inverso
    // nunca vale.
    case 'reservarHorario':
      return mapTarefa(
        estado,
        acao.id,
        (t) => ({
          ...t,
          reserva: { data: acao.data, inicio: acao.inicio, fim: acao.fim },
          planejadaPara: acao.data,
          paraHoje: acao.data === estado.hoje,
        }),
        { texto: 'Horário reservado' },
      )

    // Retirar o horario NAO conclui, NAO exclui e NAO desplaneja.
    case 'retirarReserva':
      return mapTarefa(estado, acao.id, (t) => ({ ...t, reserva: null }), {
        texto: 'Horário reservado retirado',
      })

    case 'reagendar':
      return mapTarefa(estado, acao.id, (t) => ({
        ...t,
        planejadaPara: acao.data,
        paraHoje: acao.data === estado.hoje,
        prazo: t.prazo ? acao.data : null,
        reserva: null,
      }), { texto: 'Reagendada' })

    // IA contextual: aplica SOMENTE o que foi selecionado e confirmado.
    case 'adicionarSubtarefas': {
      const novas = (acao.titulos || []).map((titulo) => ({ id: novoId('s'), titulo, feito: false }))
      if (!novas.length) return estado
      return mapTarefa(estado, acao.id, (t) => ({ ...t, subtarefas: [...t.subtarefas, ...novas] }), {
        texto: `${novas.length} ${novas.length === 1 ? 'passo adicionado' : 'passos adicionados'}`,
      })
    }

    case 'alternarSubtarefa':
      return mapTarefa(estado, acao.id, (t) => ({
        ...t,
        subtarefas: t.subtarefas.map((s) => (s.id === acao.subId ? { ...s, feito: !s.feito } : s)),
      }))

    // --- memoria ------------------------------------------------------------
    case 'organizarMemoria':
      return {
        ...estado,
        memoria: estado.memoria.map((m) =>
          m.id === acao.id ? { ...m, porOrganizar: false, tipo: acao.tipoNovo || m.tipo } : m,
        ),
        aviso: { texto: 'Organizado' },
      }

    // --- copiloto ampliado: so aplica o plano inteiro apos confirmacao ------
    case 'aplicarPlano': {
      let proximo = estado
      for (const m of acao.mudancas || []) {
        proximo = reducer(proximo, m)
      }
      return { ...proximo, aviso: { texto: 'Plano aplicado' } }
    }

    case 'limparAviso':
      return { ...estado, aviso: null }

    default:
      return estado
  }
}

const ROTULO_ESTADO = {
  [ESTADO.A_FAZER]: 'Movida para A fazer',
  [ESTADO.FAZENDO]: 'Movida para Em andamento',
  [ESTADO.FEITO]: 'Concluída',
}
const rotuloDoDestino = (estadoNovo) => ROTULO_ESTADO[estadoNovo] || 'Movida'

function mapTarefa(estado, id, fn, aviso = null) {
  return {
    ...estado,
    tarefas: estado.tarefas.map((t) => (t.id === id ? fn(t) : t)),
    ...(aviso ? { aviso } : {}),
  }
}

// ---------------------------------------------------------------------------
// SELETORES — a regra do que MERECE aparecer em Hoje mora aqui.
//
// Hoje e SELECAO, nao agrupamento: cada item carrega o motivo pelo qual esta
// ali, e "sem data" nunca e motivo. Uma tarefa sem dia nao aparece em Hoje.
// ---------------------------------------------------------------------------
export const MOTIVO = {
  HOJE: 'Escolhida para hoje',
  PRAZO: 'Prazo hoje',
  ATRASADA: 'Atrasada',
}

export function paraHoje(estado) {
  return estado.tarefas
    .filter((t) => t.estado !== ESTADO.FEITO)
    .map((t) => {
      if (t.paraHoje || t.planejadaPara === estado.hoje) return { ...t, motivo: MOTIVO.HOJE }
      if (t.prazo === estado.hoje) return { ...t, motivo: MOTIVO.PRAZO }
      return null
    })
    .filter(Boolean)
}

export function atrasadas(estado) {
  return estado.tarefas.filter(
    (t) => t.estado !== ESTADO.FEITO && t.prazo && t.prazo < estado.hoje,
  )
}

export const porOrganizar = (estado) => estado.memoria.filter((m) => m.porOrganizar)

export function compromissosDoDia(estado, data) {
  return estado.compromissos
    .filter((c) => c.data === data)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
}

// Compromissos + horarios reservados de um dia, na mesma linha do tempo.
export function agendaDoDia(estado, data) {
  const eventos = compromissosDoDia(estado, data).map((c) => ({ ...c, especie: 'compromisso' }))
  const reservas = estado.tarefas
    .filter((t) => t.reserva?.data === data)
    .map((t) => ({
      id: `r-${t.id}`,
      tarefaId: t.id,
      titulo: t.titulo,
      data,
      inicio: t.reserva.inicio,
      fim: t.reserva.fim,
      especie: 'reserva',
    }))
  return [...eventos, ...reservas].sort((a, b) => a.inicio.localeCompare(b.inicio))
}

// Tarefas planejadas para o dia que NAO tem horario reservado.
export function planejadasDoDia(estado, data) {
  return estado.tarefas.filter(
    (t) => t.planejadaPara === data && !t.reserva && t.estado !== ESTADO.FEITO,
  )
}

export function proximoCompromisso(estado, agora = '08:00') {
  return compromissosDoDia(estado, estado.hoje).find((c) => c.fim > agora) || null
}

export const tarefaPorId = (estado, id) => estado.tarefas.find((t) => t.id === id) || null
export const memoriaPorId = (estado, id) => estado.memoria.find((m) => m.id === id) || null

export function buscar(estado, termo) {
  const q = String(termo || '').trim().toLowerCase()
  if (!q) return { memoria: [], tarefas: [], compromissos: [] }
  const bate = (s) => String(s || '').toLowerCase().includes(q)
  return {
    memoria: estado.memoria.filter((m) => bate(m.titulo) || bate(m.texto)),
    tarefas: estado.tarefas.filter((t) => bate(t.titulo)),
    compromissos: estado.compromissos.filter((c) => bate(c.titulo)),
  }
}
