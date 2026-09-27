import { STATUS } from './constants'
import { fromISODate, toISODate, byTime } from './date'
import { minutosAte } from './today'

// ---------------------------------------------------------------------------
// HOJE NO TELEFONE — a derivacao (UX1.6 / Mobile 2.0).
//
// Nenhuma interface aqui. So a regra, isolada para ser testada antes de virar
// pixel — mesma disciplina de `lib/today.js`, que continua sendo a fonte dos
// baldes e da deduplicacao. Este arquivo NAO recalcula nada daquilo: ele
// REARRUMA o que `buildToday` ja decidiu, para a composicao do telefone.
//
// -------------------- POR QUE UMA COMPOSICAO PROPRIA -----------------------
//
// No desktop, Hoje abre com quatro numeros clicaveis e quatro blocos. Num
// monitor isso cabe e responde de relance. Num iPhone de 390px os mesmos
// quatro numeros custam a primeira dobra inteira antes de qualquer conteudo —
// e o QA humano leu a tela como "a versao pequena do sistema", que e
// exatamente o diagnostico.
//
// Entao o telefone passa a responder a pergunta em TRES TEMPOS, e nessa ordem:
//
//   AGORA            uma coisa so: o que esta acontecendo ou vem a seguir;
//   HOJE             o dia inteiro como uma agenda pessoal, em linha unica;
//   PRECISA DE VOCE  as EXCECOES, no maximo duas, com o resto atras de um toque.
//
// O que sobra (sem data, o total) desce para o fim, porque responde "quanto
// existe", e nao "o que merece minha atencao agora".
// ---------------------------------------------------------------------------

// Quantas excecoes aparecem antes de virar "Ver mais N". Duas, nao cinco: uma
// lista de excecoes com o tamanho de um feed deixa de ser excecao.
export const AMOSTRA_ATENCAO = 2

// Quantas vezes uma atividade precisa ter mudado de dia para isso virar um
// sinal. Uma remarcacao e vida normal; tres e um padrao pedindo decisao.
export const REMARCACOES_PARA_SINAL = 3

// ---------------------------------------------------------------------------
// A LINHA DO DIA. Compromissos e tarefas do dia numa lista so, na ordem em que
// acontecem — e nao em dois blocos com titulo, que no telefone viram duas
// telas. A DISTINCAO continua existindo, mas passa a ser visual (hora presente
// ou ausente), nao estrutural.
//
// A regra de dominio nao se move: tarefa sem hora NAO ganha horario inventado.
// Ela entra depois de tudo o que tem hora, na ordem em que ja estava.
// ---------------------------------------------------------------------------
export function linhaDoDia(t, { excluirProximo = true } = {}) {
  // O item em destaque em AGORA NAO se repete na linha do dia. E a mesma regra
  // que `buildToday` ja aplica no desktop com `hojeSemProximo`: o destaque e
  // uma LENTE sobre o dia, nao um item a mais. Visto no QA visual — a reuniao
  // aparecia no topo em corpo 34 e de novo como primeira linha, quatro
  // centimetros abaixo.
  const fora = excluirProximo && t?.proximo ? t.proximo.id : null
  const comHora = [...(t.compromissos || [])].filter((x) => x.id !== fora).sort(byTime)
  const idsComHora = new Set(comHora.map((x) => x.id))
  const semHora = (t.baldes?.hoje || []).filter((x) => !idsComHora.has(x.id) && x.id !== fora)
  const linha = (task, hora) => ({ task, hora, sinal: sinalDeRemarcacao(task) })
  return [
    ...comHora.map((task) => linha(task, String(task.start_time).slice(0, 5))),
    ...semHora.map((task) => linha(task, null)),
  ]
}

// O sinal de remarcacao viaja COM a linha do dia, em vez de virar um segundo
// item numa lista separada. Ver a nota de deduplicacao em `precisaDeVoce`.
export function sinalDeRemarcacao(task) {
  const n = task?.reschedule_count || 0
  return n >= REMARCACOES_PARA_SINAL ? `${n}×` : null
}

// ---------------------------------------------------------------------------
// PRECISA DE VOCE — o que e EXCECAO DE VERDADE.
//
// Tres sinais, e so tres, porque sao os tres que o modelo atual sustenta:
//
//   atraso       a data passou e a atividade continua aberta;
//   remarcada    mudou de dia varias vezes (reschedule_count, que ja existe);
//   delegada     esta com outra pessoa e ainda nao voltou.
//
// O QUE NAO ESTA AQUI, E POR QUE: "devolvida", "bloqueada" e "aguardando
// aceite" nao existem no produto. Delegacao hoje e um unico status, sem
// cadeia e sem retorno registrado. Inventar esses rotulos na interface seria
// afirmar um estado que o banco nao guarda — a pessoa confiaria numa distincao
// que ninguem pode manter.
//
// E CAPTURA NAO ENTRA. "Por organizar" e o oposto de urgencia: e algo que
// FOI guardado justamente para nao precisar decidir agora. Coloca-lo entre as
// excecoes transformaria a Memoria numa fila de pendencias, que e exatamente o
// que o UX1.3.1 proibiu.
// ---------------------------------------------------------------------------
export function precisaDeVoce(t, { today = toISODate(new Date()) } = {}) {
  const itens = []

  for (const task of t.baldes?.atrasada || []) {
    itens.push({
      id: `atraso-${task.id}`,
      task,
      tipo: 'atraso',
      peso: 1000 + diasDeAtraso(task, today),
      evidencia: textoDeAtraso(task, today),
    })
  }

  // ------------------------------------------------------------------------
  // DEDUPLICACAO — a mesma regra do resto do produto: UM ITEM, UM LUGAR.
  //
  // Uma tarefa de HOJE que ja mudou de dia varias vezes aparece na linha do
  // dia (porque e do dia) e satisfaria tambem o sinal de remarcacao. Mostra-la
  // duas vezes na mesma tela e exatamente o que `lib/today.js` proibiu: quem
  // le passa a nao saber se sao duas tarefas ou uma.
  //
  // Entao o sinal vai ATE ELA, em vez de cria-la de novo aqui: a linha do dia
  // carrega um "4×" discreto (ver `sinalDeRemarcacao`). "Precisa de voce" fica
  // com o que NAO esta na linha do dia — o que, alias, e a definicao de
  // excecao.
  // ------------------------------------------------------------------------
  for (const task of t.baldes?.sem_data || []) {
    const n = task.reschedule_count || 0
    if (n >= REMARCACOES_PARA_SINAL) {
      itens.push({
        id: `remarcada-${task.id}`,
        task,
        tipo: 'remarcada',
        peso: 500 + n,
        evidencia: `Mudou de dia ${n} vezes`,
      })
    }
  }

  // Varre TODOS os baldes, nao so "em andamento": `baldeDe` classifica uma
  // delegada SEM DATA como `sem_data` (delegado nao e o mesmo que iniciado, e
  // o balde de execucao e so para `in_progress`). Procurar num balde so
  // perderia justamente a delegada que nunca voltou — que e o caso que
  // interessa.
  const jaListado = new Set(itens.map((i) => i.task.id))
  const todos = [
    ...(t.baldes?.atrasada || []),
    ...(t.baldes?.em_andamento || []),
    ...(t.baldes?.hoje || []),
    ...(t.baldes?.sem_data || []),
  ]
  for (const task of todos) {
    if (jaListado.has(task.id)) continue
    if (task.status === STATUS.DELEGATED) {
      itens.push({
        id: `delegada-${task.id}`,
        task,
        tipo: 'delegada',
        peso: 100,
        evidencia: 'Delegada — ainda sem retorno',
      })
    }
  }

  return itens.sort((a, b) => b.peso - a.peso)
}

export function diasDeAtraso(task, today = toISODate(new Date())) {
  const d = fromISODate(task?.date)
  const h = fromISODate(today)
  if (!d || !h) return 0
  return Math.max(0, Math.round((h - d) / 86400000))
}

function textoDeAtraso(task, today) {
  const n = diasDeAtraso(task, today)
  if (!task?.date) return 'Prazo vencido'
  if (n <= 0) return 'Passou do horário'
  if (n === 1) return '1 dia de atraso'
  return `${n} dias de atraso`
}

// ---------------------------------------------------------------------------
// A SUGESTAO DO MOMENTO — a IA no Hoje, do tamanho de uma frase.
//
// O briefing pede assistencia PERTO do objeto relevante, nao um bloco de IA no
// topo da home. Entao ela so existe quando ha uma janela real entre agora e o
// proximo compromisso, e so quando ha algo concreto para colocar nela.
//
// ELA NAO GRAVA NADA. O botao leva ao Copiloto com o contexto; quem propoe e
// quem confirma continua sendo a conversa, com o contrato PERGUNTAR ->
// PROPOSTA -> CONFIRMAR intacto. Uma home que cria atividade sozinha seria
// escrita sem pedido, que e a unica coisa que este produto nunca faz.
//
// Sem janela, sem candidato ou com o compromisso perto demais: devolve null.
// Uma sugestao inventada para preencher espaco e pior que espaco vazio.
// ---------------------------------------------------------------------------
export const JANELA_MINIMA_MIN = 30
export const JANELA_MAXIMA_MIN = 180

export function sugestaoDoMomento(t, now = new Date()) {
  const prox = t?.proximo
  if (!prox?.start_time) return null
  const minutos = minutosAte(prox.start_time, now)
  if (minutos === null || minutos < JANELA_MINIMA_MIN || minutos > JANELA_MAXIMA_MIN) return null

  // O melhor candidato para a janela: primeiro o que esta atrasado (resolver
  // atraso vale mais que adiantar trabalho novo), depois o que nao tem data.
  const candidato = (t.baldes?.atrasada || [])[0] || (t.baldes?.sem_data || [])[0]
  if (!candidato) return null

  return {
    minutos,
    task: candidato,
    texto: `Você tem ${minutos} min antes de “${candidato.title}” poder sair da frente.`,
    frase: `Você tem ${minutos} min livres antes do próximo compromisso.`,
    pergunta: `Reservar esse tempo para “${candidato.title}”?`,
  }
}
