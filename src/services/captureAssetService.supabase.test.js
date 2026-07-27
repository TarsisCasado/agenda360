import { describe, it, expect, beforeEach, vi } from 'vitest'

// Caminho SUPABASE (isSupabaseConfigured = true): prova que o PORT chama o
// Storage com bucket/path/args corretos, sem depender de rede.
const captured = { bucket: null, uploadPath: null, uploadOpts: null, signPath: null, removeArg: null }

vi.mock('../lib/supabaseClient', () => {
  const storage = {
    from: (bucket) => {
      captured.bucket = bucket
      return {
        upload: async (path, _file, opts) => {
          captured.uploadPath = path
          captured.uploadOpts = opts
          return { data: { path }, error: null }
        },
        createSignedUrl: async (path) => {
          captured.signPath = path
          return { data: { signedUrl: `https://signed.example/${path}` }, error: null }
        },
        remove: async (paths) => {
          captured.removeArg = paths
          return { data: {}, error: null }
        },
      }
    },
  }
  return { supabase: { storage }, isSupabaseConfigured: true }
})

import { captureAssetService, CAPTURE_BUCKET } from './captureAssetService'

const WS = '00000000-0000-4000-8000-0000000000b1'
const ITEM = 'inbox-1'
const file = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

beforeEach(() => {
  captured.bucket = null
  captured.uploadPath = null
  captured.uploadOpts = null
  captured.signPath = null
  captured.removeArg = null
})

describe('captureAssetService — Storage do Supabase', () => {
  it('upload usa o bucket privado, path por workspace/item e contentType', async () => {
    const d = await captureAssetService.upload(WS, { inboxItemId: ITEM, file: file() })
    expect(captured.bucket).toBe(CAPTURE_BUCKET)
    expect(captured.uploadPath).toBe(d.storage_path)
    expect(captured.uploadPath.startsWith(`${WS}/${ITEM}/`)).toBe(true)
    expect(captured.uploadOpts).toMatchObject({ contentType: 'image/png', upsert: false })
    expect(d.storage_bucket).toBe(CAPTURE_BUCKET)
    expect(d.kind).toBe('image')
  })

  it('getViewUrl gera URL assinada para o path', async () => {
    const url = await captureAssetService.getViewUrl({
      storage_bucket: CAPTURE_BUCKET,
      storage_path: `${WS}/${ITEM}/abc.png`,
    })
    expect(captured.signPath).toBe(`${WS}/${ITEM}/abc.png`)
    expect(url).toBe(`https://signed.example/${WS}/${ITEM}/abc.png`)
  })

  it('remove chama storage.remove com o path em array', async () => {
    await captureAssetService.remove({ storage_bucket: CAPTURE_BUCKET, storage_path: `${WS}/${ITEM}/abc.png` })
    expect(captured.removeArg).toEqual([`${WS}/${ITEM}/abc.png`])
  })
})
