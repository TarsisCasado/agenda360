import { describe, it, expect, beforeEach, vi } from 'vitest'

// Prova que, no caminho SUPABASE (isSupabaseConfigured = true), o payload
// enviado ao banco NUNCA contem "" em date/start_time/end_time — sempre null.
// Cobre a causa raiz do erro de producao: invalid input syntax for type date: "".

// Captura o objeto realmente enviado ao PostgREST.
const captured = { insert: null, update: null }

vi.mock('../lib/supabaseClient', () => {
  const single = (data) => ({ single: async () => ({ data, error: null }) })
  const supabase = {
    from: () => ({
      insert: (payload) => {
        captured.insert = payload
        return { select: () => single({ id: 'srv-1', ...payload }) }
      },
      update: (payload) => {
        captured.update = payload
        return { eq: () => ({ select: () => single({ id: 'srv-1', ...payload }) }) }
      },
    }),
  }
  return { supabase, isSupabaseConfigured: true }
})

vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { taskService } from './taskService'

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  captured.insert = null
  captured.update = null
})

describe('T1.2A — Supabase recebe null, nunca "" (date/time)', () => {
  it('create sem data envia date/start/end = null', async () => {
    await taskService.create(WS, USER, {
      title: 'Sem data',
      date: '',
      start_time: '',
      end_time: '',
    })
    expect(captured.insert.date).toBeNull()
    expect(captured.insert.start_time).toBeNull()
    expect(captured.insert.end_time).toBeNull()
    expect(captured.insert.date).not.toBe('')
  })

  it('create com data valida envia a data e horarios "" como null', async () => {
    await taskService.create(WS, USER, {
      title: 'Com data',
      date: '2026-07-20',
      start_time: '',
      end_time: '',
    })
    expect(captured.insert.date).toBe('2026-07-20')
    expect(captured.insert.start_time).toBeNull()
    expect(captured.insert.end_time).toBeNull()
  })

  it('update com date="" envia date = null (nunca "")', async () => {
    const task = { id: 'srv-1', workspace_id: WS, date: '2026-07-20' }
    await taskService.update(USER, task, { date: '' })
    expect(captured.update.date).toBeNull()
    expect(captured.update.date).not.toBe('')
    expect(captured.update.start_time).toBeNull()
    expect(captured.update.end_time).toBeNull()
  })
})
