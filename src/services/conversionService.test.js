import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO (sem Supabase): roda 100% local.
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { conversionService } from './conversionService'
import { inboxTaskLinkService } from './inboxTaskLinkService'
import { taskService } from './taskService'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const inboxItem = { id: 'inbox-1', workspace_id: WS, title: 'Captura', content: 'detalhe' }

describe('T1.2B — conversao InboxItem -> Task (demo)', () => {
  it('cria a Task reutilizando o dominio e com origin = "inbox"', async () => {
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, inboxItem, {
      title: 'Captura',
      date: '2026-08-01',
    })
    expect(task.id).toBeTruthy()
    expect(task.title).toBe('Captura')
    expect(task.origin).toBe('inbox')
    expect(task.workspace_id).toBe(WS)
    expect(task.created_by).toBe(USER)
  })

  it('cria o vinculo inbox_task_links (inbox_item_id + task_id)', async () => {
    const { task, link } = await conversionService.convertInboxItemToTask(WS, USER, inboxItem, {
      title: 'Captura',
      date: null,
    })
    expect(link.inbox_item_id).toBe('inbox-1')
    expect(link.task_id).toBe(task.id)
    expect(link.workspace_id).toBe(WS)
    expect(link.created_by).toBe(USER)
  })

  it('convertedMap aponta o InboxItem para o vinculo criado', async () => {
    const { link } = await conversionService.convertInboxItemToTask(WS, USER, inboxItem, {
      title: 'Captura',
      date: null,
    })
    const map = await inboxTaskLinkService.convertedMap(WS)
    expect(map['inbox-1']).toBeTruthy()
    expect(map['inbox-1'].task_id).toBe(link.task_id)
  })

  it('a captura (InboxItem) NAO e alterada pela conversao', async () => {
    // O service de conversao nunca escreve em inbox_items — prova por ausencia:
    // nenhuma task pre-existente e o item passado permanece o mesmo objeto.
    const before = { ...inboxItem }
    await conversionService.convertInboxItemToTask(WS, USER, inboxItem, { title: 'X', date: null })
    expect(inboxItem).toEqual(before)
  })

  it('forca origin "inbox" mesmo se o payload tentar outra origem', async () => {
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, inboxItem, {
      title: 'Captura',
      date: null,
      origin: 'manual',
    })
    expect(task.origin).toBe('inbox')
  })

  it('compensacao: se o vinculo falhar, a Task recem-criada e desfeita (sem orfa)', async () => {
    const spy = vi
      .spyOn(inboxTaskLinkService, 'create')
      .mockRejectedValueOnce(new Error('link indisponivel'))
    await expect(
      conversionService.convertInboxItemToTask(WS, USER, inboxItem, { title: 'X', date: null }),
    ).rejects.toThrow('link indisponivel')
    // Nenhuma Task com origin 'inbox' permaneceu (a criada foi desfeita).
    // (O seed demo tem tarefas, mas nenhuma com origin 'inbox'.)
    const inboxTasks = (await taskService.list(WS, {})).filter((t) => t.origin === 'inbox')
    expect(inboxTasks).toHaveLength(0)
    spy.mockRestore()
  })

  it('paridade demo do cascade: excluida a Task, o vinculo some do convertedMap', async () => {
    const { task } = await conversionService.convertInboxItemToTask(WS, USER, inboxItem, {
      title: 'Captura',
      date: null,
    })
    expect((await inboxTaskLinkService.convertedMap(WS))['inbox-1']).toBeTruthy()
    await taskService.remove(USER, task)
    // Em demo nao ha ON DELETE CASCADE; convertedMap filtra vinculos orfaos.
    expect((await inboxTaskLinkService.convertedMap(WS))['inbox-1']).toBeUndefined()
  })
})
