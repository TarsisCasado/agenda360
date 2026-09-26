import { paraHoje, atrasadas, decisoes, agendaDoDia, planejadasDoDia } from './reducer'
import { RESPONSABILIDADE, emMinutos } from '../mock/dados'

// ---------------------------------------------------------------------------
// AS REGRAS DO PILOTO (UX-M1) — fora da interface, para poderem ser testadas.
//
// O piloto do Hoje no telefone mostra POUCO de proposito, e "pouco" so e
// defensavel se a escolha do que aparece tiver razao. Estas funcoes sao essa
// razao, escritas onde da para verificar.
//
// Elas NAO derivam dado novo: leem os mesmos seletores que o resto do
// prototipo ja usava. O que fazem e ORDENAR e CORTAR.
// ---------------------------------------------------------------------------

export const QUANTAS_TAREFAS = 3

// Janela minima para o Copiloto abrir a boca. Abaixo disso a sugestao e ruido:
// ninguem "reserva" dez minutos antes de uma reuniao.
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
// PARA VOCE FAZER — selecao, nunca inventario.
//
// A ordem tem motivo, e o motivo e a pergunta da tela ("o que merece atencao
// AGORA?"), nao a ordem alfabetica nem a de criacao:
//
//   0  prazo vencido        e excecao, e excecao vem primeiro;
//   1  com horario hoje     ja tem hora marcada comigo mesmo;
//   2  prioridade alta      eu disse que importava;
//   3  o resto.
//
// O corte em tres e de APRESENTACAO. A lista inteira continua a um toque em
// "Ver todas" — e `sobram` existe para a tela poder dizer quantas ficaram, em
// vez de esconder o corte.
// ---------------------------------------------------------------------------
export function filaDeHoje(estado) {
  const vencidas = atrasadas(estado)
  const idsVencidas = new Set(vencidas.map((t) => t.id))
  const escolhidas = paraHoje(estado).filter((t) => !idsVencidas.has(t.id))

  const peso = (t) => {
    if (idsVencidas.has(t.id)) return 0
    if (t.reserva?.data === estado.hoje) return 1
    if (t.prioridade === 'alta') return 2
    return 3
  }

  const todas = [...vencidas, ...escolhidas].sort((a, b) => peso(a) - peso(b))
  return {
    todas,
    visiveis: todas.slice(0, QUANTAS_TAREFAS),
    sobram: Math.max(0, todas.length - QUANTAS_TAREFAS),
    ehVencida: (t) => idsVencidas.has(t.id),
  }
}

// ---------------------------------------------------------------------------
// PRECISA DE VOCE — UMA situacao no primeiro viewport.
//
// Devolvida vem primeiro porque e a unica que esta parada esperando uma
// resposta minha: bloqueada e prazo tambem pedem decisao, mas seguem com outra
// pessoa. O resto vira uma linha discreta.
// ---------------------------------------------------------------------------
export function decisaoPrincipal(estado) {
  const todas = decisoes(estado)
  const primeira = todas.find((t) => t.responsabilidade === RESPONSABILIDADE.DEVOLVIDA) || todas[0] || null
  return { primeira, outras: todas.filter((t) => t.id !== primeira?.id), total: todas.length }
}

// ---------------------------------------------------------------------------
// A SUGESTAO. So existe com janela real E candidato real.
//
// O candidato NAO pode ja ter horario reservado hoje: oferecer "reservar
// tempo" para algo que ja esta reservado as 14:15 e a assistencia falando sem
// olhar — e uma vez que ela erra assim, ninguem confia na proxima.
//
// Sem janela ou sem candidato devolve `null`, e a tela nao desenha nada. Frase
// inventada para ocupar a dobra e pior que dobra vazia.
// ---------------------------------------------------------------------------
export function sugestaoDaJanela(estado, { faltam, item }, fila) {
  if (!item || faltam === null || faltam < JANELA_MINIMA) return null
  const candidato = fila.visiveis.find((t) => t.reserva?.data !== estado.hoje)
  if (!candidato) return null
  return { candidato, minutos: faltam, ate: item.inicio }
}

// ---------------------------------------------------------------------------
// O RESTO DO DIA — o que fica ABAIXO da dobra. Tudo o que tem hora menos o
// destaque (ele ja esta em cima: um item, um lugar), mais o que foi escolhido
// sem hora e nao coube nas tres.
// ---------------------------------------------------------------------------
export function restoDoDia(estado, destaque, visiveis) {
  const ids = new Set(visiveis.map((t) => t.id))
  const comHora = agendaDoDia(estado, estado.hoje)
    .filter((e) => e.id !== destaque?.id)
    .map((e) => ({ ...e, ordem: e.inicio }))
  const semHora = planejadasDoDia(estado, estado.hoje)
    .filter((t) => !t.reserva && !ids.has(t.id))
    .map((t) => ({ id: `p-${t.id}`, tarefaId: t.id, titulo: t.titulo, especie: 'tarefa', ordem: '99:99' }))
  return [...comHora, ...semHora].sort((a, b) => a.ordem.localeCompare(b.ordem))
}
