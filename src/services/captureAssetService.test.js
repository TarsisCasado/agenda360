import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO (sem Supabase): storage local via localStore/data-URL.
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))

import {
  captureAssetService,
  kindForMime,
  CAPTURE_BUCKET,
  CAPTURE_ASSET_KINDS,
  MAX_ASSET_BYTES,
} from './captureAssetService'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const ITEM = 'inbox-1'
const pngFile = (bytes = [137, 80, 78, 71]) =>
  new Blob([new Uint8Array(bytes)], { type: 'image/png' })

describe('captureAssetService — helpers puros', () => {
  it('kindForMime classifica os quatro tipos do dominio', () => {
    expect(kindForMime('image/png')).toBe('image')
    expect(kindForMime('image/jpeg')).toBe('image')
    expect(kindForMime('application/pdf')).toBe('pdf')
    expect(kindForMime('audio/mpeg')).toBe('audio')
    expect(kindForMime('text/plain')).toBe('file')
    expect(kindForMime('')).toBe('file')
  })

  it('o dominio reconhece image | pdf | audio | file (modelagem generica)', () => {
    expect(CAPTURE_ASSET_KINDS).toEqual(['image', 'pdf', 'audio', 'file'])
  })
})

describe('captureAssetService — upload/getViewUrl/remove (demo)', () => {
  it('upload retorna descritor com kind=image, bucket, path e mime', async () => {
    const d = await captureAssetService.upload(WS, { inboxItemId: ITEM, file: pngFile() })
    expect(d.kind).toBe('image')
    expect(d.storage_bucket).toBe(CAPTURE_BUCKET)
    expect(d.mime).toBe('image/png')
    expect(d.bytes).toBe(4)
    // path escopado por workspace/item e com extensao do mime
    expect(d.storage_path.startsWith(`${WS}/${ITEM}/`)).toBe(true)
    expect(d.storage_path.endsWith('.png')).toBe(true)
  })

  it('getViewUrl devolve uma data-URL exibivel do binario enviado', async () => {
    const d = await captureAssetService.upload(WS, { inboxItemId: ITEM, file: pngFile() })
    const url = await captureAssetService.getViewUrl(d)
    expect(url).toMatch(/^data:image\/png;base64,/)
  })

  it('remove apaga o binario (getViewUrl passa a retornar null)', async () => {
    const d = await captureAssetService.upload(WS, { inboxItemId: ITEM, file: pngFile() })
    await captureAssetService.remove(d)
    expect(await captureAssetService.getViewUrl(d)).toBeNull()
  })

  it('getViewUrl de path inexistente retorna null (sem erro)', async () => {
    expect(await captureAssetService.getViewUrl({ storage_path: 'nao/existe.png' })).toBeNull()
    expect(await captureAssetService.getViewUrl({})).toBeNull()
  })

  it('generico: aceita PDF e classifica corretamente', async () => {
    const pdf = new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' })
    const d = await captureAssetService.upload(WS, { inboxItemId: ITEM, file: pdf })
    expect(d.kind).toBe('pdf')
    expect(d.storage_path.endsWith('.pdf')).toBe(true)
  })

  it('rejeita arquivo sem mime', async () => {
    const noType = new Blob([new Uint8Array([1, 2, 3])])
    await expect(
      captureAssetService.upload(WS, { inboxItemId: ITEM, file: noType }),
    ).rejects.toThrow(/mime/i)
  })

  it('rejeita arquivo acima do limite de tamanho', async () => {
    const huge = { type: 'image/png', size: MAX_ASSET_BYTES + 1, arrayBuffer: async () => new ArrayBuffer(0) }
    await expect(
      captureAssetService.upload(WS, { inboxItemId: ITEM, file: huge }),
    ).rejects.toThrow(/limite/i)
  })

  it('exige workspaceId e inboxItemId', async () => {
    await expect(captureAssetService.upload(null, { inboxItemId: ITEM, file: pngFile() })).rejects.toThrow(/workspaceId/)
    await expect(captureAssetService.upload(WS, { inboxItemId: null, file: pngFile() })).rejects.toThrow(/inboxItemId/)
  })
})
