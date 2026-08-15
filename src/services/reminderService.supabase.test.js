import { describe, it, expect, beforeEach, vi } from 'vitest'

// Caminho SUPABASE: prova payload de insert, filtros de listAlive, tratamento
// de 23505 (concorrencia) e uso do timezone do destinatario — sem rede.
const state = {
  profileTz: 'America/Sao_Paulo',
  existing: [],
  insertError: null,
  captured: { insert: null, filters: [], updates: [] },
}

vi.mock('../lib/supabaseClient', () => {
  const remindersChain = () => {
    const c = {
      _op: null,
      _patch: null,
      select() { return c },
      insert(payload) { state.captured.insert = payload; c._op = 'insert'; return c },
      update(patch) { c._op = 'update'; c._patch = patch; return c },
      eq(col, val) { state.captured.filters.push([col, val]); return c },
      is(col, val) { state.captured.filters.push([col, val]); return c },
      single: async () => {
        if (state.insertError) return { data: null, error: state.insertError }
        return { data: { id: 'new-id', ...state.captured.insert }, error: null }
      },
      then(resolve) {
        if (c._op === 'update') { state.captured.updates.push(c._patch); resolve({ error: null }); return }
        resolve({ data: state.existing, error: null })
      },
    }
    return c
  }
  const profilesChain = () => ({
    select() { return this },
    eq() { return this },
    maybeSingle: async () => ({ data: { timezone: state.profileTz }, error: null }),
  })
  const supabase = { from: (t) => (t === 'profiles' ? profilesChain() : remindersChain()) }
  return { supabase, isSupabaseConfigured: true }
})

import { reminderService } from './reminderService'

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const task = (over = {}) => ({
  id: 'task-1', workspace_id: WS, created_by: USER, assignee_id: USER, status: 'todo',
  alert_enabled: true, alert_type: 'in_app', alert_minutes_before: 15,
  date: '2026-08-15', start_time: '09:00', ...over,
})

beforeEach(() => {
  state.profileTz = 'America/Sao_Paulo'
  state.existing = []
  state.insertError = null
  state.captured = { insert: null, filters: [], updates: [] }
})

describe('reminderService — caminho Supabase', () => {
  it('insere reminder com payload correto e remind_at no fuso do destinatario', async () => {
    await reminderService.syncForTask(task(), { actorId: USER })
    expect(state.captured.insert).toMatchObject({
      workspace_id: WS,
      task_id: 'task-1',
      created_by: USER,
      recipient_id: USER,
      type: 'in_app',
      minutes_before: 15,
      remind_at: '2026-08-15T11:45:00.000Z',
      sent: false,
      cancelled_at: null,
    })
  })

  it('listAlive filtra por sent=false e cancelled_at is null', async () => {
    await reminderService.syncForTask(task(), { actorId: USER })
    expect(state.captured.filters).toContainEqual(['sent', false])
    expect(state.captured.filters).toContainEqual(['cancelled_at', null])
    expect(state.captured.filters).toContainEqual(['task_id', 'task-1'])
    expect(state.captured.filters).toContainEqual(['workspace_id', WS])
  })

  it('23505 na criacao concorrente e IDEMPOTENTE (nao lanca)', async () => {
    state.insertError = { code: '23505', message: 'duplicate key' }
    await expect(reminderService.syncForTask(task(), { actorId: USER })).resolves.toBeUndefined()
  })

  it('outros erros de banco PROPAGAM (falha de sync surfavel)', async () => {
    state.insertError = { code: '42501', message: 'permission denied' }
    await expect(reminderService.syncForTask(task(), { actorId: USER })).rejects.toBeTruthy()
  })

  it('usa o timezone do destinatario retornado por profiles', async () => {
    state.profileTz = 'Asia/Tokyo'
    await reminderService.syncForTask(task(), { actorId: USER })
    expect(state.captured.insert.remind_at).toBe('2026-08-14T23:45:00.000Z')
  })
})
