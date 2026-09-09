// ---------------------------------------------------------------------------
// CAMADA DETERMINISTICA — DELTA DE CAMPOS e ASSUNTO RESIDUAL.
//
// Duas perguntas, nenhuma delas sobre intencao:
//
//   1) extractDelta  — "que VALORES DE CAMPO este turno carrega, e onde eles
//                       aparecem no texto?"
//   2) residualSubject — "depois de tirar tudo que ja foi consumido (campos e
//                       ato de fala), sobrou um ASSUNTO?"
//
// Juntas elas sustentam o principio do CP5.1: um turno so cria uma entidade
// nova se trouxer um sujeito que NAO cabe como valor de campo da entidade que
// esta viva. Na duvida, e alteracao.
//
// Nada aqui conhece frases. Os extratores sao os mesmos que o NLU ja usa
// (temporal, prioridade, categoria) — reaproveitados pelo TRECHO, nao pelo
// resultado. E por isso a garantia continua valendo se amanha a interpretacao
// vier de um LLM remoto: ele produz intent+data, e esta camada continua
// decidindo o que o turno faz com o rascunho vivo.
// ---------------------------------------------------------------------------
import { normalizeWithMap, spanToSource, cutSpans } from './normalize'
import { resolveTemporalAnswer } from './temporal'
import { PRIORITY_PATTERNS, detectCategory } from './localNlu'

// Lembrete: conceito de campo, nao de frase. Negativos ANTES dos positivos —
// "nao quero lembrete" contem "lembrete".
const REMINDER_PATTERNS = [
  [/\b(nao|sem)\s+(quero\s+|precisa\s+d?e?\s*|queria\s+)?(de\s+)?(lembrete|alarme|alerta|notificacao|aviso)\w*/, false],
  [/\b(tira|tirar|remove|remover|desliga|desligar)\s+(o\s+)?(lembrete|alarme|alerta|aviso)\w*/, false],
  [/\b(com|quero|poe|poem|coloca|colocar|bota|botar|adiciona|adicionar)\s+(um\s+)?(lembrete|alarme|alerta|aviso)\w*/, true],
  [/\b(me\s+)?(lembra|lembre|lembrar|avisa|avise|avisar|notifica|notificar)\b/, true],
]

function findIn(normalized, re) {
  const m = re.exec(normalized.text)
  if (!m) return null
  return { nrange: [m.index, m.index + m[0].length], span: spanToSource(normalized, m.index, m.index + m[0].length) }
}

// ---------------------------------------------------------------------------
// extractDelta(texto, contexto) ->
//   { patch, spans, fields, empty }
//
// `patch` usa null para "limpar o campo". `fields` sao rotulos legiveis, usados
// na confirmacao ("Ajustei a data e a prioridade").
// ---------------------------------------------------------------------------
export function extractDelta(text, { today, now, categories = [] } = {}) {
  const raw = String(text || '').trim()
  const normalized = normalizeWithMap(raw)
  const patch = {}
  const spans = []
  const fields = []

  // --- tempo (data, hora, periodo, ausencia deliberada de data) -------------
  const temporal = resolveTemporalAnswer(raw, { today, now })
  if (Array.isArray(temporal.spans)) spans.push(...temporal.spans.filter(Boolean))

  if (temporal.noDate) {
    patch.date = null
    fields.push('data')
  } else if (temporal.date) {
    patch.date = temporal.date
    fields.push('data')
  } else if (temporal.range) {
    patch.date_range = temporal.range
    fields.push('data')
  }

  if (temporal.skip) {
    // "sem horario" sobre um rascunho: limpa a hora em vez de pular a pergunta.
    patch.start_time = null
    fields.push('horário')
  } else if (temporal.time) {
    patch.start_time = temporal.time
    patch.time_ambiguous = Boolean(temporal.timeAmbiguous)
    fields.push('horário')
  } else if (temporal.daypart) {
    patch.daypart = temporal.daypart
    fields.push('período')
  }

  // --- prioridade ----------------------------------------------------------
  for (const [re, value] of PRIORITY_PATTERNS) {
    const hit = findIn(normalized, re)
    if (hit) {
      patch.priority = value
      fields.push('prioridade')
      spans.push(hit.span)
      break
    }
  }

  // --- categoria (nomes reais do workspace, nao lista fixa) -----------------
  const cat = detectCategory(normalized, categories)
  if (cat.category_id) {
    patch.category_id = cat.category_id
    fields.push('categoria')
    const hit = findIn(normalized, new RegExp(`\\b${String(cat.category || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`))
    if (hit) spans.push(hit.span)
  }

  // --- lembrete ------------------------------------------------------------
  for (const [re, value] of REMINDER_PATTERNS) {
    const hit = findIn(normalized, re)
    if (hit) {
      patch.alert_enabled = value
      fields.push('lembrete')
      spans.push(hit.span)
      break
    }
  }

  return { patch, spans: spans.filter(Boolean), fields, empty: Object.keys(patch).length === 0 }
}

// ---------------------------------------------------------------------------
// ASSUNTO RESIDUAL
//
// Classe FECHADA de palavras que nunca constituem, sozinhas, um assunto novo:
// funcionais (artigo, preposicao, conjuncao), verbos de comando/edicao,
// anafora ("isso", "essa atividade") e adverbios de ajuste. Tudo que sobra fora
// dessa lista e conteudo — e conteudo e sinal de entidade nova.
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  // funcionais
  'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'para', 'pra', 'pro', 'por', 'com', 'sem', 'e',
  'ou', 'que', 'se', 'ao', 'aos', 'num', 'numa', 'ele', 'ela', 'eu', 'me', 'meu',
  'minha', 'lhe', 'te', 'ne',
  // verbos de comando / edicao
  'muda', 'mudar', 'mude', 'mudo', 'troca', 'trocar', 'troque', 'altera', 'alterar',
  'altere', 'ajusta', 'ajustar', 'ajuste', 'corrige', 'corrigir', 'corrija',
  'coloca', 'colocar', 'coloque', 'poe', 'por', 'ponha', 'bota', 'botar', 'bote',
  'deixa', 'deixar', 'deixe', 'passa', 'passar', 'passe', 'joga', 'jogar', 'jogue',
  'move', 'mover', 'mova', 'manda', 'mandar', 'mande', 'faz', 'fazer', 'faca',
  'quero', 'queria', 'gostaria', 'preciso', 'pode', 'podia', 'poderia', 'da',
  'vamos', 'vou', 'seria', 'fica', 'ficar', 'fique', 'salva', 'salvar', 'salve',
  'marca', 'marcar', 'marque', 'agenda', 'agendar', 'agende', 'cria', 'criar',
  'crie', 'adiciona', 'adicionar', 'adicione', 'registra', 'registrar',
  // anafora e referencia a entidade viva
  'isso', 'isto', 'esse', 'essa', 'este', 'esta', 'aquilo', 'aquele', 'aquela',
  'tarefa', 'tarefas', 'atividade', 'atividades', 'compromisso', 'compromissos',
  'item', 'evento', 'lembrete', 'card', 'cartao',
  // adverbios / conectivos de ajuste
  'so', 'somente', 'apenas', 'tambem', 'ainda', 'ja', 'agora', 'depois', 'antes',
  'melhor', 'verdade', 'entao', 'mas', 'ai', 'sim', 'nao', 'talvez', 'mesmo',
  'certo', 'ok', 'obrigado', 'obrigada', 'favor', 'la', 'aqui',
])

// residualSubject(textoOriginal, spansJaConsumidos) -> string[] das palavras de
// conteudo que sobraram. Vazio = o turno nao introduz assunto novo.
export function residualSubject(text, spans = []) {
  const rest = cutSpans(String(text || ''), spans)
  const normalized = normalizeWithMap(rest).text
  return normalized
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
}

export const __test__ = { STOPWORDS, REMINDER_PATTERNS }
