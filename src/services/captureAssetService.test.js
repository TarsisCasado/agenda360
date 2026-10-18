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
import { localStore, ehErroDeCota } from './localStore'
import { MAX_BYTES_DEMO } from '../lib/anexoPolitica'

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

// ===========================================================================
// UX-M2.1 — A PORTA DE ENTRADA.
//
// A politica em si e testada em `lib/anexoPolitica.test.js`. O que importa
// AQUI e que o servico de fato a aplica: antes ele aceitava qualquer mime nao
// vazio, e nenhum teste reclamava disso.
// ===========================================================================
const comoArquivo = (type, bytes = [0, 1, 2, 3]) =>
  new Blob([new Uint8Array(bytes)], { type })

describe('captureAssetService — allowlist no upload', () => {
  it('recusa SVG, HTML e executável antes de guardar qualquer coisa', async () => {
    for (const mime of ['image/svg+xml', 'text/html', 'application/x-msdownload']) {
      await expect(
        captureAssetService.upload(WS, { inboxItemId: ITEM, file: comoArquivo(mime) }),
      ).rejects.toThrow(/não pode ser anexado/i)
    }
    // Nada foi parar no armazenamento.
    expect(localStore.table('capture_asset_blobs')).toHaveLength(0)
  })

  it('SVG não se disfarça de imagem no resto do domínio', () => {
    expect(kindForMime('image/svg+xml')).toBe('file')
  })

  it('aceita os formatos prometidos', async () => {
    const d1 = await captureAssetService.upload(WS, {
      inboxItemId: ITEM, file: comoArquivo('image/jpeg', [0xff, 0xd8, 0xff]),
    })
    expect(d1.storage_path.endsWith('.jpg')).toBe(true)
    const d2 = await captureAssetService.upload(WS, {
      inboxItemId: ITEM, file: comoArquivo('text/csv', [97, 44, 98]),
    })
    expect(d2.kind).toBe('file')
    expect(d2.storage_path.endsWith('.csv')).toBe(true)
  })

  it('reconhece HEIC do iPhone e lhe dá a extensão certa', async () => {
    const heic = comoArquivo('image/heic',
      [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])
    const d = await captureAssetService.upload(WS, { inboxItemId: ITEM, file: heic })
    expect(d.kind).toBe('image')
    expect(d.storage_path.endsWith('.heic')).toBe(true)
  })

  it('recusa HTML renomeado para .png: os bytes contradizem o mime', async () => {
    const disfarcado = comoArquivo('image/png', [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50])
    await expect(
      captureAssetService.upload(WS, { inboxItemId: ITEM, file: disfarcado }),
    ).rejects.toThrow(/não corresponde ao tipo declarado/i)
  })

  it('recusa arquivo vazio', async () => {
    await expect(
      captureAssetService.upload(WS, { inboxItemId: ITEM, file: new Blob([], { type: 'image/png' }) }),
    ).rejects.toThrow(/vazio/i)
  })
})

describe('captureAssetService — cota do modo demo', () => {
  it('recusa antes de ler o arquivo quando ele é grande demais para o navegador', async () => {
    const grande = {
      type: 'image/jpeg',
      size: MAX_BYTES_DEMO + 1,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    }
    await expect(
      captureAssetService.upload(WS, { inboxItemId: ITEM, file: grande }),
    ).rejects.toThrow(/modo demonstração/i)
    // "Antes de ler" nao e figura de linguagem: o arquivo nem foi aberto.
    expect(grande.arrayBuffer).not.toHaveBeenCalled()
  })

  it('QuotaExceededError vira frase em português, não erro cru', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        const err = new Error('exceeded the quota')
        err.name = 'QuotaExceededError'
        throw err
      },
      removeItem: () => {},
    })
    await expect(
      captureAssetService.upload(WS, { inboxItemId: ITEM, file: comoArquivo('image/png', [0x89, 0x50, 0x4e, 0x47]) }),
    ).rejects.toThrow(/armazenamento local do navegador está cheio/i)
  })

  it('reconhece a cota também pelos códigos de Safari e Firefox', () => {
    expect(ehErroDeCota({ name: 'QuotaExceededError' })).toBe(true)
    expect(ehErroDeCota({ code: 22 })).toBe(true)
    expect(ehErroDeCota({ code: 1014 })).toBe(true)
    expect(ehErroDeCota({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(ehErroDeCota(new Error('outra coisa'))).toBe(false)
    expect(ehErroDeCota(null)).toBe(false)
  })
})
