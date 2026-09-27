import { isMeetingLike } from '../agent/slots'
import { toISODate } from './date'

// ---------------------------------------------------------------------------
// ATIVIDADE, TAREFA, COMPROMISSO — o vocabulario, num lugar so (CP5.9.1).
//
// AUDITORIA, antes de qualquer codigo: NAO existe coluna `type` nem `kind` em
// `tasks`, e este arquivo NAO cria uma. A distincao ja e formal no produto e ja
// e derivada de atributo:
//
//     start_time ausente  -> TAREFA       (algo a executar)
//     start_time presente -> COMPROMISSO  (algo que acontece numa hora)
//
// E a mesma regra que `lib/capture.js:tipoDaProposta` aplica a uma proposta do
// Copiloto desde o CP5.6, e a mesma que a Agenda do dia usa para decidir o que
// vira bloco na linha do tempo. Aqui ela e aplicada a uma atividade JA salva —
// mesma regra, outro momento.
//
// Inclusive a excecao do CP5.8.1: hora nao e, sozinha, compromisso. "Me lembra
// de pagar a conta amanha as 9h" tem horario e continua sendo tarefa, porque as
// 9h sao do AVISO e nao de um encontro. Quem desempata e `isMeetingLike`, a
// mesma heuristica do agente — sem campo novo, sem migration.
//
// O que muda no CP5.9.1 e so a INTERFACE: "atividade" continua sendo o termo
// guarda-chuva, mas onde a pessoa escolhe o que criar, ela escolhe entre tarefa
// e compromisso — e a escolha nao inventa um tipo, apenas decide se o editor
// abre pedindo horario ou nao.
// ---------------------------------------------------------------------------

export const TAREFA = {
  id: 'tarefa',
  rotulo: 'Tarefa',
  titulo: 'Nova tarefa',
  descricao: 'Algo a fazer',
}

export const COMPROMISSO = {
  id: 'compromisso',
  rotulo: 'Compromisso',
  titulo: 'Novo compromisso',
  descricao: 'Acontece numa hora',
}

// Que especie e uma atividade JA salva. Mesma regra da proposta.
export function tipoDeAtividade(task = {}) {
  if (!task.start_time) return TAREFA
  if (task.alert_enabled && !isMeetingLike(task.title || '')) return TAREFA
  return COMPROMISSO
}

// Com o que o editor abre quando a pessoa escolhe direto o que quer criar.
//
// TAREFA: data opcional (pode nascer sem dia nenhum), horario nao obrigatorio.
// COMPROMISSO: precisa de um dia — hora sem dia nao existe na agenda, a mesma
// regra que agent/slots ja aplica. A data vem preenchida com o dia em foco (ou
// hoje); o horario NAO e inventado, porque inventar horario e exatamente o que
// o CP5.8.1 proibiu. Fica em branco, em foco, esperando a pessoa.
export function defaultsDeCriacao(tipo, { date } = {}) {
  if (tipo?.id === COMPROMISSO.id) {
    return { date: date || toISODate(new Date()), start_time: '' }
  }
  return { date: date || '', start_time: '' }
}
