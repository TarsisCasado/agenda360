import { ALERT_TYPES } from './constants'

// ---------------------------------------------------------------------------
// A REGRA DO ALERTA — uma so, para todas as portas de entrada.
//
// A auditoria do CP5.8 encontrou duas falhas silenciosas no caminho
// "alerta real -> notificacao real":
//
//   1. O canal padrao era `in_app`. Como o push-delivery-worker so entrega
//      `channel='push'`, uma atividade criada normalmente NUNCA viraria
//      notificacao — e as linhas `in_app` ficavam em notifications sem
//      nenhum consumidor no produto (zero consultas a essa tabela no
//      frontend). Padrao agora e PUSH. `in_app` continua existindo no dominio
//      (o schema e o motor sao multicanal), mas nao e mais o que o usuario
//      recebe por omissao;
//
//   2. Um alerta sem HORARIO nao gera lembrete nenhum. `computeRemindAt`
//      devolve null sem `start_time` — medido, nao suposto — entao marcar
//      "Avisar" numa tarefa sem hora ligava um interruptor que nao acendia
//      nada. Silenciosamente.
//
// A correcao NAO e inventar 08:00. E PERGUNTAR. Um alerta e uma promessa de
// interromper a pessoa num instante; sem instante, nao ha promessa que se
// possa cumprir. E inventar um horario seria pior que nao avisar: a
// notificacao chegaria numa hora que ninguem escolheu.
//
// IMPORTANTE — exigir horario NAO transforma a tarefa em compromisso. Quem
// pediu o horario foi o ALERTA, nao a natureza da atividade. "Me lembra de
// pagar a conta amanha" continua sendo uma Tarefa que por acaso avisa as 9h.
// ---------------------------------------------------------------------------

// O canal que o usuario recebe quando liga "Avisar" sem escolher nada.
export const CANAL_PADRAO = ALERT_TYPES.PUSH

// A frase, no vocabulario do produto. Uma so, em todas as portas.
export const PEDIR_HORARIO = 'Para avisar você, preciso saber o horário.'

// Um alerta ligado precisa de hora de inicio. (A data tambem e necessaria,
// mas ela ja e exigida por quem tem hora — hora sem dia nao existe na agenda,
// regra que ja vivia em agent/slots.js e continua valendo.)
export function alertaPrecisaDeHorario(task = {}) {
  return Boolean(task.alert_enabled) && !task.start_time
}

// Validacao da REGRA, nao do formulario: devolve o motivo em vez de um
// booleano solto, para que cada porta escolha como dizer.
export function validarAlerta(task = {}) {
  if (!task.alert_enabled) return { ok: true }
  if (!task.start_time) return { ok: false, motivo: 'sem_horario', mensagem: PEDIR_HORARIO }
  if (!task.date) {
    return {
      ok: false,
      motivo: 'sem_data',
      mensagem: 'Para avisar você, preciso saber o dia.',
    }
  }
  return { ok: true }
}

// O alerta esta sendo LIGADO nesta operacao? Existe para nao punir o passado:
// uma atividade antiga que ja tem alert_enabled sem horario nao pode travar
// uma edicao de titulo. A regra vale no momento em que o alerta e ligado (ou
// em que a hora seria removida com o alerta ligado) — nunca retroativamente.
export function mudancaMexeNoAlerta(patch = {}) {
  return 'alert_enabled' in patch || 'start_time' in patch
}
