// ---------------------------------------------------------------------------
// CAMADA DETERMINISTICA — politica de SLOTS e continuidade de conversa.
//
// Fica DEPOIS do provider (local ou remoto) e antes do runtime. Responde a tres
// perguntas, sempre do mesmo jeito, venha a interpretacao de onde vier:
//
//   1) falta alguma informacao obrigatoria? (missingSlots)
//   2) qual a UNICA pergunta a fazer agora?  (slotQuestion)
//   3) esta mensagem curta responde a pergunta anterior? (mergeTurn)
//
// Por que aqui e nao no provider: a regra "nunca inventar data" e "nao perguntar
// o que ja esta claro" e do PRODUTO. Se amanha a interpretacao virar LLM, estas
// garantias continuam valendo sem reescrever nada.
// ---------------------------------------------------------------------------
import { resolveTemporalAnswer, DAYPARTS } from './nlu/temporal'
import { formatShort } from '../lib/date'

// Intents que sustentam uma intencao pendente entre turnos.
export const FILLABLE_INTENTS = new Set(['create_task', 'reschedule_task'])

// Titulo que sugere compromisso com hora (vale a pena perguntar o horario UMA
// vez). Tarefa comum ("pagar boleto") nao pede horario.
const MEETING_LIKE = /\b(reuni|call|encontro|consulta|entrevista|almoc|jantar|audi[eê]ncia|visita|apresenta|falar com|conversar com|ligar (pro|para|pra))/i

export function isMeetingLike(title = '') {
  return MEETING_LIKE.test(String(title))
}

// ---------------------------------------------------------------------------
// 1) Slots faltantes — ordem = ordem das perguntas.
// ---------------------------------------------------------------------------
export function missingSlots(intent, data = {}, { asked = [] } = {}) {
  const missing = []
  if (intent === 'create_task') {
    if (!data.title) missing.push('titulo')
    // A dispensa de data NAO vale para compromisso com hora marcada: hora sem
    // dia nao existe na agenda. A regra mora AQUI, num lugar so, para valer
    // venha o dado de onde vier — resposta de slot ou patch do rascunho vivo.
    const dateWaived = data.date_skipped && !data.start_time
    if (data.date_range && !data.date) missing.push('dia_da_semana')
    else if (!data.date && !dateWaived) missing.push('data')
    // A guarda `asked` e a mesma que `horario` ja tinha: uma pergunta
    // respondida nao volta. Sem ela, qualquer caminho que reacenda
    // `time_ambiguous` — por exemplo um provider que repita a ambiguidade no
    // turno seguinte — faria a pergunta se repetir para sempre, e um laco que
    // nao avisa que e um laco e o pior tipo de defeito de conversa.
    if (data.time_ambiguous && !asked.includes('periodo')) missing.push('periodo')
    else if (
      !data.start_time &&
      !data.daypart &&
      !data.date_skipped && // sem dia, nao faz sentido perguntar horario
      isMeetingLike(data.title) &&
      !asked.includes('horario')
    ) {
      missing.push('horario')
    }
    // ALERTA (CP5.8.1). Um aviso e uma promessa de interromper a pessoa num
    // instante: sem instante nao ha promessa. Por isso este slot e
    // OBRIGATORIO — nao entra em OPTIONAL_SLOTS e nao aceita "sem horario".
    // E ele NAO transforma a tarefa em compromisso: quem pediu a hora foi o
    // alerta, nao a natureza da atividade.
    if (data.alert_enabled && !data.start_time && !data.time_ambiguous) {
      missing.push('horario_alerta')
    }
  }
  if (intent === 'reschedule_task' && !data.date) missing.push('data')
  // Slots obrigatorios continuam sendo pedidos ate serem preenchidos; os
  // OPCIONAIS (horario) ja foram filtrados acima por `asked`.
  return missing
}

// Slots cuja resposta e OPCIONAL (o usuario pode dizer "sem horario").
export const OPTIONAL_SLOTS = new Set(['horario'])

// ---------------------------------------------------------------------------
// 2) Pergunta de um slot — curta, especifica, sem reiniciar a conversa.
// ---------------------------------------------------------------------------
export function slotQuestion(slot, data = {}) {
  const what = data.title ? `"${data.title}"` : 'isso'
  switch (slot) {
    case 'titulo':
      return 'O que você quer registrar?'
    case 'data':
      return `Para quando é ${what}? (hoje, amanhã, sexta, 12/09…)`
    case 'dia_da_semana':
      return `Que dia da semana que vem (${formatShort(data.date_range?.start)} a ${formatShort(data.date_range?.end)})?`
    case 'periodo': {
      const [h, m] = String(data.start_time || '09:00').split(':')
      const pm = String(Number(h) + 12).padStart(2, '0')
      return `${h}:${m} da manhã ou ${pm}:${m} da noite?`
    }
    case 'horario':
      return `Qual horário? (ou responda "sem horário")`
    case 'horario_alerta':
      // A frase e a MESMA dos formularios (lib/alertRules.PEDIR_HORARIO): uma
      // regra so, dita do mesmo jeito em todas as portas.
      return 'Para avisar você, preciso saber o horário. Que horas?'
    default:
      return 'Pode detalhar um pouco mais?'
  }
}

// ---------------------------------------------------------------------------
// 3) Continuidade — a mensagem nova completa a anterior ou abre outra?
// ---------------------------------------------------------------------------
const CONFIDENCE_THRESHOLD = 0.5

// Uma resposta curta ("8:30", "depois do almoço", "sexta", "sem horário").
export function isShortAnswer(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  return words.length > 0 && words.length <= 5
}

// Aplica a resposta do usuario ao slot que estava aberto.
// Retorna { data, asked, resolved } — `resolved:false` = a resposta nao serviu.
export function applyAnswer({ slot, data, text, context = {} }) {
  const next = { ...data }
  const answer = resolveTemporalAnswer(text, { today: context.today, now: context.now })

  if (slot === 'titulo') {
    const title = String(text || '').trim()
    if (title.length < 2) return { data: next, resolved: false }
    next.title = title.charAt(0).toUpperCase() + title.slice(1)
    return { data: next, resolved: true }
  }

  if (slot === 'data' || slot === 'dia_da_semana') {
    // Recusa deliberada de data ("sem data", "coloque em tarefas a fazer"):
    // e uma RESPOSTA valida, nao um erro de entendimento. A atividade nasce
    // sem data, na lista de tarefas a fazer — e a pergunta nao se repete.
    if (answer.noDate) {
      // Excecao: compromisso com hora marcada precisa de dia. Hora sem data
      // nao existe na agenda, entao aqui a resposta nao serve.
      if (next.start_time) {
        return { data: next, resolved: false, reason: 'needs_date_for_time' }
      }
      next.date = null
      next.date_skipped = true
      delete next.date_range
      return { data: next, resolved: true, skipped: true }
    }
    // "semana que vem" como resposta: vira intervalo e a proxima pergunta
    // passa a ser o DIA da semana (nunca escolhemos um dia por conta propria).
    if (!answer.date && answer.range) {
      next.date_range = answer.range
      return { data: next, resolved: true }
    }
    if (answer.date) {
      next.date = answer.date
      delete next.date_range
      if (answer.time) {
        next.start_time = answer.time
        next.time_ambiguous = Boolean(answer.timeAmbiguous)
      }
      if (answer.daypart) next.daypart = answer.daypart
      return { data: next, resolved: true }
    }
    return { data: next, resolved: false }
  }

  if (slot === 'periodo') {
    // Espera "manha"/"tarde"/"noite" ou um horario completo.
    const [h, m] = String(next.start_time || '09:00').split(':')
    if (answer.daypart) {
      const shift = DAYPARTS[answer.daypart]?.shift
      let hour = Number(h)
      if (shift === 'pm' && hour >= 1 && hour <= 11) hour += 12
      next.start_time = `${String(hour).padStart(2, '0')}:${m}`
      next.time_ambiguous = false
      return { data: next, resolved: true }
    }
    if (answer.time && !answer.timeAmbiguous) {
      next.start_time = answer.time
      next.time_ambiguous = false
      return { data: next, resolved: true }
    }
    return { data: next, resolved: false }
  }

  // O slot do alerta aceita horario (e so isso). "Sem horario" NAO resolve:
  // desligaria o aviso sem dizer, que e a falha silenciosa que este
  // checkpoint veio eliminar. A saida legitima e o usuario dizer que nao quer
  // mais o lembrete — e isso ja e uma ALTERACAO do rascunho (CP5.1), tratada
  // antes de chegar aqui.
  if (slot === 'horario_alerta') {
    if (answer.time) {
      next.start_time = answer.time
      next.time_ambiguous = Boolean(answer.timeAmbiguous)
      return { data: next, resolved: true }
    }
    return { data: next, resolved: false }
  }

  if (slot === 'horario') {
    if (answer.skip) return { data: next, resolved: true, skipped: true }
    if (answer.time) {
      next.start_time = answer.time
      next.time_ambiguous = Boolean(answer.timeAmbiguous)
      return { data: next, resolved: true }
    }
    if (answer.daypart) {
      // Periodo do dia NAO vira horario inventado: fica como informacao.
      next.daypart = answer.daypart
      return { data: next, resolved: true }
    }
    if (answer.date) {
      next.date = answer.date
      return { data: next, resolved: true }
    }
    return { data: next, resolved: false }
  }

  return { data: next, resolved: false }
}

// mergeTurn decide o que este turno significa diante da intencao pendente.
// Retorna { intent, data, asked, continued }.
export function mergeTurn({ pending, interp, text, context = {} }) {
  const fresh = {
    intent: interp.intent,
    data: { ...interp.data },
    asked: [],
    continued: false,
  }
  if (interp.ambiguities?.includes('horario')) fresh.data.time_ambiguous = true

  if (!pending || !FILLABLE_INTENTS.has(pending.intent)) return fresh

  const interpretedAsNew =
    interp.intent !== 'unknown' &&
    interp.confidence >= CONFIDENCE_THRESHOLD &&
    !interp.needs_clarification

  // Trocar de assunto continua sendo trocar de assunto: "o que tenho amanha?"
  // no meio de uma pergunta em aberto e uma consulta, nao a resposta dela. O
  // sinal que separa os dois casos e a INTENCAO — outra intencao, entendida com
  // seguranca, abandona a pendente (a regra do ramo de baixo, preservada).
  const mudouDeAssunto = interpretedAsNew && interp.intent !== pending.intent

  // ------------------------------------------------------------------
  // O SLOT ABERTO VEM ANTES DA CONFIANCA DO PROVIDER (CP6.5.1).
  //
  // O QA real: "reuniao amanha as 08 com os gerentes" -> "08:00 da manha ou
  // 20:00 da noite?" -> "manha" -> a MESMA pergunta de novo.
  //
  // O ramo de baixo presumia que um fragmento chega como `unknown` — verdade
  // do NLU local, que devolve "manha" com confianca 0.2. O provider REMOTO
  // recebe o rascunho junto, entao entende o fragmento e responde com intencao
  // confiante; com isso `applyAnswer` nunca rodava, `time_ambiguous` seguia
  // herdado do pendente e a pergunta voltava. A reproducao mostrou o pior caso:
  // mesmo o modelo respondendo CERTO (start_time 08:00, sem ambiguidade) a
  // pergunta se repetia — logo o defeito era nosso, nao dele.
  //
  // A regra que faltava: havendo pergunta em aberto, uma resposta CURTA e
  // primeiro uma resposta. So se ela nao servir o turno volta a ser avaliado
  // como frase nova. Duas coisas nao passam por aqui: frase longa ("na verdade
  // muda o titulo para...") e mudanca clara de assunto — quem pergunta "o que
  // tenho amanha?" com um slot aberto esta consultando, nao respondendo.
  //
  // Nada novo nasce aqui: `isShortAnswer` e `applyAnswer` ja existiam, e a
  // resolucao temporal continua sendo a de sempre.
  // ------------------------------------------------------------------
  if (!mudouDeAssunto && pending.awaiting && isShortAnswer(text)) {
    const resposta = applyAnswer({ slot: pending.awaiting, data: pending.data, text, context })
    if (resposta.resolved) {
      return {
        intent: pending.intent,
        data: resposta.data,
        asked: [...(pending.asked || []), pending.awaiting],
        continued: true,
      }
    }
  }

  // Frase interpretada com seguranca por si so:
  //  - mesma intencao -> complementa a pendente (o turno novo tem prioridade);
  //  - outra intencao -> o usuario mudou de assunto; a pendente e abandonada.
  // Fragmentos ("8:30", "amanha", "depois do almoco") NAO caem aqui: o NLU os
  // devolve como `unknown`, exatamente por nao serem frases completas.
  if (interpretedAsNew) {
    if (interp.intent !== pending.intent) return fresh
    return {
      intent: pending.intent,
      data: { ...pending.data, ...fresh.data },
      asked: pending.asked || [],
      continued: true,
    }
  }

  // Resposta curta / nao entendida isoladamente -> completa o slot aberto.
  const slot = pending.awaiting || missingSlots(pending.intent, pending.data, { asked: pending.asked })[0]
  if (!slot) return fresh

  const applied = applyAnswer({ slot, data: pending.data, text, context })
  if (!applied.resolved) {
    return {
      intent: pending.intent,
      data: pending.data,
      asked: pending.asked || [],
      continued: true,
      unresolvedSlot: slot,
      unresolvedReason: applied.reason || null,
    }
  }
  return {
    intent: pending.intent,
    data: applied.data,
    asked: [...(pending.asked || []), slot],
    continued: true,
  }
}

// ---------------------------------------------------------------------------
// 4) PATCH — aplica um delta de campos sobre o rascunho vivo (CP5.1).
//
// O patch usa `null` para LIMPAR um campo. As interacoes de dominio ficam aqui,
// num lugar so, para valerem venha o delta de onde vier: data explicita anula
// "sem data" e intervalo; tirar o horario tira tambem periodo e ambiguidade.
// ---------------------------------------------------------------------------
export function applyPatch(data = {}, patch = {}) {
  const next = { ...data }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key]
    else next[key] = value
  }

  if (patch.date === null) {
    // Recusa deliberada de data: vai para a lista de tarefas a fazer.
    next.date_skipped = true
    delete next.date_range
  }
  if (patch.date) {
    delete next.date_skipped
    delete next.date_range
  }
  if (patch.date_range) {
    delete next.date
    delete next.date_skipped
  }
  if (patch.start_time === null) {
    delete next.time_ambiguous
    delete next.daypart
  }
  if (patch.start_time) delete next.daypart

  return next
}

// Campos internos de slot que NAO podem chegar ao payload da ferramenta.
export function stripInternal(data = {}) {
  const clean = { ...data }
  delete clean.time_ambiguous
  delete clean.date_range
  delete clean.date_skipped
  delete clean.daypart
  delete clean.category
  return clean
}

// O periodo do dia informado pelo usuario ("depois do almoço") nao vira horario
// inventado — mas tambem nao pode simplesmente sumir. Vira nota, com as
// palavras dele, quando nao ha horario nem outra nota.
export function withDaypartNote(data = {}) {
  const clean = stripInternal(data)
  if (data.daypart && !data.start_time && !clean.notes) {
    const label = DAYPARTS[data.daypart]?.label
    if (label) clean.notes = label.charAt(0).toUpperCase() + label.slice(1)
  }
  return clean
}
