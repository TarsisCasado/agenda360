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
