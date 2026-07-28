import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO: services reais sobre localStore (upload -> data-URL local).
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { captureService } from './captureService'
import { captureAssetService } from './captureAssetService'
import { inboxService } from './inboxService'
import { inboxAttachmentService } from './inboxAttachmentService'
import { localStore } from './localStore'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  vi.restoreAllMocks()
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const photo = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

// Contadores das tabelas relevantes (para provar "sem orfaos").
const counts = () => ({
  items: localStore.table('inbox_items').length,
  atts: localStore.table('inbox_attachments').length,
  blobs: localStore.table('capture_asset_blobs').length,
})

describe('captureService — orquestracao (demo)', () => {
  it('sucesso: cria item + descritor + binario e retorna a captura unica', async () => {
    const cap = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })
    expect(cap.id).toBeTruthy()
    expect(cap.channel).toBe('photo')
    expect(cap.item.id).toBe(cap.id) // InboxItem usa o id pre-gerado
    expect(cap.item.status).toBe('inbox')
    expect(cap.attachment.inbox_item_id).toBe(cap.id)
    expect(cap.attachment.kind).toBe('image')
    expect(cap.attachment.storage_bucket).toBe('captures')
    // persistido de verdade
    expect(counts()).toEqual({ items: 1, atts: 1, blobs: 1 })
    // binario recuperavel
    expect(await captureAssetService.getViewUrl(cap.attachment)).toMatch(/^data:image\/png/)
    // descritor listavel pelo item
    expect(await inboxAttachmentService.listByInboxItem(WS, cap.id)).toHaveLength(1)
  })

  it('validacao: rejeita canal invalido, arquivo invalido e ids ausentes', async () => {
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'nope' })).rejects.toThrow(/canal/i)
    await expect(captureService.capture(WS, USER, { file: null, channel: 'photo' })).rejects.toThrow(/arquivo/i)
    await expect(captureService.capture(null, USER, { file: photo(), channel: 'photo' })).rejects.toThrow(/workspaceId/)
    await expect(captureService.capture(WS, null, { file: photo(), channel: 'photo' })).rejects.toThrow(/userId/)
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 }) // nada criado
  })
})

describe('captureService — compensacao (sem orfaos)', () => {
  it('upload falha: nao cria InboxItem nem descritor (nada a compensar)', async () => {
    vi.spyOn(captureAssetService, 'upload').mockRejectedValueOnce(new Error('storage indisponivel'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('storage indisponivel')
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 })
  })

  it('InboxItem falha: remove o binario (sem item, sem descritor, sem blob)', async () => {
    const removeSpy = vi.spyOn(captureAssetService, 'remove')
    vi.spyOn(inboxService, 'create').mockRejectedValueOnce(new Error('inbox indisponivel'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('inbox indisponivel')
    expect(removeSpy).toHaveBeenCalledTimes(1) // binario removido
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 })
  })

  it('descritor falha: remove InboxItem e binario (compensacao completa)', async () => {
    const removeAsset = vi.spyOn(captureAssetService, 'remove')
    const removeItem = vi.spyOn(inboxService, 'remove')
    vi.spyOn(inboxAttachmentService, 'create').mockRejectedValueOnce(new Error('descritor indisponivel'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('descritor indisponivel')
    expect(removeItem).toHaveBeenCalledTimes(1) // InboxItem desfeito
    expect(removeAsset).toHaveBeenCalledTimes(1) // binario removido
    expect(counts()).toEqual({ items: 0, atts: 0, blobs: 0 }) // nenhum orfao
  })

  it('compensacao best-effort nao mascara o erro original', async () => {
    vi.spyOn(inboxAttachmentService, 'create').mockRejectedValueOnce(new Error('erro original'))
    // mesmo se a limpeza falhar, o erro original e propagado
    vi.spyOn(captureAssetService, 'remove').mockRejectedValueOnce(new Error('cleanup falhou'))
    await expect(captureService.capture(WS, USER, { file: photo(), channel: 'photo' }))
      .rejects.toThrow('erro original')
  })
})
