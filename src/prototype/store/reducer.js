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
import { semearEstado, ESTADO, TIPO_MEMORIA, RESPONSABILIDADE, EU } from '../mock/dados'

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
  // A conversa do Copiloto vive no ESTADO, nao no componente: sair da tela e
  // voltar na mesma sessao nao pode reiniciar a conversa em silencio (UX1.2 §15).
  copiloto: { turnos: [], proposta: null, contexto: null },
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
        arquivada: false,
        criadoEm: estado.hoje,
        atualizadoEm: estado.hoje,
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
        arquivada: false,
        criadoEm: estado.hoje,
        atualizadoEm: estado.hoje,
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
        alerta: null,
        origemId: null,
        subtarefas: [],
        // Quem cria e o responsavel ate delegar — nao ha tarefa sem dono.
        criadorId: EU,
        delegadorId: null,
        responsavelId: EU,
        responsabilidade: null,
        acompanhando: true,
        atividade: [],
        ...acao.dados,
      }
      // Criar já apontando outra pessoa é delegar na criação: a tarefa nasce
      // com delegador, estado de responsabilidade e o evento no histórico — e
      // não como uma segunda tarefa de ninguém.
      const delegada = t.responsavelId && t.responsavelId !== EU
      const completa = delegada
        ? {
            ...t,
            delegadorId: EU,
            responsabilidade: RESPONSABILIDADE.AGUARDANDO,
            atividade: [...(t.atividade || []), evento(estado, EU, 'delegou', `para ${nomeDe(estado, t.responsavelId)}`)],
          }
        : t
      return {
        ...estado,
        tarefas: [completa, ...estado.tarefas],
        rascunho: null,
        aviso: {
          texto: delegada ? `Tarefa criada e delegada para ${nomeDe(estado, t.responsavelId)}` : 'Tarefa criada',
          verId: t.id,
          ver: 'tarefas',
        },
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
        tarefas: estado.tarefas.map((t) => {
          if (!ordens.has(t.id)) return t
          const mudou = t.id === acao.id && t.estado !== destino
          return {
            ...t,
            estado: t.id === acao.id ? destino : t.estado,
            ordem: ordens.get(t.id),
            concluidaEm: mudou && destino === ESTADO.FEITO ? estado.hoje : t.concluidaEm,
            atividade: mudou
              ? [...(t.atividade || []), evento(estado, EU,
                  destino === ESTADO.FEITO ? 'concluiu' : 'moveu',
                  destino === ESTADO.FEITO ? undefined : rotuloSimples(t.estado, destino))]
              : t.atividade,
          }
        }),
        aviso: acao.silencioso ? estado.aviso : { texto: rotuloDoDestino(destino) },
      }
    }

    // Mudanca de estado entra no HISTORICO e nao gera notificacao: e o evento
    // mais rotineiro que existe, e interromper alguem a cada coluna seria ruido.
    case 'mudarEstado':
      return mapTarefa(estado, acao.id, (t) => ({
        ...t,
        estado: acao.estado,
        concluidaEm: acao.estado === ESTADO.FEITO ? estado.hoje : null,
        atividade: [
          ...(t.atividade || []),
          evento(estado, acao.porId || EU,
            acao.estado === ESTADO.FEITO ? 'concluiu' : 'moveu',
            acao.estado === ESTADO.FEITO ? undefined : rotuloSimples(t.estado, acao.estado)),
        ],
      }), {
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


    // --- NOTAS: o bloco de notas de volta ----------------------------------
    // Uma nota DELIBERADA nao e uma captura: a pessoa escolheu escrever, entao
    // ela nasce organizada. "Por organizar" e o estado de quem jogou algo
    // dentro sem decidir o que era — nao um pedagio para todo mundo.
    // Nota vazia nao vira nada: abrir o editor e desistir nao cria lixo.
    case 'criarNota': {
      const texto = String(acao.texto || '').trim()
      const titulo = String(acao.titulo || '').trim()
      if (!texto && !titulo) return estado
      const item = {
        id: novoId('m'),
        tipo: acao.tipo || TIPO_MEMORIA.NOTA,
        titulo: titulo || primeiraLinha(texto),
        texto,
        porOrganizar: false,
        arquivada: false,
        criadoEm: estado.hoje,
        atualizadoEm: estado.hoje,
      }
      return {
        ...estado,
        memoria: [item, ...estado.memoria],
        aviso: { texto: 'Nota salva', verId: item.id, ver: 'memoria' },
      }
    }

    case 'editarNota': {
      const texto = acao.patch?.texto
      return {
        ...estado,
        memoria: estado.memoria.map((m) =>
          m.id === acao.id
            ? {
                ...m,
                ...acao.patch,
                titulo: acao.patch?.titulo?.trim() || (texto != null ? primeiraLinha(texto) : m.titulo),
                atualizadoEm: estado.hoje,
              }
            : m,
        ),
      }
    }

    // Arquivar NAO transforma em tarefa, nao apaga e nao classifica: tira da
    // lista de trabalho e mantem buscavel.
    case 'arquivarMemoria':
      return {
        ...estado,
        memoria: estado.memoria.map((m) =>
          m.id === acao.id ? { ...m, arquivada: acao.valor !== false, porOrganizar: false } : m,
        ),
        aviso: { texto: acao.valor === false ? 'Desarquivado' : 'Arquivado' },
      }

    case 'excluirMemoria':
      return {
        ...estado,
        memoria: estado.memoria.filter((m) => m.id !== acao.id),
        aviso: { texto: 'Excluído da memória' },
      }

    // --- DELEGACAO ---------------------------------------------------------
    // A MESMA tarefa muda de responsavel. Nao ha copia, nao ha tarefa espelho:
    // delegar e escrever um nome noutro campo do mesmo objeto, e e por isso que
    // o delegador continua vendo o andamento real.
    //
    // RESPONSABILIDADE e EXECUCAO sao eixos separados: aceitar nao move de
    // coluna, mover de coluna nao aceita nada.
    case 'delegar': {
      const alvo = estado.tarefas.find((t) => t.id === acao.id)
      if (!alvo || !acao.paraId || acao.paraId === alvo.responsavelId) return estado
      const nome = nomeDe(estado, acao.paraId)
      const proximo = mapTarefa(estado, acao.id, (t) => ({
        ...t,
        delegadorId: EU,
        responsavelId: acao.paraId,
        responsabilidade: RESPONSABILIDADE.AGUARDANDO,
        motivoDevolucao: null,
        atividade: [...(t.atividade || []), evento(estado, EU, 'delegou', `para ${nome}`)],
      }), { texto: `Delegada para ${nome}` })
      return proximo
    }

    case 'aceitarResponsabilidade': {
      const alvo = estado.tarefas.find((t) => t.id === acao.id)
      if (!alvo) return estado
      const quem = acao.porId || alvo.responsavelId
      const comAtividade = mapTarefa(estado, acao.id, (t) => ({
        ...t,
        responsabilidade: RESPONSABILIDADE.ACEITA,
        motivoDevolucao: null,
        atividade: [...(t.atividade || []), evento(estado, quem, 'aceitou')],
      }), { texto: 'Responsabilidade aceita' })
      // Aceite INTERROMPE: e a resposta que o delegador estava esperando.
      return quem === EU
        ? comAtividade
        : notificar(comAtividade, {
            origem: 'atividade',
            titulo: `${nomeDe(estado, quem)} aceitou a tarefa`,
            detalhe: alvo.titulo,
            alvo: { tipo: 'tarefa', id: alvo.id },
          })
    }

    // DEVOLVER EXIGE MOTIVO. Sem motivo o delegador recebe um problema sem
    // enunciado — e devolver vira um jeito silencioso de sumir com a tarefa.
    case 'devolverResponsabilidade': {
      const alvo = estado.tarefas.find((t) => t.id === acao.id)
      const motivo = String(acao.motivo || '').trim()
      if (!alvo || !motivo) return estado
      const quem = acao.porId || alvo.responsavelId
      const paraQuem = alvo.delegadorId || alvo.criadorId || EU
      const comAtividade = mapTarefa(estado, acao.id, (t) => ({
        ...t,
        responsabilidade: RESPONSABILIDADE.DEVOLVIDA,
        motivoDevolucao: motivo,
        responsavelId: paraQuem,
        atividade: [...(t.atividade || []), evento(estado, quem, 'devolveu', motivo)],
      }), { texto: 'Devolvida com motivo' })
      return paraQuem === EU
        ? notificar(comAtividade, {
            origem: 'atividade',
            titulo: `${nomeDe(estado, quem)} devolveu a tarefa`,
            detalhe: `${alvo.titulo} · ${motivo}`,
            alvo: { tipo: 'tarefa', id: alvo.id },
          })
        : comAtividade
    }

    // Retomar: a tarefa devolvida volta a ser minha, e para de ser delegacao.
    case 'retomarTarefa':
      return mapTarefa(estado, acao.id, (t) => ({
        ...t,
        responsavelId: EU,
        delegadorId: null,
        responsabilidade: null,
        motivoDevolucao: null,
        atividade: [...(t.atividade || []), evento(estado, EU, 'retomou')],
      }), { texto: 'Você assumiu a tarefa' })

    // BLOQUEIO e condicao, nao coluna: a tarefa continua em A fazer ou Em
    // andamento e ganha um impedimento declarado.
    case 'bloquearTarefa': {
      const motivo = String(acao.motivo || '').trim()
      const alvo = estado.tarefas.find((t) => t.id === acao.id)
      if (!alvo) return estado
      const quem = acao.porId || alvo.responsavelId
      const comAtividade = mapTarefa(estado, acao.id, (t) => ({
        ...t,
        bloqueio: motivo || null,
        atividade: [
          ...(t.atividade || []),
          evento(estado, quem, motivo ? 'bloqueou' : 'desbloqueou', motivo || undefined),
        ],
      }), { texto: motivo ? 'Bloqueio registrado' : 'Bloqueio removido' })
      return motivo && quem !== EU
        ? notificar(comAtividade, {
            origem: 'atividade',
            titulo: `${nomeDe(estado, quem)} bloqueou a tarefa`,
            detalhe: `${alvo.titulo} · ${motivo}`,
            alvo: { tipo: 'tarefa', id: alvo.id },
          })
        : comAtividade
    }

    case 'comentarTarefa': {
      const texto = String(acao.texto || '').trim()
      if (!texto) return estado
      return mapTarefa(estado, acao.id, (t) => ({
        ...t,
        atividade: [...(t.atividade || []), evento(estado, acao.porId || EU, 'comentou', texto)],
      }), { texto: 'Comentário registrado' })
    }

    // --- NOTIFICACOES -------------------------------------------------------
    // Acompanhar/silenciar: o historico continua completo de qualquer jeito.
    // O que muda e se o evento INTERROMPE.
    case 'alternarAcompanhar':
      return mapTarefa(estado, acao.id, (t) => ({ ...t, acompanhando: !t.acompanhando }), {
        texto: estado.tarefas.find((t) => t.id === acao.id)?.acompanhando
          ? 'Silenciada — continua no histórico'
          : 'Acompanhando',
      })

    case 'lerNotificacao':
      return {
        ...estado,
        notificacoes: estado.notificacoes.map((n) => (n.id === acao.id ? { ...n, lida: true } : n)),
      }

    case 'lerTodasNotificacoes':
      return { ...estado, notificacoes: estado.notificacoes.map((n) => ({ ...n, lida: true })) }

    // --- COPILOTO: a conversa e estado, nao componente ----------------------
    case 'copilotoTurno':
      return {
        ...estado,
        copiloto: {
          ...estado.copiloto,
          contexto: acao.contexto ?? estado.copiloto.contexto,
          turnos: [...estado.copiloto.turnos, acao.turno],
        },
      }

    case 'copilotoProposta':
      return { ...estado, copiloto: { ...estado.copiloto, proposta: acao.proposta || null } }

    case 'copilotoContexto':
      return { ...estado, copiloto: { ...estado.copiloto, contexto: acao.contexto || null } }

    // --- TEMA ---------------------------------------------------------------
    case 'definirTema':
      return { ...estado, tema: acao.tema || 'sistema' }

    case 'limparAviso':
      return { ...estado, aviso: null }

    default:
      return estado
  }
}


// Um evento de atividade. A hora vem do relogio da demonstracao para a cena
// continuar julgavel; num produto real seria o relogio de verdade.
let seqEvento = 0
function evento(estado, autorId, nome, detalhe) {
  return {
    id: `a-${++seqEvento}`,
    autorId,
    evento: nome,
    detalhe,
    quando: `${estado.hoje}T${estado.agoraDemo || '08:40'}`,
  }
}

const NOME_COLUNA = { a_fazer: 'A fazer', fazendo: 'Em andamento', feito: 'Concluído' }
const rotuloSimples = (de, para) => `${NOME_COLUNA[de] || de} → ${NOME_COLUNA[para] || para}`

export function nomeDe(estado, id) {
  const p = (estado.pessoas || []).find((x) => x.id === id)
  return p ? p.nome : 'alguém'
}

let seqNotificacao = 0
function notificar(estado, { origem, titulo, detalhe, alvo }) {
  const nova = {
    id: `n-nova-${++seqNotificacao}`,
    origem,
    titulo,
    detalhe,
    quando: `${estado.hoje}T${estado.agoraDemo || '08:40'}`,
    lida: false,
    alvo,
  }
  return { ...estado, notificacoes: [nova, ...estado.notificacoes] }
}

const primeiraLinha = (texto) => {
  const linha = String(texto || '').split('\n')[0].trim()
  return linha.length > 72 ? `${linha.slice(0, 72)}…` : linha || 'Nota sem título'
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
    // Tarefa que esta com outra pessoa NAO entra no meu dia automaticamente.
    // Ela volta a mim quando exige decisao — e isso e `decisoes()`, abaixo.
    .filter((t) => (t.responsavelId || EU) === EU)
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

export const porOrganizar = (estado) => estado.memoria.filter((m) => m.porOrganizar && !m.arquivada)

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

// ---------------------------------------------------------------------------
// DELEGACAO — tres perguntas, uma unica tarefa.
//
// "Minhas", "Delegadas por mim" e "Recebidas" sao RECORTES do mesmo conjunto.
// A mesma tarefa aparece para o delegador e para o responsavel; nao existe
// copia, e e por isso que o andamento que um ve e o andamento que o outro
// escreveu.
// ---------------------------------------------------------------------------
export const ehMinha = (t) => (t.responsavelId || EU) === EU
export const minhas = (estado) => estado.tarefas.filter(ehMinha)
export const delegadasPorMim = (estado) =>
  estado.tarefas.filter((t) => t.delegadorId === EU && t.responsavelId !== EU)
export const recebidas = (estado) =>
  estado.tarefas.filter((t) => t.responsavelId === EU && t.delegadorId && t.delegadorId !== EU)

// O que uma tarefa delegada precisa de MIM. Enquanto ela anda, nao precisa de
// nada — e por isso nao aparece em Hoje. Quando trava, aparece.
export function motivoDeDecisao(t, hoje) {
  if (t.estado === ESTADO.FEITO) return null
  if (t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA && (t.responsavelId || EU) === EU) {
    return 'Devolvida — precisa de decisão'
  }
  if (t.delegadorId === EU && t.responsavelId !== EU) {
    if (t.bloqueio) return `Bloqueada — ${t.bloqueio}`
    if (t.prazo && t.prazo <= hoje) return 'Prazo relevante — está com outra pessoa'
  }
  if (t.responsabilidade === RESPONSABILIDADE.AGUARDANDO && t.responsavelId === EU) {
    return 'Atribuída a você — aguardando aceite'
  }
  return null
}

export function decisoes(estado) {
  return estado.tarefas
    .map((t) => {
      const motivo = motivoDeDecisao(t, estado.hoje)
      return motivo ? { ...t, motivoDecisao: motivo } : null
    })
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// CONFLITOS — dois compromissos que se sobrepoem no mesmo dia.
//
// O Agenda so conhece o que esta nele. Por isso a linguagem e "ocupacao
// conhecida", nunca "voce esta livre": afirmar disponibilidade absoluta seria
// prometer o que este produto nao tem como saber.
// ---------------------------------------------------------------------------
export function conflitosDoDia(estado, data) {
  const eventos = agendaDoDia(estado, data)
  const pares = []
  for (let i = 0; i < eventos.length; i += 1) {
    for (let j = i + 1; j < eventos.length; j += 1) {
      if (eventos[j].inicio < eventos[i].fim) pares.push([eventos[i], eventos[j]])
    }
  }
  return pares
}

export function conflitosDaSemana(estado, dias) {
  return dias.flatMap((d) => conflitosDoDia(estado, d).map((par) => ({ data: d, par })))
}

// Ocupacao conhecida de um dia, em minutos — alimenta a leitura de "dia mais
// carregado" no mes.
export function ocupacaoDoDia(estado, data) {
  return agendaDoDia(estado, data).reduce((soma, e) => {
    const [hi, mi] = e.inicio.split(':').map(Number)
    const [hf, mf] = e.fim.split(':').map(Number)
    return soma + (hf * 60 + mf - (hi * 60 + mi))
  }, 0)
}

// ---------------------------------------------------------------------------
// RELATORIO — "o que aconteceu?".
//
// Duas honestidades obrigatorias: o PERIODO analisado aparece sempre, e a taxa
// diz de onde saiu. "80% de conclusao" sem denominador e um numero bonito que
// nao significa nada.
// ---------------------------------------------------------------------------
export function relatorio(estado, dias) {
  const dentro = (data) => data && data >= dias[0] && data <= dias[dias.length - 1]
  const concluidas = estado.tarefas.filter((t) => t.estado === ESTADO.FEITO && dentro(t.concluidaEm))
  const criadas = estado.tarefas.filter((t) => dentro(t.planejadaPara) || dentro(t.prazo) || dentro(t.concluidaEm))
  const abertas = criadas.filter((t) => t.estado !== ESTADO.FEITO)

  const porChave = (lista, chave) => {
    const mapa = new Map()
    for (const t of lista) {
      const k = chave(t) || '—'
      mapa.set(k, (mapa.get(k) || 0) + 1)
    }
    return [...mapa.entries()].sort((a, b) => b[1] - a[1])
  }

  return {
    periodo: { de: dias[0], ate: dias[dias.length - 1] },
    concluidas,
    abertas,
    consideradas: criadas,
    taxa: criadas.length ? Math.round((concluidas.length / criadas.length) * 100) : null,
    porContexto: porChave(criadas, (t) => t.contexto),
    porDia: dias.map((d) => ({
      data: d,
      concluidas: estado.tarefas.filter((t) => t.concluidaEm === d).length,
      compromissos: compromissosDoDia(estado, d).length,
    })),
    delegadas: delegadasPorMim(estado),
    concluidasPorOutros: concluidas.filter((t) => (t.responsavelId || EU) !== EU),
  }
}

export const naoLidas = (estado) => (estado.notificacoes || []).filter((n) => !n.lida)
export const notificacoesPor = (estado, origem) =>
  (estado.notificacoes || []).filter((n) => n.origem === origem)

// A memoria de trabalho exclui o arquivado — que continua existindo e sendo
// encontravel pela busca.
export const memoriaAtiva = (estado) => estado.memoria.filter((m) => !m.arquivada)
