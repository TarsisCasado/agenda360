// ---------------------------------------------------------------------------
// CAMADA DETERMINISTICA — resolucao temporal PT-BR.
//
// Esta camada NAO decide intencao. Ela so responde: "que data/hora/periodo o
// usuario escreveu, e ONDE isso aparece no texto?". Serve tanto ao NLU local
// quanto (no futuro) a validacao da saida de um LLM: mesmo com provider remoto,
// datas relativas continuam sendo resolvidas AQUI, com o `today`/`now` do
// contexto — modelo nenhum precisa saber contar dias.
//
// Regras nao negociaveis:
//   - nunca inventa data: sem expressao temporal, `date` = null;
//   - nunca inventa horario: periodo do dia ("de manha") vira `daypart`,
//     nao vira start_time;
//   - hora de 1..11 sem minutos, sem "h" e sem periodo e AMBIGUA (AM/PM);
//   - "semana que vem" e um INTERVALO, nao um dia — quem precisa de um dia
//     unico deve perguntar qual.
// ---------------------------------------------------------------------------
import { fromISODate, toISODate, addDays } from '../../lib/date'
import { normalizeWithMap, spanToSource } from './normalize'

const WEEKDAYS = {
  domingo: 0,
  segunda: 1,
  'segunda-feira': 1,
  terca: 2,
  'terca-feira': 2,
  quarta: 3,
  'quarta-feira': 3,
  quinta: 4,
  'quinta-feira': 4,
  sexta: 5,
  'sexta-feira': 5,
  sabado: 6,
}

// Periodos do dia. `resolves` = periodo que desambigua uma hora 1..11.
export const DAYPARTS = {
  manha: { label: 'de manhã', shift: 'am' },
  tarde: { label: 'à tarde', shift: 'pm' },
  noite: { label: 'à noite', shift: 'pm' },
  almoco: { label: 'no almoço', shift: 'pm' },
  depois_do_almoco: { label: 'depois do almoço', shift: 'pm' },
  fim_do_dia: { label: 'no fim do dia', shift: 'pm' },
  madrugada: { label: 'de madrugada', shift: 'am' },
}

const NUMBER_WORDS = {
  uma: 1, um: 1, duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, meia: 30,
}

// Ordem importa: o primeiro padrao que casar vence e seu trecho e consumido.
const DAYPART_PATTERNS = [
  [/\bdepois\s+do\s+almoc[oa]\b/, 'depois_do_almoco'],
  [/\b(no|na|ao)?\s*(hor[aá]rio\s+do\s+)?almoc[oa]\b/, 'almoco'],
  [/\b(no\s+)?(fim|final)\s+do\s+dia\b/, 'fim_do_dia'],
  [/\bde\s+madrugada\b/, 'madrugada'],
  [/\b(de|pela|na|a)\s+manha\b/, 'manha'],
  [/\b(de|pela|na|a)\s+tarde\b/, 'tarde'],
  [/\b(de|pela|na|a)\s+noite\b/, 'noite'],
  [/\bmanha\b/, 'manha'],
  [/\btarde\b/, 'tarde'],
  [/\bnoite\b/, 'noite'],
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function hhmm(h, m = 0) {
  return `${pad(h)}:${pad(m)}`
}

// Executa um regex no texto normalizado e devolve { match, span } (span ja
// convertido para o texto ORIGINAL) ou null.
function findSpan(normalized, re) {
  const m = re.exec(normalized.text)
  if (!m) return null
  return {
    match: m,
    span: spanToSource(normalized, m.index, m.index + m[0].length),
    nrange: [m.index, m.index + m[0].length],
  }
}

// Apaga um trecho JA consumido do texto normalizado (mantendo os indices), para
// que o proximo extrator nao releia o mesmo pedaco — e o que impede
// "daqui a 2 dias" de virar tambem "as 2" (02:00).
function maskNormalized(normalized, ranges = []) {
  let text = normalized.text
  for (const range of ranges.filter(Boolean)) {
    const [start, end] = range
    text = text.slice(0, start) + ' '.repeat(end - start) + text.slice(end)
  }
  return { ...normalized, text }
}

// ---------------------------------------------------------------------------
// DATA
// ---------------------------------------------------------------------------
// Retorna { date, kind, range, span } — `date` null quando nao ha expressao.
// kind: 'today' | 'tomorrow' | 'day_after' | 'weekday' | 'explicit' |
//       'week_range' (precisa de um dia) | 'relative_days'
function resolveDatePart(normalized, today) {
  const base = fromISODate(today) || new Date()

  const rules = [
    [/\bdepois\s+de\s+amanha\b/, () => ({ date: toISODate(addDays(base, 2)), kind: 'day_after' })],
    [/\banteontem\b/, () => ({ date: toISODate(addDays(base, -2)), kind: 'relative_days' })],
    [/\bontem\b/, () => ({ date: toISODate(addDays(base, -1)), kind: 'relative_days' })],
    [/\bhoje\b/, () => ({ date: today, kind: 'today' })],
    [/\bamanha\b/, () => ({ date: toISODate(addDays(base, 1)), kind: 'tomorrow' })],
  ]
  for (const [re, build] of rules) {
    const hit = findSpan(normalized, re)
    if (hit) return { ...build(), span: hit.span, nrange: hit.nrange }
  }

  // "daqui a X dias"
  const inDays = findSpan(normalized, /\bdaqui\s+a\s+(\d{1,2}|uma?|dois|duas|tres|quatro|cinco|seis|sete)\s+dias?\b/)
  if (inDays) {
    const raw = inDays.match[1]
    const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] || 1
    return { date: toISODate(addDays(base, n)), kind: 'relative_days', span: inDays.span, nrange: inDays.nrange }
  }

  // "semana que vem" / "proxima semana" -> INTERVALO (segunda a domingo).
  const nextWeek = findSpan(normalized, /\b(semana\s+que\s+vem|pr[oó]xima\s+semana|semana\s+seguinte)\b/)
  if (nextWeek) {
    const dow = base.getDay() === 0 ? 7 : base.getDay() // 1..7 (segunda..domingo)
    const nextMonday = addDays(base, 8 - dow)
    return {
      date: null,
      kind: 'week_range',
      range: { start: toISODate(nextMonday), end: toISODate(addDays(nextMonday, 6)) },
      span: nextWeek.span,
      nrange: nextWeek.nrange,
    }
  }
  const thisWeek = findSpan(normalized, /\b(esta|essa|nesta|nessa)\s+semana\b/)
  if (thisWeek) {
    const dow = base.getDay() === 0 ? 7 : base.getDay()
    const monday = addDays(base, 1 - dow)
    return {
      date: null,
      kind: 'week_range',
      range: { start: toISODate(monday), end: toISODate(addDays(monday, 6)) },
      span: thisWeek.span,
      nrange: thisWeek.nrange,
    }
  }

  // Dia da semana ("sexta", "sexta-feira", "proxima sexta").
  // Chaves mais longas primeiro: "sexta-feira" antes de "sexta", senao o
  // recorte do titulo deixaria "-feira" para tras.
  const weekdayEntries = Object.entries(WEEKDAYS).sort((a, b) => b[0].length - a[0].length)
  for (const [name, dow] of weekdayEntries) {
    const hit = findSpan(normalized, new RegExp(`\\b(pr[oó]xima\\s+|proxima\\s+|na\\s+|essa\\s+|esta\\s+)?${name}\\b`))
    if (!hit) continue
    let diff = (dow - base.getDay() + 7) % 7
    if (diff === 0) diff = 7 // "na sexta" nunca e hoje: e a proxima futura
    const isNext = /pr[oó]xima|proxima/.test(hit.match[0])
    if (isNext && diff < 7) diff += 0 // "proxima sexta" = a mesma proxima sexta futura
    return { date: toISODate(addDays(base, diff)), kind: 'weekday', span: hit.span, nrange: hit.nrange }
  }

  // Data explicita: 12/09, 12/09/2026, "dia 12".
  const slash = findSpan(normalized, /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (slash) {
    const [, d, mo, y] = slash.match
    const year = y ? Number(y.length === 2 ? `20${y}` : y) : base.getFullYear()
    const dt = new Date(year, Number(mo) - 1, Number(d))
    if (dt.getMonth() === Number(mo) - 1 && dt.getDate() === Number(d)) {
      return { date: toISODate(dt), kind: 'explicit', span: slash.span, nrange: slash.nrange }
    }
  }

  return { date: null, kind: null, span: null, nrange: null }
}

// ---------------------------------------------------------------------------
// HORA
// ---------------------------------------------------------------------------
// Retorna { time, ambiguous, span }. `ambiguous` = precisa saber AM/PM.
function resolveTimePart(normalized) {
  const meio = findSpan(normalized, /\bmeio[-\s]?dia\b/)
  if (meio) return { time: '12:00', ambiguous: false, span: meio.span }
  const meiaNoite = findSpan(normalized, /\bmeia[-\s]?noite\b/)
  if (meiaNoite) return { time: '00:00', ambiguous: false, span: meiaNoite.span }

  // 1) Hora COM minutos: "8:30", "08:30h", "08:30hs", "8h30", "as 8 e meia".
  //    A ordem das alternativas do sufixo vai do mais longo para o mais curto
  //    (hrs|hs|h) — foi exatamente isso que deixava o "s" de "hs" no titulo.
  const withMinutes = findSpan(
    normalized,
    /(?:\b(?:as|a)\s+)?\b(\d{1,2})\s*(?::|h|hs|hrs|horas?)\s*(\d{2})\s*(?:horas?|hrs|hs|h)?\b/,
  )
  if (withMinutes) {
    const h = Number(withMinutes.match[1])
    const min = Number(withMinutes.match[2])
    if (h <= 23 && min <= 59) {
      const period = detectDaypart(normalized)
      let hour = h
      if (period && DAYPARTS[period.key]?.shift === 'pm' && hour >= 1 && hour <= 11) hour += 12
      // Minutos explicitos: tratamos como NAO ambiguo (quem quer 20:30 escreve
      // 20:30). Isso evita a pergunta desnecessaria do "08:30" real do QA.
      return { time: hhmm(hour, min), ambiguous: false, span: withMinutes.span }
    }
  }

  // 2) Hora "cheia" com marcador de hora: "8h", "15h", "20 horas", "8 hrs".
  const withH = findSpan(normalized, /(?:\b(?:as|a)\s+)?\b(\d{1,2})\s*(?:horas?|hrs|hs|h)\b/)
  if (withH) {
    const h = Number(withH.match[1])
    if (h <= 23) {
      const period = detectDaypart(normalized)
      let hour = h
      if (period && DAYPARTS[period.key]?.shift === 'pm' && hour >= 1 && hour <= 11) hour += 12
      return { time: hhmm(hour), ambiguous: false, span: withH.span }
    }
  }

  // 3) Hora nua com preposicao: "as 8", "as 15".
  const bare = findSpan(normalized, /\b(?:as|a)\s+(\d{1,2})\b(?!\s*(?:\/|:|de\s+\w+))/)
  if (bare) {
    const h = Number(bare.match[1])
    if (h <= 23) {
      const period = detectDaypart(normalized)
      let hour = h
      let ambiguous = false
      if (period && DAYPARTS[period.key]?.shift === 'pm' && hour >= 1 && hour <= 11) hour += 12
      else if (!period && hour >= 1 && hour <= 11) ambiguous = true
      return { time: hhmm(hour), ambiguous, span: bare.span }
    }
  }

  return { time: null, ambiguous: false, span: null }
}

// Periodo do dia presente no texto (sem consumir a hora).
function detectDaypart(normalized) {
  for (const [re, key] of DAYPART_PATTERNS) {
    // "amanha" contem "manha": exige que nao seja parte de "amanha".
    const hit = findSpan(normalized, re)
    if (!hit) continue
    const before = normalized.text.slice(Math.max(0, hit.match.index - 2), hit.match.index)
    if (key === 'manha' && /a$/.test(before) && /manha/.test(hit.match[0])) continue
    return { key, span: hit.span, matched: hit.match[0] }
  }
  return null
}

// "daqui a duas horas" -> hora absoluta a partir de `now` (HH:MM).
function resolveRelativeHours(normalized, now) {
  const hit = findSpan(normalized, /\bdaqui\s+a\s+(\d{1,2}|uma?|duas?|tres|quatro|cinco|seis)\s+horas?\b/)
  if (!hit || !now) return null
  const raw = hit.match[1]
  const n = /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw] || 1
  const [h, m] = now.split(':').map(Number)
  if (Number.isNaN(h)) return null
  const total = (h + n) * 60 + (m || 0)
  const dayShift = Math.floor(total / (24 * 60))
  const mins = ((total % (24 * 60)) + 24 * 60) % (24 * 60)
  return { time: hhmm(Math.floor(mins / 60), mins % 60), dayShift, span: hit.span }
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
// resolveTemporal(text, { today, now }) ->
//   { date, dateKind, range, time, timeAmbiguous, daypart, spans, hasTemporal }
export function resolveTemporal(text, { today, now } = {}) {
  const normalized = normalizeWithMap(text)
  const ref = today || toISODate(new Date())
  const spans = []

  const datePart = resolveDatePart(normalized, ref)
  if (datePart.span) spans.push(datePart.span)
  // Texto sem o trecho de data — a extracao de hora nao pode reler "2 dias".
  const afterDate = maskNormalized(normalized, [datePart.nrange])

  let date = datePart.date
  let dateKind = datePart.kind

  // "daqui a X horas" resolve data E hora ao mesmo tempo.
  const relative = resolveRelativeHours(afterDate, now)
  let time = null
  let timeAmbiguous = false
  if (relative) {
    time = relative.time
    spans.push(relative.span)
    if (!date) {
      const base = fromISODate(ref) || new Date()
      date = toISODate(addDays(base, relative.dayShift))
      dateKind = 'relative_hours'
    }
  } else {
    const timePart = resolveTimePart(afterDate)
    time = timePart.time
    timeAmbiguous = timePart.ambiguous
    if (timePart.span) spans.push(timePart.span)
  }

  const period = detectDaypart(afterDate)
  // O periodo so vira "informacao" quando NAO ha hora exata (ele ja foi usado
  // para desambiguar a hora, quando havia).
  const daypart = period && !time ? period.key : null
  if (period) spans.push(period.span)

  return {
    date,
    dateKind,
    range: datePart.range || null,
    time,
    timeAmbiguous,
    daypart,
    spans: spans.filter(Boolean),
    hasTemporal: Boolean(date || datePart.range || time || daypart),
  }
}

// RECUSA DELIBERADA DE DATA. Diferente de `skip` (que e sobre HORARIO), aqui o
// usuario esta dizendo que a atividade NAO tem dia: ela nasce na lista de
// tarefas a fazer, com `date` nulo. Sao padroes, nao frases inteiras — a
// resposta real costuma vir com contexto ("Sem data definida, coloque em
// tarefas a fazer"), entao nada aqui e ancorado no inicio/fim do texto.
//
// Casam sobre o texto NORMALIZADO (minusculo, sem acento), por isso "nao".
const NO_DATE_PATTERNS = [
  /\bsem\s+(uma\s+)?(data|prazo|dia\s+certo|dia\s+definido)\b/,
  /\bnao\s+(tem|ha|possui|existe)\s+(uma\s+)?(data|prazo|dia)\b/,
  /\bnao\s+precisa\s+(de\s+|ter\s+|d[ae]\s+)?(data|prazo|dia)\b/,
  /\bnao\s+e\s+(pra|para)\s+(uma\s+)?(data|dia)\b/,
  /\bdata\s+(ainda\s+)?(indefinida|nao\s+definida|a\s+definir)\b/,
  /\bainda\s+nao\s+(sei|defini|decidi|tenho)\b/,
  /\b(em|n[oa]s?)\s+tarefas?(\s+a\s+fazer)?\b/,
  /\blista\s+de\s+tarefas\b/,
  /\bpara\s+depois\b/,
]

function isNoDateAnswer(normalizedText) {
  return NO_DATE_PATTERNS.some((re) => re.test(normalizedText))
}

// Interpretacao de uma RESPOSTA CURTA ("8:30", "de manha", "amanha", "sexta",
// "sem horario"). Usada pelo slot-filling: aqui o texto e uma resposta a uma
// pergunta, entao "8:30" e horario mesmo sem preposicao.
export function resolveTemporalAnswer(text, { today, now } = {}) {
  const raw = String(text || '').trim()
  const normalized = normalizeWithMap(raw)

  if (/^(sem hor[aá]rio|sem hora|nao sei|n[aã]o sei|tanto faz|qualquer hor[aá]rio|deixa sem|sem)$/i.test(raw.trim())) {
    return { skip: true }
  }

  const temporal = resolveTemporal(raw, { today, now })
  // Data explicita SEMPRE vence a recusa ("nao sei... pode ser sexta").
  if (temporal.date || temporal.range) return temporal
  // Sem data no texto: uma recusa deliberada e uma resposta VALIDA.
  if (isNoDateAnswer(normalized.text)) {
    return { ...temporal, noDate: true, hasTemporal: false }
  }
  if (temporal.time || temporal.daypart) return temporal

  // Hora nua sem preposicao ("8:30", "9", "08:30hs") — valido como RESPOSTA.
  const bare = /^(\d{1,2})(?:\s*[:h]\s*(\d{2}))?\s*(?:horas?|hrs|hs|h)?$/.exec(normalized.text.trim())
  if (bare) {
    const h = Number(bare[1])
    const m = bare[2] ? Number(bare[2]) : 0
    if (h <= 23 && m <= 59) {
      const explicitMinutes = Boolean(bare[2])
      return {
        ...temporal,
        time: hhmm(h, m),
        // "9" sozinho continua ambiguo; "9:30" nao.
        timeAmbiguous: !explicitMinutes && h >= 1 && h <= 11,
        hasTemporal: true,
      }
    }
  }
  return temporal
}

export const __test__ = { resolveDatePart, resolveTimePart, detectDaypart, resolveRelativeHours, isNoDateAnswer }
