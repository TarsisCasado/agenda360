import { decisoes, agendaDoDia, atrasadas, paraHoje } from './reducer'
import { ESTADO, EU, RESPONSABILIDADE, emMinutos, rotuloDeData } from '../mock/dados'

// ---------------------------------------------------------------------------
// AS REGRAS DO HOJE NO TELEFONE (UX-M2) — fora da interface, para poderem ser
// testadas.
//
// A composicao mudou: a direcao visual aprovada tem TRES superficies — proximo
// compromisso, "Precisa de voce" e a sugestao contextual — e nao tem mais uma
// secao separada de tarefas do dia nem a linha do tempo abaixo da dobra.
//
// O que isso muda nas regras, em relacao ao piloto UX-M1:
//
//   . a lista principal da home deixou de ser "tres tarefas para fazer" e
//     passou a ser DECISOES: o que esta parado esperando por mim. Tarefa
//     comum do dia continua existindo — em Tarefas, que e onde ela mora;
//   . por isso `filaDeHoje` e `restoDoDia` sairam: eram as regras da
//     composicao anterior, e manter regra sem tela e guardar codigo morto;
//   . `destaqueDoMomento` sobreviveu inteira — a pergunta "o que vem agora?"
//     nao mudou, so o desenho da resposta;
//   . a sugestao continua so falando com janela real, mas agora ela nao
//     escolhe sozinha um alvo: ela ABRE uma escolha. A tela aprovada oferece
//     "Ver sugestoes", nao "Reservar para X" — e uma assistencia que pergunta
//     erra menos do que uma que decide.
//
// Elas continuam NAO derivando dado novo: leem os mesmos seletores do
// prototipo. O que fazem e ORDENAR e CORTAR.
// ---------------------------------------------------------------------------

// Quantas decisoes cabem na superficie antes de virar "Ver mais". Duas: a
// terceira ja obrigaria a rolar para ver a sugestao, e a sugestao perde o
// sentido se aparecer depois da janela que ela comenta.
export const QUANTAS_DECISOES = 2

// Quantos candidatos a sugestao oferece. Tres e o limite do que se escolhe sem
// comparar; acima disso vira lista, e lista e trabalho.
export const QUANTAS_SUGESTOES = 3

// Janela minima para o Copiloto abrir a boca. Abaixo disso a sugestao e ruido:
// ninguem "adianta uma tarefa" em dez minutos.
export const JANELA_MINIMA = 15

// ---------------------------------------------------------------------------
// O DESTAQUE — um so objeto. Acontecendo agora ganha do que vem depois.
// ---------------------------------------------------------------------------
export function destaqueDoMomento(estado, agora) {
  const agenda = agendaDoDia(estado, estado.hoje)
  const emCurso = agenda.find((e) => e.inicio <= agora && e.fim > agora)
  const proximo = agenda.find((e) => e.inicio > agora)
  const item = emCurso || proximo || null
  return {
    item,
    emCurso: Boolean(emCurso),
    faltam: item && !emCurso ? emMinutos(item.inicio) - emMinutos(agora) : null,
  }
}

// ---------------------------------------------------------------------------
// DESDE QUANDO ISSO ESPERA POR MIM.
//
// Uma decisao nasce de um EVENTO — alguem bloqueou, devolveu ou me atribuiu.
// O carimbo desse evento e a unica medida honesta de urgencia aqui: nao e o
// prazo (que pode estar longe) nem a prioridade (que e minha opiniao de
// antes), e sim ha quanto tempo a coisa esta parada esperando resposta.
// ---------------------------------------------------------------------------
const EVENTOS_DE_ESPERA = ['bloqueou', 'devolveu', 'atribuiu']

export function esperandoDesde(t) {
  const eventos = (t.atividade || []).filter((e) => EVENTOS_DE_ESPERA.includes(e.evento))
  return eventos.length ? eventos[eventos.length - 1].quando : ''
}

// ---------------------------------------------------------------------------
// PRECISA DE VOCE — o meu trabalho travado primeiro, depois o pedido dos
// outros. Dentro de cada grupo, quem espera ha mais tempo.
//
// A distincao nao e de tipo por tipo: e de QUEM ESTA PARADO. Uma tarefa
// devolvida ou bloqueada e trabalho MEU que nao anda — o dia depende dela.
// Uma tarefa que alguem me atribuiu e o pedido de outra pessoa: importa, mas
// nao trava nada meu enquanto eu nao aceitar. Por isso o grupo 0 vem antes do
// grupo 1, e nao por antiguidade pura.
//
// O corte e de APRESENTACAO: `sobram` existe para a tela poder dizer quantas
// ficaram, em vez de esconder o corte.
// ---------------------------------------------------------------------------
function grupoDaDecisao(t) {
  if (t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA || t.bloqueio) return 0
  if (t.responsabilidade === RESPONSABILIDADE.AGUARDANDO) return 1
  return 2
}

export function decisoesDoDia(estado) {
  const todas = [...decisoes(estado)].sort((a, b) => (
    grupoDaDecisao(a) - grupoDaDecisao(b)
    || String(esperandoDesde(a)).localeCompare(String(esperandoDesde(b)))
  ))
  return {
    todas,
    visiveis: todas.slice(0, QUANTAS_DECISOES),
    sobram: Math.max(0, todas.length - QUANTAS_DECISOES),
  }
}

// ---------------------------------------------------------------------------
// O ROTULO DE UMA DECISAO — duas partes, e nenhuma delas inventada.
//
//   ALERTA    o que aconteceu e quando: "Bloqueada ontem", "Devolvida hoje".
//             Esta em vermelho contido porque e o que pede a decisao;
//   CONTEXTO  a area da tarefa, do proprio dado.
//
// A referencia visual mostra "Atrasada ha 2 dias". O mock desta semana nao tem
// essas tarefas atrasadas — a escala esta BLOQUEADA desde ontem e as fotos
// foram DEVOLVIDAS hoje de manha. Mantemos a forma (alerta vermelho + ponto +
// contexto) e escrevemos o que o dado diz; inventar um atraso para a tela
// ficar igual a imagem seria mentir na demonstracao.
// ---------------------------------------------------------------------------
export function rotuloDeDecisao(t, hoje) {
  const quando = esperandoDesde(t)
  const dia = quando ? rotuloDeData(String(quando).split('T')[0], hoje) : null
  const com = (verbo) => (dia ? `${verbo} ${dia}` : verbo)

  let alerta = null
  if (t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA) alerta = com('Devolvida')
  else if (t.bloqueio) alerta = com('Bloqueada')
  else if (t.responsabilidade === RESPONSABILIDADE.AGUARDANDO && (t.responsavelId || EU) === EU) {
    alerta = com('Atribuída a você')
  } else if (t.prazo && t.prazo <= hoje) alerta = `Prazo ${rotuloDeData(t.prazo, hoje)}`

  return { alerta, contexto: t.contexto || null }
}

// ---------------------------------------------------------------------------
// SEM DATA — a terceira linha da superficie.
//
// Tarefa minha, viva, sem prazo, sem dia planejado e sem horario. Nao e uma
// pendencia atrasada: e uma que nunca entrou no calendario. Por isso a linha
// NAO tem circulo de concluir — o que falta nela e uma data, nao um empurrao.
//
// Decisoes ficam de fora para nao aparecerem duas vezes na mesma superficie.
// ---------------------------------------------------------------------------
export function semData(estado) {
  const emDecisao = new Set(decisoes(estado).map((t) => t.id))
  return estado.tarefas.filter(
    (t) => t.estado !== ESTADO.FEITO
      && (t.responsavelId || EU) === EU
      && !emDecisao.has(t.id)
      && !t.prazo
      && !t.planejadaPara
      && !t.paraHoje
      && !t.reserva,
  )
}

// ---------------------------------------------------------------------------
// A JANELA LIVRE.
//
// So existe antes de um compromisso que ainda nao comecou e com folga real.
// Durante o compromisso nao ha janela nenhuma — e o texto "voce tem N min
// livres antes da reuniao" seria falso.
// ---------------------------------------------------------------------------
export function janelaLivre(estado, agora) {
  const { item, emCurso, faltam } = destaqueDoMomento(estado, agora)
  if (!item || emCurso || faltam === null || faltam < JANELA_MINIMA) return null
  return { minutos: faltam, ate: item.inicio, de: agora, compromisso: item }
}

// ---------------------------------------------------------------------------
// O QUE CABE NA JANELA.
//
// Candidata e tarefa minha, viva e SEM horario reservado hoje — oferecer
// "adiantar" algo que ja tem hora marcada as 14:15 e a assistencia falando sem
// olhar, e uma vez que ela erra assim ninguem confia na proxima.
//
// Ordem: prazo vencido, depois o que ja foi escolhido para hoje, depois
// prioridade alta. A tela nao reserva nada sozinha — ela mostra estas e
// espera.
// ---------------------------------------------------------------------------
export function sugestoesDaJanela(estado) {
  const vencidas = atrasadas(estado)
  const idsVencidas = new Set(vencidas.map((t) => t.id))
  const doDia = paraHoje(estado).filter((t) => !idsVencidas.has(t.id))

  const peso = (t) => {
    if (idsVencidas.has(t.id)) return 0
    if (t.paraHoje || t.planejadaPara === estado.hoje) return 1
    if (t.prioridade === 'alta') return 2
    return 3
  }

  return [...vencidas, ...doDia]
    .filter((t) => (t.responsavelId || EU) === EU)
    .filter((t) => t.estado !== ESTADO.FEITO)
    .filter((t) => t.reserva?.data !== estado.hoje)
    .sort((a, b) => peso(a) - peso(b))
    .slice(0, QUANTAS_SUGESTOES)
}
