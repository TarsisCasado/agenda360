// ---------------------------------------------------------------------------
// Assistente de IA.
//
// Arquitetura preparada para dois modos:
//   - MODO MOCK (padrao): interpretador de comandos por regras, roda 100% local
//     e nao depende de nenhuma API.
//   - MODO API (futuro): basta implementar callRemoteAI() abaixo apontando para
//     ChatGPT (OpenAI) ou Claude (Anthropic). O contrato de saida e o mesmo.
//
// Toda resposta do assistente retorna:
//   { reply: string, intents: Intent[] }
// onde cada Intent descreve uma acao a ser aplicada pela UI, por exemplo:
//   { type: 'create_task', payload: {...} }
//   { type: 'reschedule_overdue', payload: { toDate } }
//   { type: 'report', payload: { metric: 'missed_this_week' } }
// ---------------------------------------------------------------------------
import { STATUS } from '../lib/constants'
import { toISODate, addDays } from '../lib/date'

const PROVIDER = import.meta.env.VITE_AI_PROVIDER || 'mock'
const API_KEY = import.meta.env.VITE_AI_API_KEY || ''

// -- Helpers de parsing de datas em linguagem natural (pt-BR) ----------------

function resolveDate(text) {
  const t = text.toLowerCase()
  const today = new Date()
  if (/\bhoje\b/.test(t)) return toISODate(today)
  if (/\bamanh[aã]\b/.test(t)) return toISODate(addDays(today, 1))
  if (/\bdepois de amanh[aã]\b/.test(t)) return toISODate(addDays(today, 2))

  const weekdays = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    'terça': 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
    'sábado': 6,
  }
  for (const [name, dow] of Object.entries(weekdays)) {
    if (t.includes(name)) {
      const cur = today.getDay()
      let diff = (dow - cur + 7) % 7
      if (diff === 0) diff = 7 // "na sexta" = a proxima sexta
      return toISODate(addDays(today, diff))
    }
  }
  // dd/mm
  const m = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/)
  if (m) {
    const d = Number(m[1])
    const mo = Number(m[2])
    const y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : today.getFullYear()
    return toISODate(new Date(y, mo - 1, d))
  }
  return null
}

function resolveTime(text) {
  const t = text.toLowerCase()
  // "as 15h", "as 15:30", "as 9 horas"
  const m = t.match(/(?:as|às|,)\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)?/)
  if (m) {
    const h = String(m[1]).padStart(2, '0')
    const min = (m[2] || m[3] || '00').padStart(2, '0')
    return `${h}:${min}`
  }
  return null
}

function addHour(time) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  const nh = (h + 1) % 24
  return `${String(nh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// -- Interpretador por regras (mock) -----------------------------------------

function parseCommand(text, context = {}) {
  const t = text.toLowerCase().trim()
  const date = resolveDate(t)
  const time = resolveTime(t)
  const link = context.link || (text.match(/https?:\/\/\S+/) || [])[0] || ''

  // Reagendar atrasadas
  if (/reagend\w*.*(atrasad|pendent|furei|furad)/.test(t) || /reagend\w+ tudo/.test(t)) {
    const to = date || toISODate(addDays(new Date(), 1))
    return {
      reply: `Vou reagendar todas as atividades atrasadas para ${to}.`,
      intents: [{ type: 'reschedule_overdue', payload: { toDate: to } }],
    }
  }

  // Relatorio: o que mais furei
  if (/(mais )?fur\w+/.test(t) && /(semana|essa|esta|mostr)/.test(t)) {
    return {
      reply: 'Aqui esta o que voce mais furou nesta semana.',
      intents: [{ type: 'report', payload: { metric: 'missed_this_week' } }],
    }
  }

  // Criar rotina semanal
  if (/rotina semanal/.test(t)) {
    return {
      reply:
        'Montei uma sugestao de rotina semanal a partir das suas pendencias. Revise e confirme os itens.',
      intents: [{ type: 'weekly_routine', payload: {} }],
    }
  }

  // Transformar link em ideia
  if (link && /ideia/.test(t)) {
    return {
      reply: 'Salvei esse link como uma ideia para avaliar depois.',
      intents: [
        {
          type: 'create_task',
          payload: {
            title: 'Avaliar ideia: ' + link,
            date: date || toISODate(new Date()),
            link,
            status: STATUS.TODO,
            categoryName: 'Ideia',
            priority: 'low',
          },
        },
      ],
    }
  }

  // Agendar reuniao / tarefa (com ou sem link)
  if (/(agend|marc)\w*|reuni[aã]o|tarefa|lembr\w+|criar?/.test(t)) {
    const isMeeting = /reuni[aã]o/.test(t)
    const targetDate = date || toISODate(new Date())
    // titulo: remove palavras de comando e datas
    let title = text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/(agende|agendar|marque|marcar|crie|criar|uma|um|para|no|na|as|às)/gi, ' ')
      .replace(/(hoje|amanh[aã]|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)/gi, ' ')
      .replace(/\d{1,2}[:h]\d{0,2}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title || title.length < 3) {
      title = isMeeting ? 'Reuniao' : link ? 'Revisar link' : 'Nova atividade'
    }
    title = title.charAt(0).toUpperCase() + title.slice(1)

    return {
      reply: `${isMeeting ? 'Reuniao' : 'Atividade'} "${title}" agendada para ${targetDate}${time ? ' as ' + time : ''}.`,
      intents: [
        {
          type: 'create_task',
          payload: {
            title,
            date: targetDate,
            start_time: time,
            end_time: addHour(time),
            link,
            categoryName: isMeeting ? 'Reuniao' : undefined,
            status: STATUS.TODO,
            priority: isMeeting ? 'high' : 'medium',
          },
        },
      ],
    }
  }

  return {
    reply:
      'Nao entendi totalmente. Tente por exemplo: "Agende uma reuniao amanha as 15h" ou "Reagende as tarefas atrasadas para amanha".',
    intents: [],
  }
}

// -- Adapter para API real (futuro) ------------------------------------------

async function callRemoteAI(_text, _context) {
  // TODO(futuro): implementar chamada real.
  //
  // Exemplo (Anthropic Claude):
  //   const res = await fetch('https://api.anthropic.com/v1/messages', {
  //     method: 'POST',
  //     headers: {
  //       'x-api-key': API_KEY,
  //       'anthropic-version': '2023-06-01',
  //       'content-type': 'application/json',
  //     },
  //     body: JSON.stringify({
  //       model: 'claude-sonnet-5',
  //       max_tokens: 1024,
  //       system: SYSTEM_PROMPT, // instrui o modelo a devolver JSON de intents
  //       messages: [{ role: 'user', content: _text }],
  //     }),
  //   })
  //
  // IMPORTANTE: nunca exponha a API key no frontend em producao. Use uma
  // Supabase Edge Function como proxy. Enquanto isso, cai no modo mock.
  throw new Error('Integracao com IA ainda nao configurada')
}

export const aiService = {
  provider: PROVIDER,
  hasApiKey: Boolean(API_KEY),

  async ask(text, context = {}) {
    if (PROVIDER !== 'mock' && API_KEY) {
      try {
        return await callRemoteAI(text, context)
      } catch {
        // fallback transparente para o modo mock
        return parseCommand(text, context)
      }
    }
    return parseCommand(text, context)
  },
}
