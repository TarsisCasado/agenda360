// ---------------------------------------------------------------------------
// CAMADA SEMANTICA (implementacao LOCAL, substituivel).
//
// Responsabilidade UNICA: dado um texto, dizer QUAL a intencao e quais campos
// o usuario mencionou. Tudo o que e determinismo (resolver datas, recortar
// titulo, decidir se falta slot, validar, confirmar, executar) vive fora daqui.
//
// Contrato de saida = o MESMO da Edge Function `ai-interpret`:
//   { intent, confidence, needs_clarification, clarification, data, ambiguities }
// Trocar esta camada por um LLM nao deve exigir mudanca em assistant/slots.
//
// Limite honesto: isto reconhece PADROES de intencao em PT-BR, nao compreende
// texto. Frases longas, ironia, negociacao e reformulacao continuam sendo
// trabalho de modelo (ver README do agente).
// ---------------------------------------------------------------------------
import { normalizeWithMap } from './normalize'
import { resolveTemporal } from './temporal'
import { extractTitle, extractQuery, extractTarget } from './title'

const BASE = {
  intent: 'unknown',
  confidence: 0.2,
  needs_clarification: false,
  clarification: null,
  data: {},
  ambiguities: [],
}

// --- sinais de intencao ------------------------------------------------------
// Verbo de comando explicito ("agende", "marca").
const COMMAND_VERBS = /\b(agend[ae]r?|agende|marc[ae]r?|marque|cri[ae]r?|crie|adicion[ae]r?|adicione|anot[ae]r?|anote|coloc[ae]r?|coloque|bot[ae]r?)\b/
// Lembrete ("me lembra de", "nao posso esquecer").
const REMINDER_CUES = /\b(lembr(a|e|ar|ete)|nao\s+posso\s+esquecer|nao\s+esque[cç]a|nao\s+deixar\s+de)\b/
// Intencao pessoal ("preciso", "tenho que", "quero", "vou ter").
const INTENT_CUES = /\b(preciso|precisamos|tenho\s+que|tenho\s+de|tenho\s+uma|tenho\s+um|tenho\s+reuniao|quero|queria|devo|vou\s+ter|vou\s+precisar|falta|tem\s+que)\b/
// Substantivos de compromisso.
const EVENT_NOUNS = /\b(reuniao|call|encontro|consulta|dentista|medico|exame|almoco|jantar|treino|aula|prova|entrevista|viagem|visita|apresentacao|ligacao|conversa|audiencia|processo)\b/
// Verbos de acao comuns em tarefa ("ligar", "pagar", "resolver", "ver").
const ACTION_VERBS = /\b(ligar|liga|telefonar|pagar|pague|resolver|resolve|revisar|revisa|enviar|envia|mandar|manda|comprar|compra|buscar|busca|levar|leva|falar|conversar|ver|vê|olhar|responder|entregar|assinar|estudar|treinar|marcar|separar|organizar|preparar|terminar|come[cç]ar)\b/

// --- consultas (LEITURA) -----------------------------------------------------
const SCHEDULE_QUERY = /\b(o\s+que\s+(eu\s+)?(tenho|tem|ha|rola)|oque\s+(eu\s+)?tenho|tenho\s+(alguma\s+coisa|algo|algum\s+compromisso)|tem\s+(alguma\s+coisa|algo)|alguma\s+coisa\s+(marcad|agendad)|minha\s+agenda|meus\s+compromissos|minha\s+programacao|como\s+(esta|ta)\s+(meu|minha)\s+(dia|agenda|semana)|agenda\s+d[eo])\b/
const SEARCH_QUERY = /\b(busque|buscar|busca|procure|procurar|procura|pesquise|pesquisar|pesquisa|encontre|encontrar|ache|achar|mostre|mostrar|liste|listar)\b/

// --- acoes sobre tarefa existente -------------------------------------------
// "conclui" (sem acento, apos normalizacao) precisa entrar: foi o caso do QA
// em que "Conclui a tarefa X" virava create_task.
const TARGET_VERBS = [
  { re: /\b(conclu\w*|finaliz\w*|termin(ei|ar|e|a)\b|encerr\w*|ja\s+fiz|fiz\s+a|marc\w*\s+como\s+(feit|conclu|pront))/, intent: 'complete_task' },
  { re: /\b(furei|nao\s+fiz|nao\s+consegui\s+fazer|marc\w*\s+como\s+furad)/, intent: 'mark_missed' },
  { re: /\b(reagend\w*|remarc\w*|adi(e|ar|a)\b|mude\s+para|mudar\s+para|passe\s+para|passar\s+para|move[r]?\s+para|joga[r]?\s+para)/, intent: 'reschedule_task' },
  { re: /\b(cancel[ae]\w*|cancelar)/, intent: 'cancel_task' },
  { re: /\b(exclu[aií]\w*|excluir|apagu?[ae]\w*|apagar|delet[ae]\w*|deletar|remov[ae]\w*|remover)/, intent: 'delete_task' },
]

const MASS_ACTION = /\b(todas|todos|tudo)\b/

function detectPriority(normalized) {
  const t = normalized.text
  if (/\burgent/.test(t)) return 'urgent'
  if (/prioridade\s+alta|\bmuito\s+importante\b|\bimportante\b/.test(t)) return 'high'
  if (/prioridade\s+baixa|\bsem\s+pressa\b|\bquando\s+der\b/.test(t)) return 'low'
  return undefined
}

function detectCategory(normalized, categories = []) {
  for (const c of categories) {
    const name = (c?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (!name) continue
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized.text)) {
      return { category_id: c.id, category: c.name }
    }
  }
  return {}
}

export function interpretLocal(text, context = {}) {
  const raw = String(text || '').trim()
  if (!raw) {
    return {
      ...BASE,
      needs_clarification: true,
      clarification: 'Digite o que você precisa organizar.',
    }
  }

  const normalized = normalizeWithMap(raw)
  const t = normalized.text
  const temporal = resolveTemporal(raw, { today: context.today, now: context.now })
  const link = (raw.match(/https?:\/\/\S+/) || [])[0] || ''

  // 1) LINK puro -> create_link.
  if (link && !/\b(tarefa|agend|reuniao|lembr)/.test(t)) {
    return { ...BASE, intent: 'create_link', confidence: 0.9, data: { url: link, title: '' } }
  }

  // 2) CONSULTA DE AGENDA (leitura — nunca cria nada).
  if (SCHEDULE_QUERY.test(t)) {
    const start = temporal.range?.start || temporal.date || context.today
    const end = temporal.range?.end || temporal.date || context.today
    return {
      ...BASE,
      intent: 'list_schedule',
      confidence: 0.88,
      data: { start, end },
    }
  }

  // 3) BUSCA DE TAREFAS (leitura).
  if (SEARCH_QUERY.test(t) && !COMMAND_VERBS.test(t)) {
    const query = extractQuery(raw, temporal.spans)
    return { ...BASE, intent: 'search_tasks', confidence: 0.8, data: { query } }
  }

  // 4) ACOES SOBRE TAREFA EXISTENTE (concluir/reagendar/cancelar/excluir).
  for (const verb of TARGET_VERBS) {
    if (!verb.re.test(t)) continue
    if (MASS_ACTION.test(t)) {
      return {
        ...BASE,
        intent: verb.intent,
        confidence: 0.5,
        needs_clarification: true,
        clarification: 'Ação em massa não é permitida por segurança. Especifique uma única tarefa.',
      }
    }
    const data = { query: extractTarget(raw, temporal.spans) }
    if (verb.intent === 'reschedule_task') {
      if (temporal.date) data.date = temporal.date
      if (temporal.time) data.start_time = temporal.time
      if (!temporal.date) {
        // Sinaliza a falta; QUEM pergunta e a camada de slots (vale para
        // qualquer provider), nao o interpretador.
        return {
          ...BASE,
          intent: verb.intent,
          confidence: 0.8,
          needs_clarification: true,
          clarification: 'Para qual data devo reagendar?',
          data,
          ambiguities: ['data'],
        }
      }
    }
    return { ...BASE, intent: verb.intent, confidence: 0.82, data }
  }

  // 5) CRIAR ATIVIDADE — sem exigir verbo de comando.
  const signals = {
    command: COMMAND_VERBS.test(t),
    reminder: REMINDER_CUES.test(t),
    intention: INTENT_CUES.test(t),
    event: EVENT_NOUNS.test(t),
    action: ACTION_VERBS.test(t),
    temporal: temporal.hasTemporal,
  }
  const strong = signals.command || signals.reminder || signals.intention || signals.event
  const weak = signals.action || signals.temporal

  if (strong || (weak && signals.temporal && signals.action)) {
    const title = extractTitle(raw, temporal.spans)
    if (!title) {
      // Ha intencao mas nao ha assunto ("marca pra amanha").
      return {
        ...BASE,
        intent: 'create_task',
        confidence: 0.6,
        needs_clarification: true,
        clarification: 'O que você quer registrar?',
        data: {
          ...(temporal.date ? { date: temporal.date } : {}),
          ...(temporal.time ? { start_time: temporal.time } : {}),
        },
        ambiguities: ['titulo'],
      }
    }

    const priority = detectPriority(normalized)
    const category = detectCategory(normalized, context.categories)
    const data = {
      title,
      ...(temporal.date ? { date: temporal.date } : {}),
      ...(temporal.time ? { start_time: temporal.time } : {}),
      ...(temporal.daypart ? { daypart: temporal.daypart } : {}),
      ...(temporal.range ? { date_range: temporal.range } : {}),
      priority: priority || 'medium',
      ...(category.category_id ? { category_id: category.category_id } : {}),
      ...(link ? { link } : {}),
    }

    const ambiguities = []
    // NUNCA cai para "hoje" caladinho: sem data, a data e um SLOT FALTANTE
    // (quem pergunta e a camada de slots, que vale para qualquer provider).
    if (!temporal.date && !temporal.range) ambiguities.push('data')
    if (temporal.range) ambiguities.push('data_intervalo')
    if (temporal.timeAmbiguous) ambiguities.push('horario')

    const confidence = signals.command || signals.reminder ? 0.9 : strong ? 0.85 : 0.75
    return {
      ...BASE,
      intent: 'create_task',
      confidence,
      // Ha algo por confirmar (data ausente, intervalo, hora AM/PM). O texto da
      // pergunta e responsabilidade da camada de slots — aqui so o sinal.
      needs_clarification: ambiguities.length > 0,
      clarification: null,
      data,
      ambiguities,
    }
  }

  // 6) Nada reconhecido.
  return {
    ...BASE,
    needs_clarification: true,
    clarification:
      'Não entendi o que você precisa. Pode escrever com suas palavras — por exemplo: "amanhã às 9 tenho reunião com o Rafael".',
  }
}

export const __test__ = { SCHEDULE_QUERY, SEARCH_QUERY, TARGET_VERBS }
