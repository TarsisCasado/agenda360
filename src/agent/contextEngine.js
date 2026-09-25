// ---------------------------------------------------------------------------
// Context Engine — monta o contexto MINIMO e SEGURO para o interpretador.
// Inclui apenas o necessario (grounding anti-alucinacao); NUNCA deixa o modelo
// escolher outro workspace: o workspaceId vem da sessao/contexto autorizado.
// ---------------------------------------------------------------------------
import { taskService } from '../services/taskService'
import { toISODate, addDays, isTaskOverdue } from '../lib/date'
import { STATUS } from '../lib/constants'
import { contextPreferences } from '../lib/preferences'

// ---------------------------------------------------------------------------
// O NUCLEO DO CONTEXTO — a parte que NAO depende da rede.
//
// Data de hoje, hora atual, fuso, categorias, historico e rascunho ja estao em
// maos (vem da sessao e dos parametros). Isolar isso num lugar so tem um motivo
// pratico: quando o banco esta inalcancavel, o turno continua com ESTE contexto
// — e "amanha" resolve para a mesma data que resolveria online. Um contexto
// degradado que perde o `today` nao e degradado, e errado: proporia a atividade
// para o dia errado, que e pior do que nao propor nada.
//
// O que fica de fora offline sao as listas vindas do banco (recentes/atrasadas)
// — grounding util, nunca requisito para entender a frase.
// ---------------------------------------------------------------------------
//
// C3 — DE ONDE O TURNO FOI FALADO.
//
// A faisca contextual das quatro superficies manda junto um recorte MINIMO do
// que estava na tela ({ superficie } e, quando existe, periodo / filtro /
// item). Isso entra no contexto como `surface`, e so isso: a lista visivel, o
// conteudo integral das notas e o resto do banco continuam fora. O grounding de
// tarefas ja tem janela propria logo abaixo — duplicar a tela aqui aumentaria o
// que sai do dispositivo sem responder melhor.
//
// Campo OMITIDO quando nao ha superficie: um `surface: null` afirmaria ao
// modelo que existe um lugar e que ele e vazio.
// ---------------------------------------------------------------------------
export function contextoBase(identity, { categories = [], history = [], pending = null, now = new Date(), surface = null } = {}) {
  if (!identity?.workspaceId) throw new Error('workspace ausente no contexto')

  return {
    ...(surface ? { surface } : {}),
    // user_id NAO e enviado ao provider (desnecessario); fica so na identidade.
    workspaceId: identity.workspaceId,
    today: toISODate(now),
    // Hora local atual (HH:MM) — necessaria para "daqui a duas horas" e para
    // decidir o que ainda cabe hoje. Sem isso o interpretador teria que chutar.
    now: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    // timezone do dispositivo (o "amanha"/"sexta" sao resolvidos com base nele)
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
    // Memoria conversacional: ultimos turnos + intencao pendente. O provider
    // local usa pouco; um LLM usa muito. Ambos recebem o mesmo contexto.
    history: (history || []).map((m) => ({ role: m.role, content: m.content })),
    pending: pending ? { intent: pending.intent, data: pending.data, awaiting: pending.awaiting } : null,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    recentTasks: [],
    overdueTasks: [],
    // Preferencias de rotina coletadas no onboarding (armazenadas localmente,
    // sem tabela nova). Alimentam o grounding: horarios/dias de trabalho etc.
    preferences: contextPreferences(identity.workspaceId),
  }
}

export function createContextEngine({ tasks = taskService } = {}) {
  async function build(identity, { categories = [], history = [], pending = null, now = new Date(), surface = null } = {}) {
    const base = contextoBase(identity, { categories, history, pending, now, surface })

    // Janela curta e relevante: ultimos 14 dias ate +7 dias.
    const recent = await tasks.list(identity.workspaceId, {
      start: toISODate(addDays(new Date(), -14)),
      end: toISODate(addDays(new Date(), 7)),
    })

    // Enviamos apenas campos necessarios (id, titulo, data, status) — sem notas.
    const slim = (t) => ({ id: t.id, title: t.title, date: t.date, status: t.status })

    const recentTasks = recent
      .filter((t) => [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status))
      .slice(0, 20)
      .map(slim)

    const overdueTasks = recent.filter((t) => isTaskOverdue(t)).slice(0, 20).map(slim)

    return { ...base, recentTasks, overdueTasks }
  }

  return { build }
}

export const contextEngine = createContextEngine()
