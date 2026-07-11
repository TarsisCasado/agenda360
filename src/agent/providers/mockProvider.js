// ---------------------------------------------------------------------------
// Provider MOCK de interpretacao (roda 100% local, sem chave/rede).
// Transforma texto -> InterpretResult estruturado e VALIDAVEL:
//   { intent, confidence, needs_clarification, clarification, data, ambiguities }
//
// Regras de ambiguidade (Fase 7): datas relativas usam o "hoje" do contexto
// (timezone do usuario), "sexta" = proxima sexta futura, horario sem periodo
// ("as 8") pede confirmacao, baixa confianca pede esclarecimento.
// Nunca inventa data quando ha ambiguidade real.
// ---------------------------------------------------------------------------
import { fromISODate, toISODate, addDays } from '../../lib/date'

const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const WEEKDAYS = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
}

function resolveDate(text, today) {
  const t = norm(text)
  const base = fromISODate(today)
  if (/\bhoje\b/.test(t)) return { date: today }
  if (/\bdepois de amanha\b/.test(t)) return { date: toISODate(addDays(base, 2)) }
  if (/\bamanha\b/.test(t)) return { date: toISODate(addDays(base, 1)) }

  for (const [name, dow] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      let diff = (dow - base.getDay() + 7) % 7
      if (diff === 0) diff = 7 // "na sexta" = a proxima sexta futura
      return { date: toISODate(addDays(base, diff)) }
    }
  }
  const m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : base.getFullYear()
    return { date: toISODate(new Date(y, mo - 1, d)) }
  }
  return { date: null }
}

// Retorna { time, ambiguous }. "as 15h"/"15:30" = ok; "as 8" (1..11 sem
// periodo) = ambiguo (manha/noite).
function resolveTime(text) {
  const t = norm(text)
  const m = t.match(/(?:as|,|\bhoras?\b|\bh\b)?\s*(\d{1,2})(?::(\d{2}))?\s*(h|hs|hrs|horas?)?/)
  const explicit = t.match(/(\d{1,2})(?::(\d{2}))?\s*(h|hs|hrs)\b|\bas\s+(\d{1,2})/)
  if (!explicit) return { time: null, ambiguous: false }
  let h = Number(explicit[1] ?? explicit[4] ?? (m && m[1]))
  const min = (m && m[2]) || '00'
  if (Number.isNaN(h) || h > 23) return { time: null, ambiguous: false }
  const hasPeriod = /(manha|tarde|noite|meio[- ]?dia)/.test(t)
  const usedH = /\d{1,2}\s*(h|hs|hrs)/.test(t)
  // 1..11 sem "h" e sem periodo -> ambiguo (poderia ser AM ou PM)
  const ambiguous = h >= 1 && h <= 11 && !hasPeriod && !usedH
  if (/tarde|noite/.test(t) && h < 12) h += 12
  return { time: `${String(h).padStart(2, '0')}:${min}`, ambiguous }
}

function resolvePriority(text) {
  const t = norm(text)
  if (/\burgent/.test(t)) return 'urgent'
  if (/prioridade alta|\balta\b|importante/.test(t)) return 'high'
  if (/prioridade baixa|\bbaixa\b/.test(t)) return 'low'
  return undefined
}

function resolveCategory(text, categories = []) {
  const t = norm(text)
  const hit = categories.find((c) => new RegExp(`\\b${norm(c.name)}\\b`).test(t))
  return hit ? { category_id: hit.id, category: hit.name } : {}
}

function cleanTitle(text) {
  let title = text
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b(agende|agendar|marque|marcar|crie|criar|adicione|nova|novo|tarefa)\b/gi, ' ')
    .replace(/\b(amanha|hoje|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/gi, ' ')
    .replace(/\b(as|às)\s*\d{1,2}(:\d{2})?\s*(h|hs|hrs|horas?)?\b/gi, ' ')
    .replace(/\bprioridade (alta|baixa|media|urgente)\b/gi, ' ')
    .replace(/\b(alta|baixa|urgente|importante)\b/gi, ' ')
    .replace(/[,;:.]+/g, ' ') // remove pontuacao residual
    .replace(/\s+/g, ' ')
    .trim()
  if (title.length < 2) return ''
  return title.charAt(0).toUpperCase() + title.slice(1)
}

export function mockInterpret(text, context = {}) {
  const today = context.today || toISODate(new Date())
  const t = norm(text)
  const link = (text.match(/https?:\/\/\S+/) || [])[0] || ''

  const base = {
    intent: 'unknown',
    confidence: 0.2,
    needs_clarification: false,
    clarification: null,
    data: {},
    ambiguities: [],
  }

  // create_link
  if (link && !/tarefa|agende|reuniao/.test(t)) {
    return { ...base, intent: 'create_link', confidence: 0.9, data: { url: link, title: '' } }
  }

  // list_schedule
  if (/\b(agenda|programacao|o que (eu )?tenho|compromissos)\b/.test(t)) {
    const d = resolveDate(t, today)
    const date = d.date || today
    return { ...base, intent: 'list_schedule', confidence: 0.85, data: { start: date, end: date } }
  }

  // search_tasks
  if (/\b(busque|buscar|procure|procurar|pesquis|encontre|encontrar|mostre as tarefas)\b/.test(t)) {
    const q = text.replace(/\b(busque|buscar|procure|procurar|pesquis\w*|encontre|encontrar|tarefas?|por|as|os)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    return { ...base, intent: 'search_tasks', confidence: 0.8, data: { query: q } }
  }

  // acoes sobre tarefa existente (por nome -> resolvido depois)
  const targetVerbs = [
    { re: /\b(conclua|concluir|marque como (feito|concluid)|terminei|finaliz)/, intent: 'complete_task' },
    { re: /\b(furei|nao fiz|marque como furad)/, intent: 'mark_missed' },
    { re: /\b(reagend|remarque|mude para|passe para)/, intent: 'reschedule_task' },
    { re: /\b(cancele|cancelar)/, intent: 'cancel_task' },
    { re: /\b(exclua|excluir|apague|delete|remova)/, intent: 'delete_task' },
  ]
  for (const v of targetVerbs) {
    if (v.re.test(t)) {
      // bloqueio de acao em massa (Fase 7)
      if (/\b(todas|tudo|todos)\b/.test(t)) {
        return {
          ...base,
          intent: v.intent,
          confidence: 0.5,
          needs_clarification: true,
          clarification:
            'Acao em massa nao e permitida por seguranca. Especifique uma unica tarefa.',
        }
      }
      const query = text
        .replace(v.re, ' ')
        .replace(/\b(a|o|as|os|tarefa|atividade|para|amanha|hoje)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const data = { query }
      if (v.intent === 'reschedule_task') {
        const d = resolveDate(t, today)
        if (!d.date) {
          return {
            ...base,
            intent: v.intent,
            confidence: 0.55,
            needs_clarification: true,
            clarification: 'Para qual data devo reagendar?',
            data,
          }
        }
        data.date = d.date
      }
      return { ...base, intent: v.intent, confidence: 0.8, data }
    }
  }

  // create_task (padrao para agendar/criar/reuniao)
  if (/\b(agende|agendar|marque|marcar|crie|criar|adicione|reuniao|tarefa|lembr)/.test(t)) {
    const d = resolveDate(t, today)
    const { time, ambiguous } = resolveTime(t)
    const priority = resolvePriority(t)
    const cat = resolveCategory(t, context.categories)
    const isMeeting = /reuniao/.test(t)
    let title = cleanTitle(text)
    if (!title) title = isMeeting ? 'Reuniao' : link ? 'Revisar link' : 'Nova atividade'

    const data = {
      title,
      date: d.date || today,
      ...(time ? { start_time: time } : {}),
      priority: priority || 'medium',
      ...(cat.category_id ? { category_id: cat.category_id } : {}),
      ...(isMeeting && !cat.category_id ? {} : {}),
      ...(link ? { link } : {}),
    }
    const ambiguities = []
    let confidence = 0.9
    let needs_clarification = false
    let clarification = null
    if (!d.date) {
      // sem data reconhecida: usamos hoje mas sinalizamos
      ambiguities.push('data')
      confidence = 0.7
    }
    if (ambiguous) {
      ambiguities.push('horario')
      confidence = Math.min(confidence, 0.65)
      needs_clarification = true
      clarification = `Confirme o horario de "${title}": ${time} (manha) ou ${addPeriod(time)} (noite)?`
    }
    return {
      ...base,
      intent: 'create_task',
      confidence,
      needs_clarification,
      clarification,
      data,
      ambiguities,
    }
  }

  // Nada reconhecido -> baixa confianca -> pede esclarecimento
  return {
    ...base,
    needs_clarification: true,
    clarification:
      'Nao entendi. Tente por exemplo: "Agende reuniao com Rafael amanha as 15h, prioridade alta".',
  }
}

function addPeriod(time) {
  if (!time) return time
  const [h, m] = time.split(':').map(Number)
  const nh = (h % 12) + 12
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
