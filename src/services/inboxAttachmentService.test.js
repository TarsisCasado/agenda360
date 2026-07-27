import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO (sem Supabase).
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { inboxAttachmentService } from './inboxAttachmentService'
import { inboxService } from './inboxService'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const WS2 = '00000000-0000-4000-8000-0000000000b2'
const USER = '00000000-0000-4000-8000-000000000001'

const descriptor = (over = {}) => ({
  inbox_item_id: 'inbox-1',
  kind: 'image',
  storage_bucket: 'captures',
  storage_path: `${WS}/inbox-1/abc.png`,
  mime: 'image/png',
  bytes: 4,
  ...over,
})

describe('inboxAttachmentService — persistencia do descritor (demo)', () => {
  it('create grava o descritor com id, created_at e created_by', async () => {
    const a = await inboxAttachmentService.create(WS, USER, descriptor())
    expect(a.id).toBeTruthy()
    expect(a.created_at).toBeTruthy()
    expect(a.created_by).toBe(USER)
    expect(a.workspace_id).toBe(WS)
    expect(a.inbox_item_id).toBe('inbox-1')
    expect(a.kind).toBe('image')
    expect(a.storage_bucket).toBe('captures')
    expect(a.storage_path).toBe(`${WS}/inbox-1/abc.png`)
    expect(a.mime).toBe('image/png')
    expect(a.bytes).toBe(4)
  })

  it('width/height sao opcionais (null por padrao; preservados quando enviados)', async () => {
    const semWH = await inboxAttachmentService.create(WS, USER, descriptor({ storage_path: `${WS}/inbox-1/a.png` }))
    expect(semWH.width).toBeNull()
    expect(semWH.height).toBeNull()
    const comWH = await inboxAttachmentService.create(WS, USER, descriptor({ storage_path: `${WS}/inbox-1/b.png`, width: 800, height: 600 }))
    expect(comWH.width).toBe(800)
    expect(comWH.height).toBe(600)
  })

  it('listByInboxItem retorna os anexos daquele item', async () => {
    await inboxAttachmentService.create(WS, USER, descriptor({ storage_path: `${WS}/inbox-1/1.png` }))
    await inboxAttachmentService.create(WS, USER, descriptor({ storage_path: `${WS}/inbox-1/2.png` }))
    await inboxAttachmentService.create(WS, USER, descriptor({ inbox_item_id: 'inbox-2', storage_path: `${WS}/inbox-2/1.png` }))
    const list = await inboxAttachmentService.listByInboxItem(WS, 'inbox-1')
    expect(list).toHaveLength(2)
    expect(list.every((a) => a.inbox_item_id === 'inbox-1')).toBe(true)
  })

  it('remove apaga somente a linha do descritor informado', async () => {
    const a = await inboxAttachmentService.create(WS, USER, descriptor())
    await inboxAttachmentService.remove(WS, a.id)
    expect(await inboxAttachmentService.listByInboxItem(WS, 'inbox-1')).toHaveLength(0)
  })

  it('isolamento por workspace: nao lista anexo de outro workspace', async () => {
    await inboxAttachmentService.create(WS, USER, descriptor({ storage_path: `${WS}/inbox-1/x.png` }))
    await inboxAttachmentService.create(WS2, USER, descriptor({ storage_path: `${WS2}/inbox-1/y.png` }))
    const own = await inboxAttachmentService.listByInboxItem(WS, 'inbox-1')
    expect(own).toHaveLength(1)
    expect(own[0].workspace_id).toBe(WS)
    // remove escopado por workspace: nao apaga do outro workspace
    await inboxAttachmentService.remove(WS, own[0].id)
    expect(await inboxAttachmentService.listByInboxItem(WS2, 'inbox-1')).toHaveLength(1)
  })

  it('aceita conceitualmente image | pdf | audio | file', async () => {
    for (const kind of ['image', 'pdf', 'audio', 'file']) {
      const a = await inboxAttachmentService.create(WS, USER, descriptor({ kind, storage_path: `${WS}/inbox-9/${kind}.bin` }))
      expect(a.kind).toBe(kind)
    }
  })

  it('mapByInboxItems agrupa por item (lote)', async () => {
    await inboxAttachmentService.create(WS, USER, descriptor({ inbox_item_id: 'i1', storage_path: `${WS}/i1/a.png` }))
    await inboxAttachmentService.create(WS, USER, descriptor({ inbox_item_id: 'i1', storage_path: `${WS}/i1/b.png` }))
    await inboxAttachmentService.create(WS, USER, descriptor({ inbox_item_id: 'i2', storage_path: `${WS}/i2/a.png` }))
    const map = await inboxAttachmentService.mapByInboxItems(WS, ['i1', 'i2'])
    expect(map.i1).toHaveLength(2)
    expect(map.i2).toHaveLength(1)
    expect(await inboxAttachmentService.mapByInboxItems(WS, [])).toEqual({})
  })

  it('service e imutavel: nao expoe update', () => {
    expect(inboxAttachmentService.update).toBeUndefined()
  })

  it('cascade demo: excluir o InboxItem remove os anexos (paridade com a FK)', async () => {
    const note = await inboxService.create(WS, USER, { type: 'note', title: 'com foto' })
    await inboxAttachmentService.create(WS, USER, descriptor({ inbox_item_id: note.id, storage_path: `${WS}/${note.id}/x.png` }))
    expect(await inboxAttachmentService.listByInboxItem(WS, note.id)).toHaveLength(1)
    await inboxService.remove(note)
    expect(await inboxAttachmentService.listByInboxItem(WS, note.id)).toHaveLength(0)
  })
})
