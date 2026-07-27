import { describe, it, expect, beforeEach, vi } from 'vitest'

// Caminho SUPABASE: prova o payload/filtros enviados ao PostgREST.
const captured = { table: null, insert: null, filters: [], deleted: false, listResult: [] }

vi.mock('../lib/supabaseClient', () => {
  const chain = {
    insert(payload) { captured.insert = payload; return chain },
    select() { return chain },
    single: async () => ({ data: { id: 'att-1', created_at: 't', ...(captured.insert || {}) }, error: null }),
    eq(col, val) { captured.filters.push([col, val]); return chain },
    in(col, vals) { captured.filters.push([col, vals]); return chain },
    order() { return chain },
    delete() { captured.deleted = true; return chain },
    then(resolve) { resolve({ data: captured.listResult, error: null }) },
  }
  const supabase = { from: (t) => { captured.table = t; return chain } }
  return { supabase, isSupabaseConfigured: true }
})

import { inboxAttachmentService } from './inboxAttachmentService'

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  captured.table = null
  captured.insert = null
  captured.filters = []
  captured.deleted = false
  captured.listResult = []
})

describe('inboxAttachmentService — payload Supabase', () => {
  it('create envia todos os campos do descritor + created_by, sem id/created_at', async () => {
    const saved = await inboxAttachmentService.create(WS, USER, {
      inbox_item_id: 'inbox-1',
      kind: 'image',
      storage_bucket: 'captures',
      storage_path: `${WS}/inbox-1/abc.png`,
      mime: 'image/png',
      bytes: 12345,
      width: 800,
      height: 600,
    })
    expect(captured.table).toBe('inbox_attachments')
    expect(captured.insert).toMatchObject({
      workspace_id: WS,
      inbox_item_id: 'inbox-1',
      kind: 'image',
      storage_bucket: 'captures',
      storage_path: `${WS}/inbox-1/abc.png`,
      mime: 'image/png',
      bytes: 12345,
      width: 800,
      height: 600,
      created_by: USER,
    })
    // metadados gerados pelo banco NAO sao enviados
    expect(captured.insert.id).toBeUndefined()
    expect(captured.insert.created_at).toBeUndefined()
    expect(saved.id).toBe('att-1')
  })

  it('listByInboxItem filtra por workspace_id e inbox_item_id', async () => {
    captured.listResult = [{ id: 'att-1', inbox_item_id: 'inbox-1' }]
    const rows = await inboxAttachmentService.listByInboxItem(WS, 'inbox-1')
    expect(captured.filters).toContainEqual(['workspace_id', WS])
    expect(captured.filters).toContainEqual(['inbox_item_id', 'inbox-1'])
    expect(rows).toHaveLength(1)
  })

  it('remove filtra por id e workspace_id (escopo do workspace)', async () => {
    await inboxAttachmentService.remove(WS, 'att-1')
    expect(captured.deleted).toBe(true)
    expect(captured.filters).toContainEqual(['id', 'att-1'])
    expect(captured.filters).toContainEqual(['workspace_id', WS])
  })
})
