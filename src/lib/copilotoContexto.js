// ---------------------------------------------------------------------------
// COPILOTO CONTEXTUAL — de onde ele foi chamado, e o minimo que isso significa.
//
// Este arquivo NAO e um segundo Copiloto. Ele responde a uma pergunta so: a
// pessoa clicou na faisca DENTRO de uma tela — o que o Copiloto precisa saber
// para nao comecar do zero? A conversa, a interpretacao, a proposta e a
// confirmacao continuam sendo as mesmas de `src/agent` (`/assistente`), sem
// nenhum caminho paralelo.
//
// -------------------- O CONTRATO DO QUE VIAJA ------------------------------
//
// So viaja o MINIMO: a superficie, e no maximo um recorte do que estava na
// tela (o periodo visivel da Agenda, o filtro das Tarefas, o item selecionado
// da Memoria). Nunca a lista inteira, nunca o banco. O grounding de tarefas ja
// e montado pelo contextEngine, com janela propria — duplicar isso aqui so
// aumentaria o que sai do dispositivo sem responder melhor.
//
// Do item de Memoria viaja titulo e um trecho curto do conteudo. O conteudo
// inteiro de uma nota longa nao cabe num prompt e nao e necessario para a
// primeira pergunta; quando a conversa precisar de mais, a pessoa cola ou
// pergunta.
//
// -------------------- O QUE ELE NAO FAZ ------------------------------------
//
// Abrir o Copiloto por aqui NAO envia turno nenhum. A tela abre com uma
// saudacao que ja sabe de onde veio e com o campo pronto — quem fala primeiro
// e a pessoa. Isso nao e detalhe de UX: turno enviado sozinho e escrita
// disparada sem pedido, e o contrato PERGUNTAR -> PROPOSTA -> CONFIRMAR existe
// exatamente para isso nao acontecer.
// ---------------------------------------------------------------------------

export const SUPERFICIE = {
  HOJE: 'hoje',
  AGENDA: 'agenda',
  TAREFAS: 'tarefas',
  MEMORIA: 'memoria',
}

const TRECHO_MAX = 400

// O convite que aparece em cada tela. Uma frase, no idioma de quem usa —
// nunca "Assistente de IA".
export const CONVITE = {
  [SUPERFICIE.HOJE]: 'Organizar meu dia',
  [SUPERFICIE.AGENDA]: 'Planejar esta semana',
  [SUPERFICIE.TAREFAS]: 'O que devo priorizar?',
  [SUPERFICIE.MEMORIA]: 'Me ajude a organizar isto',
}

export function trecho(texto, max = TRECHO_MAX) {
  const s = String(texto || '').trim().replace(/\s+/g, ' ')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// ---------------------------------------------------------------------------
// O contexto que vai junto. Campos ausentes sao OMITIDOS, nao enviados nulos:
// um `periodo: null` diria ao modelo que existe um periodo e que ele e vazio.
// ---------------------------------------------------------------------------
export function contextoDaSuperficie(superficie, extra = {}) {
  const ctx = { superficie }
  if (superficie === SUPERFICIE.AGENDA && extra.periodo) ctx.periodo = extra.periodo
  if (superficie === SUPERFICIE.TAREFAS && extra.filtro) ctx.filtro = extra.filtro
  if (superficie === SUPERFICIE.MEMORIA) {
    if (extra.filtro) ctx.filtro = extra.filtro
    if (extra.item) {
      ctx.item = {
        titulo: extra.item.titulo || '',
        formato: extra.item.formato,
        trecho: trecho(extra.item.conteudo),
      }
    }
  }
  return ctx
}

// ---------------------------------------------------------------------------
// A primeira fala. Chamado de dentro de uma tela, o Copiloto abrir vazio seria
// fingir que nao sabe de onde veio.
// ---------------------------------------------------------------------------
export function saudacaoContextual(contexto, { nome = '' } = {}) {
  // Sem nome, NENHUM cumprimento: a tela ja abre com "Olá, <nome>" em cima.
  // "Olá, Tarsis" seguido de "Oi! Posso te ajudar..." sao dois bom-dias em
  // duas linhas — visto no QA visual do telefone.
  const ola = nome ? `Oi, ${nome}! ` : ''
  switch (contexto?.superficie) {
    case SUPERFICIE.HOJE:
      return `${ola}Posso te ajudar a organizar o seu dia. O que você quer resolver primeiro?`
    case SUPERFICIE.AGENDA:
      return contexto.periodo
        ? `${ola}Vamos planejar ${contexto.periodo}? Me diga o que precisa entrar.`
        : `${ola}Vamos planejar essa semana? Me diga o que precisa entrar.`
    case SUPERFICIE.TAREFAS:
      return `${ola}Posso te ajudar a decidir o que vem primeiro. Quer que eu olhe alguma parte específica?`
    case SUPERFICIE.MEMORIA:
      return contexto.item
        ? `${ola}Estou vendo “${contexto.item.titulo}”. O que você quer fazer com isso?`
        : `${ola}Posso te ajudar a organizar o que você guardou. O que você quer fazer com isso?`
    default:
      return ''
  }
}

// Sugestoes de primeira frase. Sao TEXTO que a pessoa escolhe mandar — nunca
// acao, nunca envio automatico.
export function sugestoesContextuais(contexto) {
  switch (contexto?.superficie) {
    case SUPERFICIE.HOJE:
      return ['O que eu tenho hoje?', 'O que está atrasado?']
    case SUPERFICIE.AGENDA:
      return ['O que eu tenho nesta semana?', 'Quais dias estão mais cheios?']
    case SUPERFICIE.TAREFAS:
      return ['O que está atrasado?', 'Quais são as minhas tarefas de prioridade alta?']
    case SUPERFICIE.MEMORIA:
      return contexto.item
        ? [`Crie uma tarefa a partir de “${trecho(contexto.item.titulo, 60)}”`, 'Resuma isto para mim']
        : ['O que eu ainda não organizei?']
    default:
      return []
  }
}
