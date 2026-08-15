import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))
vi.mock('./logService', () => ({
  logService: { record: vi.fn().mockResolvedValue(null), list: vi.fn() },
}))

import { taskService } from './taskService'
import { reminderService } from './reminderService'
import { localStore } from './localStore'

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  vi.restoreAllMocks()
  localStore.setTable('profiles', [{ id: USER, timezone: 'America/Sao_Paulo' }])
  localStore.setTable('reminders', [])
  localStore.setTable('tasks', [])
})

const alive = () => localStore.table('reminders').filter((r) => r.sent === false && r.cancelled_at == null)
const withAlert = { title: 'Reuniao', date: '2026-08-15', start_time: '09:00', alert_enabled: true, alert_minutes_before: 15 }

describe('taskService -> reminderService (integracao, demo)', () => {
  it('criar task com alerta dispara a sincronizacao (cria reminder)', async () => {
    await taskService.create(WS, USER, withAlert)
    expect(alive()).toHaveLength(1)
    expect(alive()[0].recipient_id).toBe(USER)
  })

  it('criar task sem alerta nao cria reminder', async () => {
    await taskService.create(WS, USER, { title: 'Sem alerta', date: '2026-08-15', start_time: '09:00' })
    expect(alive()).toHaveLength(0)
  })

  it('editar horario reconcilia o remind_at', async () => {
    const t = await taskService.create(WS, USER, withAlert)
    await taskService.update(USER, t, { start_time: '10:00' })
    expect(alive()).toHaveLength(1)
    expect(alive()[0].remind_at).toBe('2026-08-15T12:45:00.000Z')
  })

  it('editar apenas o titulo NAO chama a sincronizacao (gate por campos)', async () => {
    const t = await taskService.create(WS, USER, withAlert)
    const spy = vi.spyOn(reminderService, 'syncForTask')
    await taskService.update(USER, t, { title: 'novo titulo' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('concluir (changeStatus done) cancela os reminders vivos', async () => {
    const t = await taskService.create(WS, USER, withAlert)
    await taskService.changeStatus(USER, t, 'done')
    expect(alive()).toHaveLength(0)
  })

  it('excluir remove os reminders da task', async () => {
    const t = await taskService.create(WS, USER, withAlert)
    await taskService.remove(USER, t)
    expect(localStore.table('reminders')).toHaveLength(0)
  })

  it('falha de sync: task e salva e o retorno sinaliza reminder_sync_failed', async () => {
    vi.spyOn(reminderService, 'syncForTask').mockRejectedValueOnce(new Error('supabase indisponivel'))
    const saved = await taskService.create(WS, USER, withAlert)
    expect(saved.reminder_sync_failed).toBe(true)   // aviso surfavel na UI
    expect(saved.title).toBe('Reuniao')
    // a task foi persistida mesmo com o reminder falhando (nao revertida)
    expect(localStore.table('tasks').find((t) => t.id === saved.id)).toBeTruthy()
  })
})
