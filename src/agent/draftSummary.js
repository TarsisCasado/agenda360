// ---------------------------------------------------------------------------
// RESPOSTA FACTUAL SOBRE O RASCUNHO ATIVO.
//
// Uma unica regra governa este modulo: **so descreve o que esta no rascunho**.
// Nada e inferido, nada e inventado, nada e prometido. Campo ausente vira
// "sem X" — que e um fato — e nunca um palpite.
//
// Fica fora do provider de proposito: a descricao de um estado interno nao e
// tarefa de interpretacao semantica. Com um LLM remoto no lugar do NLU local,
// a resposta a "esta sem data?" continua saindo daqui, do dado real.
// ---------------------------------------------------------------------------
import { formatShort, toISODate, addDays } from '../lib/date'
import { PRIORITY_META } from '../lib/constants'
import { DAYPARTS } from './nlu/temporal'

// Rotulo de prioridade em PROSA. PRIORITY_META existe para etiquetas curtas na
// interface e traz "Media" sem acento; numa frase isso fica errado em pt-BR.
// Corrigir a constante mudaria o texto de badges em telas fora do escopo do
// CP5.1.1, entao a forma escrita mora aqui, ao lado de quem escreve a frase.
const PRIORITY_PROSE = { low: 'baixa', medium: 'média', high: 'alta', urgent: 'urgente' }

function priorityLabel(priority) {
  return PRIORITY_PROSE[priority] || PRIORITY_PROSE.medium || String(PRIORITY_META[priority]?.label || '')
}

// "amanhã (31/08/2026)" quando ajuda; so a data quando nao ha referencia util.
function dateLabel(date, today) {
  if (!date) return null
  if (!today) return formatShort(date)
  const base = new Date(`${today}T12:00:00`)
  if (Number.isNaN(base.getTime())) return formatShort(date)
  if (date === today) return `hoje (${formatShort(date)})`
  if (date === toISODate(addDays(base, 1))) return `amanhã (${formatShort(date)})`
  return formatShort(date)
}

// Frase por campo, sempre no indicativo e sempre a partir do dado real.
function fieldPhrase(field, data = {}, { categories = [], today } = {}) {
  switch (field) {
    case 'titulo':
      return data.title ? `o título é "${data.title}"` : 'ainda não tem título'
    case 'data':
      return data.date ? `está para ${dateLabel(data.date, today)}` : 'está sem data'
    case 'horario':
      if (data.start_time) return `está às ${String(data.start_time).slice(0, 5)}`
      if (data.daypart) return `está ${DAYPARTS[data.daypart]?.label || 'sem horário exato'}`
      return 'está sem horário'
    case 'prioridade':
      return `a prioridade está ${priorityLabel(data.priority)}`
    case 'lembrete':
      return data.alert_enabled ? 'está com lembrete' : 'está sem lembrete'
    case 'categoria': {
      const cat = categories.find((c) => c.id === data.category_id)
      return cat ? `a categoria é ${cat.name}` : 'está sem categoria'
    }
    case 'destino':
      return data.date
        ? `vai aparecer na agenda de ${dateLabel(data.date, today)}`
        : 'fica na lista de tarefas a fazer, sem entrar na agenda'
    default:
      return null
  }
}

function joinPt(parts = []) {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

function capitalize(text = '') {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

// Linha completa de estado: usada quando a pergunta nao mira campo nenhum
// ("como ficou?") — e como fecho de qualquer resposta longa.
export function draftLine(data = {}, { categories = [], today } = {}) {
  const cat = categories.find((c) => c.id === data.category_id)
  const parts = [
    data.date ? dateLabel(data.date, today) : 'sem data',
    data.start_time
      ? String(data.start_time).slice(0, 5)
      : data.daypart
        ? DAYPARTS[data.daypart]?.label
        : 'sem horário',
    `prioridade ${priorityLabel(data.priority)}`,
    cat ? cat.name : 'sem categoria',
    data.alert_enabled ? 'com lembrete' : 'sem lembrete',
  ].filter(Boolean)
  return `"${data.title || 'sem título'}" · ${parts.join(' · ')}`
}

// ---------------------------------------------------------------------------
// describeDraft(data, { categories, today, fields })
//
// `fields` sao os campos que a pergunta mirou (de nlu/question.js). Quando ha
// mira, a resposta comeca por eles; sem mira, devolve o estado inteiro. Nos
// dois casos a origem e a mesma: o rascunho.
// ---------------------------------------------------------------------------
export function describeDraft(data = {}, { categories = [], today, fields = [] } = {}) {
  const targeted = fields.filter((f) => f !== 'titulo' || data.title)
  if (targeted.length > 0 && targeted.length <= 3) {
    const phrases = targeted.map((f) => fieldPhrase(f, data, { categories, today })).filter(Boolean)
    if (phrases.length) return `${capitalize(joinPt(phrases))}.`
  }
  return `Está assim: ${draftLine(data, { categories, today })}.`
}
