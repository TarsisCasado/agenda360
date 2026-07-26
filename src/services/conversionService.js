import { taskService } from './taskService'
import { inboxTaskLinkService } from './inboxTaskLinkService'

// ---------------------------------------------------------------------------
// Orquestracao da conversao InboxItem -> Task (composition root).
//
// Este e o UNICO ponto que conhece os dois lados: reutiliza taskService para
// criar a atividade (sem duplicar logica de dominio) e inboxTaskLinkService
// para registrar o vinculo. Assim inboxService e taskService permanecem
// desacoplados (nenhum importa o outro).
//
// Regras (T1.2B):
//   - a Task nasce com origin = 'inbox' (fluxo interno confiavel);
//   - created_by e workspace vem da sessao (via taskService.create);
//   - o InboxItem NAO e arquivado nem excluido (a captura permanece intacta);
//   - apos criar a Task, cria-se o vinculo inbox_task_links.
// ---------------------------------------------------------------------------

export const conversionService = {
  async convertInboxItemToTask(workspaceId, userId, inboxItem, formPayload = {}) {
    // origin forcado: a conversao e um fluxo interno confiavel.
    const task = await taskService.create(workspaceId, userId, {
      ...formPayload,
      origin: 'inbox',
    })
    const link = await inboxTaskLinkService.create(workspaceId, userId, {
      inbox_item_id: inboxItem.id,
      task_id: task.id,
    })
    return { task, link }
  },
}
