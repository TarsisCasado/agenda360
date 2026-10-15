import { uid } from '../lib/utils'
import { captureAssetService } from './captureAssetService'
import { inboxService } from './inboxService'
import { inboxAttachmentService } from './inboxAttachmentService'

// ---------------------------------------------------------------------------
// captureService — ORQUESTRADOR OFICIAL do dominio Capture (composition root).
//
// E o UNICO ponto publico autorizado a criar uma captura com asset. Nenhum
// componente deve falar direto com captureAssetService / inboxService /
// inboxAttachmentService — sempre via captureService (ARCHITECTURE.md
// ADR-04/10/11). Este servico NAO conhece taskService/conversionService.
//
// Consistencia SEM transacao/RPC (decisao desta etapa): compensacao na
// APLICACAO. Ordem e desfazimento:
//   1) upload do binario           — falhou => nada a desfazer (sem InboxItem);
//   2) cria o InboxItem            — falhou => remove o binario;
//   3) persiste o descritor        — falhou => remove o InboxItem e o binario.
// Objetivo: nunca deixar orfaos.
// ---------------------------------------------------------------------------

// Canais reconhecidos (ADR glossario) — referencia do que existira no futuro.
export const CAPTURE_CHANNELS = [
  'text',
  'assistant',
  'voice',
  'photo',
  'ocr',
  'pdf',
  'audio',
  'email',
  'whatsapp',
  'google_calendar',
  'api',
  'share',
  'file',
]

// Canais efetivamente SUPORTADOS por esta etapa (com adapter + origin
// persistivel). So 'photo' agora; pdf/audio/... entram quando seus adapters e
// origins existirem. Aceitar aqui um canal que o inboxService ainda nao
// persiste causaria coercao silenciosa para 'manual' — por isso restringimos.
export const CAPTURE_CHANNELS_SUPPORTED = ['photo']

// Remocao best-effort: a compensacao nunca pode mascarar o erro original.
async function safeRemoveAsset(descriptor) {
  try {
    await captureAssetService.remove(descriptor)
  } catch (err) {
    console.warn('[captureService] falha ao remover asset na compensacao:', err?.message || err)
  }
}
async function safeRemoveItem(note) {
  try {
    await inboxService.remove(note)
  } catch (err) {
    console.warn('[captureService] falha ao remover InboxItem na compensacao:', err?.message || err)
  }
}

export const captureService = {
  CAPTURE_CHANNELS,

  // Cria uma captura com asset. Retorna um objeto unico representando-a.
  async capture(workspaceId, userId, { file, channel } = {}) {
    // 2) Validacao de entrada.
    if (!workspaceId) throw new Error('workspaceId obrigatorio.')
    if (!userId) throw new Error('userId obrigatorio.')
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Arquivo invalido (esperado Blob/File).')
    }
    if (!CAPTURE_CHANNELS_SUPPORTED.includes(channel)) {
      throw new Error(`Canal de captura nao suportado nesta etapa: ${channel}`)
    }

    // Pre-gera o id da captura para compor o path do asset ANTES de existir a
    // linha do InboxItem (permite a ordem upload -> item -> descritor).
    const inboxItemId = uid()

    // 3) Upload do binario. Se falhar, propaga sem criar nada mais.
    const descriptor = await captureAssetService.upload(workspaceId, { inboxItemId, file })

    // 4) Cria o InboxItem (usando o id pre-gerado). Se falhar, remove o binario.
    let item
    try {
      // Persiste explicitamente a origem = canal da captura (reusa
      // inbox_items.origin; nenhum campo novo no banco).
      item = await inboxService.create(workspaceId, userId, { id: inboxItemId, type: 'note', origin: channel })
    } catch (err) {
      await safeRemoveAsset(descriptor)
      throw err
    }

    // 5) Persiste o descritor. Se falhar, remove InboxItem e binario.
    let attachment
    try {
      attachment = await inboxAttachmentService.create(workspaceId, userId, {
        inbox_item_id: inboxItemId,
        ...descriptor,
      })
    } catch (err) {
      await safeRemoveItem(item)
      await safeRemoveAsset(descriptor)
      throw err
    }

    // 6) Objeto unico da captura criada.
    return { id: inboxItemId, workspaceId, channel, item, attachment }
  },

  // -------------------------------------------------------------------------
  // LEITURA (UX-M1). Nada abaixo grava, envia ou remove nada.
  //
  // Por que mora AQUI e nao na tela: exibir um asset exige DUAS pecas — o
  // descritor (inboxAttachmentService) e a URL de visualizacao
  // (captureAssetService, assinada no Supabase e data-URL no demo). Compor as
  // duas e exatamente o papel deste servico (ADR-04/10/11). Uma tela que
  // falasse direto com os dois passaria a conhecer bucket e path, que sao
  // detalhe de armazenamento.
  // -------------------------------------------------------------------------

  // Descritores de varios InboxItems de uma vez: { inbox_item_id: [...] }.
  // Uma leitura, nao N.
  async anexosDeItens(workspaceId, inboxItemIds = []) {
    if (!workspaceId) return {}
    return inboxAttachmentService.mapByInboxItems(workspaceId, inboxItemIds)
  },

  // URL de visualizacao de UM asset. Deliberadamente sob demanda: no Supabase
  // cada URL assinada e uma ida a rede, entao gerar as de uma lista inteira ao
  // abrir a tela custaria dezenas de chamadas para imagens que ninguem olhou.
  // Quem abre o item paga por ele.
  //
  // Devolve null em vez de lancar: um anexo que nao abre nao pode derrubar a
  // leitura do que estava escrito ao lado dele.
  async urlDeAnexo(descriptor) {
    try {
      return await captureAssetService.getViewUrl(descriptor)
    } catch (err) {
      console.warn('[captureService] falha ao obter URL do anexo:', err?.message || err)
      return null
    }
  },
}
