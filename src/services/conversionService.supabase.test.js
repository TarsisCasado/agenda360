import { describe, it, expect, beforeEach, vi } from 'vitest'

// Caminho SUPABASE (isSupabaseConfigured = true): prova que a Task e inserida
// com origin = "inbox" e que o vinculo inbox_task_links recebe os ids corretos.
const captured = { taskInsert: null, linkInsert: null }

vi.mock('../lib/supabaseClient', () => {
  const single = (data) => ({ single: async () => ({ data, error: null }) })
  const supabase = {
    from: (table) => ({
      insert: (payload) => {
        if (table === 'tasks') captured.taskInsert = payload
        if (table === 'inbox_task_links') captured.linkInsert = payload
        return { select: () => single({ id: table === 'tasks' ? 'task-1' : 'link-1', ...payload }) }
      },
    }),
  }
  return { supabase, isSupabaseConfigured: true }
})

vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { conversionService } from './conversionService'

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const inboxItem = { id: 'inbox-1', workspace_id: WS }

beforeEach(() => {
  captured.taskInsert = null
  captured.linkInsert = null
})

describe('T1.2B — conversao (Supabase)', () => {
  it('insere a Task com origin "inbox" e cria o vinculo com os ids corretos', async () => {
    const { task, link } = await conversionService.convertInboxItemToTask(WS, USER, inboxItem, {
      title: 'Captura',
      date: '2026-08-01',
    })
    // Task
    expect(captured.taskInsert.origin).toBe('inbox')
    expect(captured.taskInsert.workspace_id).toBe(WS)
    expect(captured.taskInsert.created_by).toBe(USER)
    expect(task.id).toBe('task-1')
    // Vinculo
    expect(captured.linkInsert.inbox_item_id).toBe('inbox-1')
    expect(captured.linkInsert.task_id).toBe('task-1')
    expect(captured.linkInsert.created_by).toBe(USER)
    expect(link.id).toBe('link-1')
  })
})
