import { describe, it, expect, beforeEach, vi } from 'vitest'

// Caminho SUPABASE (isSupabaseConfigured=true): os services reais rodam seus
// ramos Supabase atraves do captureService. Prova a fiacao ponta-a-ponta do
// caminho feliz (compensacao ja coberta no modo demo).
const captured = { upload: null, tables: {} }

vi.mock('../lib/supabaseClient', () => {
  const makeChain = (table) => {
    const chain = {
      _last: null,
      insert(payload) {
        (captured.tables[table] ||= []).push(payload)
        chain._last = payload
        return chain
      },
      select() { return chain },
      single: async () => ({ data: { id: chain._last?.id ?? `srv-${table}`, ...(chain._last || {}) }, error: null }),
      then(resolve) { resolve({ error: null }) }, // recordEvent: await insert()
    }
    return chain
  }
  const supabase = {
    from: (table) => makeChain(table),
    storage: {
      from: (bucket) => ({
        upload: async (path, _file, opts) => {
          captured.upload = { bucket, path, opts }
          return { data: { path }, error: null }
        },
      }),
    },
  }
  return { supabase, isSupabaseConfigured: true }
})
vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { captureService } from './captureService'

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const photo = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })

beforeEach(() => {
  captured.upload = null
  captured.tables = {}
})

describe('captureService — caminho Supabase (happy path)', () => {
  it('faz upload no bucket, insere inbox_item (id pre-gerado) e inbox_attachment', async () => {
    const cap = await captureService.capture(WS, USER, { file: photo(), channel: 'photo' })

    // Storage
    expect(captured.upload.bucket).toBe('captures')
    expect(captured.upload.path.startsWith(`${WS}/${cap.id}/`)).toBe(true)
    expect(captured.upload.opts).toMatchObject({ contentType: 'image/png', upsert: false })

    // InboxItem inserido com o id pre-gerado
    expect(captured.tables.inbox_items).toHaveLength(1)
    expect(captured.tables.inbox_items[0]).toMatchObject({ id: cap.id, type: 'note', status: 'inbox' })

    // Descritor inserido, apontando para o mesmo InboxItem
    expect(captured.tables.inbox_attachments).toHaveLength(1)
    expect(captured.tables.inbox_attachments[0]).toMatchObject({
      inbox_item_id: cap.id,
      kind: 'image',
      storage_bucket: 'captures',
      mime: 'image/png',
      created_by: USER,
    })

    // Objeto unico coerente
    expect(cap.item.id).toBe(cap.id)
    expect(cap.attachment.inbox_item_id).toBe(cap.id)
    expect(cap.channel).toBe('photo')
  })
})
