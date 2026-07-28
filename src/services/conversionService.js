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
// Regras:
//   - a origem da Task e DERIVADA do InboxItem persistido (T1.2D/Etapa 4),
//     nunca do payload editavel do modal;
//   - created_by e workspace vem da sessao (via taskService.create);
//   - o InboxItem NAO e arquivado nem excluido (a captura permanece intacta);
//   - apos criar a Task, cria-se o vinculo inbox_task_links.
// ---------------------------------------------------------------------------

// Deriva a origem da Task a partir da origem do InboxItem (fonte confiavel):
//   - captura por foto (origin 'photo')            -> Task origin 'photo';
//   - captura manual da Caixa (origin 'manual'/def) -> Task origin 'inbox'.
// Canais futuros (pdf/audio/...) mapeiam 1:1 assim que existirem.
function taskOriginFromInbox(inboxItem) {
  return inboxItem?.origin === 'photo' ? 'photo' : 'inbox'
}

export const conversionService = {
  async convertInboxItemToTask(workspaceId, userId, inboxItem, formPayload = {}) {
    // origin NUNCA vem do payload: derivada do InboxItem e imposta por ultimo
    // (o spread de formPayload nao consegue sobrescreve-la).
    const task = await taskService.create(workspaceId, userId, {
      ...formPayload,
      origin: taskOriginFromInbox(inboxItem),
    })

    let link
    try {
      link = await inboxTaskLinkService.create(workspaceId, userId, {
        inbox_item_id: inboxItem.id,
        task_id: task.id,
      })
    } catch (err) {
      // Compensacao minima (sem transacao server-side nesta fase): se o vinculo
      // falhar, a Task recem-criada ficaria orfa (origin 'inbox' sem retorno a
      // captura). Desfaz a Task para transformar sucesso-parcial em falha limpa;
      // a exclusao e best-effort para nao mascarar o erro original.
      try { await taskService.remove(userId, task) } catch { /* best-effort */ }
      throw err
    }
    return { task, link }
  },
}
