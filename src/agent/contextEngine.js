// ---------------------------------------------------------------------------
// Context Engine — monta o contexto MINIMO e SEGURO para o interpretador.
// Inclui apenas o necessario (grounding anti-alucinacao); NUNCA deixa o modelo
// escolher outro workspace: o workspaceId vem da sessao/contexto autorizado.
// ---------------------------------------------------------------------------
import { taskService } from '../services/taskService'
import { toISODate, addDays, isTaskOverdue } from '../lib/date'
import { STATUS } from '../lib/constants'

export function createContextEngine({ tasks = taskService } = {}) {
  async function build(identity, { categories = [] } = {}) {
    if (!identity?.workspaceId) throw new Error('workspace ausente no contexto')

    const today = toISODate(new Date())
    // timezone do dispositivo (o "amanha"/"sexta" sao resolvidos com base nele)
    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'

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

    return {
      // user_id NAO e enviado ao provider (desnecessario); fica so na identidade.
      workspaceId: identity.workspaceId,
      today,
      timezone,
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      recentTasks,
      overdueTasks,
      // preferencias: tabela user_preferences ainda nao existe (Fase 8/M4).
      preferences: {},
    }
  }

  return { build }
}

export const contextEngine = createContextEngine()
