import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO (localStore). Sem rede.
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))

import { reminderService } from './reminderService'
import { localStore } from './localStore'

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  // Perfis com fusos controlados (deterministico).
  localStore.setTable('profiles', [
    { id: USER, timezone: 'America/Sao_Paulo' },
    { id: OTHER, timezone: 'Asia/Tokyo' },
  ])
  localStore.setTable('reminders', [])
})

const mkTask = (over = {}) => ({
  id: 'task-1',
  workspace_id: WS,
  created_by: USER,
  assignee_id: USER,
  status: 'todo',
  alert_enabled: true,
  alert_type: 'in_app',
  alert_minutes_before: 15,
  date: '2026-08-15',
  start_time: '09:00',
  ...over,
})

const all = () => localStore.table('reminders')
const alive = () => all().filter((r) => r.sent === false && r.cancelled_at == null)

describe('reminderService — reconciliacao (demo)', () => {
  it('criar com alerta+hora cria 1 reminder vivo correto', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    expect(alive()).toHaveLength(1)
    const r = alive()[0]
    expect(r.type).toBe('in_app')
    expect(r.minutes_before).toBe(15)
    expect(r.recipient_id).toBe(USER)
    expect(r.created_by).toBe(USER)
    expect(r.remind_at).toBe('2026-08-15T11:45:00.000Z') // 09:00-03 = 12:00Z, -15
  })

  it('sem alerta -> nenhum reminder', async () => {
    await reminderService.syncForTask(mkTask({ alert_enabled: false }), { actorId: USER })
    expect(all()).toHaveLength(0)
  })

  it('alerta sem horario -> nenhum reminder', async () => {
    await reminderService.syncForTask(mkTask({ start_time: null }), { actorId: USER })
    expect(all()).toHaveLength(0)
  })

  it('idempotente: sincronizar 2x nao duplica', async () => {
    const t = mkTask()
    await reminderService.syncForTask(t, { actorId: USER })
    await reminderService.syncForTask(t, { actorId: USER })
    expect(alive()).toHaveLength(1)
  })

  it('editar so o titulo (mesmos campos de alerta) -> no-op', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    const before = alive()[0]
    await reminderService.syncForTask(mkTask({ title: 'outro' }), { actorId: USER })
    expect(alive()).toHaveLength(1)
    expect(alive()[0].id).toBe(before.id)
    expect(alive()[0].remind_at).toBe(before.remind_at)
  })

  it('alterar horario -> atualiza remind_at do mesmo reminder vivo', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    const id0 = alive()[0].id
    await reminderService.syncForTask(mkTask({ start_time: '10:00' }), { actorId: USER })
    expect(alive()).toHaveLength(1)
    expect(alive()[0].id).toBe(id0) // mesma identidade (type, minutes_before)
    expect(alive()[0].remind_at).toBe('2026-08-15T12:45:00.000Z') // 10:00-03=13:00Z -15
  })

  it('alterar minutes_before -> cancela o antigo e cria um novo', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    await reminderService.syncForTask(mkTask({ alert_minutes_before: 60 }), { actorId: USER })
    expect(alive()).toHaveLength(1)
    expect(alive()[0].minutes_before).toBe(60)
    const cancelled = all().filter((r) => r.cancelled_at != null)
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0].minutes_before).toBe(15)
  })

  it('desativar alerta -> cancela reminders vivos (preserva historico)', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    await reminderService.syncForTask(mkTask({ alert_enabled: false }), { actorId: USER })
    expect(alive()).toHaveLength(0)
    expect(all()).toHaveLength(1)
    expect(all()[0].cancelled_at).toBeTruthy()
  })

  it('reativar -> cria novo vivo e mantem o cancelado como historico', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    await reminderService.syncForTask(mkTask({ alert_enabled: false }), { actorId: USER })
    await reminderService.syncForTask(mkTask({ alert_enabled: true }), { actorId: USER })
    expect(alive()).toHaveLength(1)
    expect(all()).toHaveLength(2) // 1 cancelado (historico) + 1 vivo
  })

  it('status terminal (done) -> cancela reminders vivos', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    await reminderService.syncForTask(mkTask({ status: 'done' }), { actorId: USER })
    expect(alive()).toHaveLength(0)
  })

  it('cancelar/missed/not_needed tambem cancelam', async () => {
    for (const status of ['cancelled', 'missed', 'not_needed']) {
      localStore.setTable('reminders', [])
      await reminderService.syncForTask(mkTask(), { actorId: USER })
      await reminderService.syncForTask(mkTask({ status }), { actorId: USER })
      expect(alive(), status).toHaveLength(0)
    }
  })

  it('rescheduled continua ATIVO (reagendar mantem/atualiza o lembrete)', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    await reminderService.syncForTask(
      mkTask({ status: 'rescheduled', date: '2026-08-20' }),
      { actorId: USER },
    )
    expect(alive()).toHaveLength(1)
    expect(alive()[0].remind_at).toBe('2026-08-20T11:45:00.000Z')
  })

  it('delegar: troca recipient e recalcula remind_at no fuso do novo destinatario', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    expect(alive()[0].recipient_id).toBe(USER)
    await reminderService.syncForTask(
      mkTask({ status: 'delegated', assignee_id: OTHER }),
      { actorId: USER },
    )
    expect(alive()).toHaveLength(1)
    expect(alive()[0].recipient_id).toBe(OTHER)
    // Asia/Tokyo (+9): 09:00 = 00:00Z, -15 = dia anterior 23:45Z
    expect(alive()[0].remind_at).toBe('2026-08-14T23:45:00.000Z')
  })

  it('recipient = created_by quando nao ha assignee', async () => {
    await reminderService.syncForTask(mkTask({ assignee_id: null }), { actorId: USER })
    expect(alive()[0].recipient_id).toBe(USER)
  })

  it('reminder sent=true NAO e tratado como vivo (nao bloqueia novo vivo)', async () => {
    localStore.setTable('reminders', [
      { id: 'old', workspace_id: WS, task_id: 'task-1', type: 'in_app', minutes_before: 15,
        sent: true, cancelled_at: null, remind_at: '2026-01-01T00:00:00.000Z' },
    ])
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    expect(alive()).toHaveLength(1)           // novo vivo criado
    expect(all().find((r) => r.id === 'old').sent).toBe(true) // enviado intacto
  })

  it('onTaskDeleted remove os reminders da task (demo)', async () => {
    await reminderService.syncForTask(mkTask(), { actorId: USER })
    await reminderService.onTaskDeleted(mkTask())
    expect(all()).toHaveLength(0)
  })

  it('isolamento por workspace: sync de uma task nao toca reminder de outro ws', async () => {
    localStore.setTable('reminders', [
      { id: 'x', workspace_id: 'ws-outro', task_id: 'task-1', type: 'in_app', minutes_before: 15,
        sent: false, cancelled_at: null, remind_at: '2026-01-01T00:00:00.000Z' },
    ])
    await reminderService.syncForTask(mkTask({ alert_enabled: false }), { actorId: USER })
    // o reminder de outro workspace permanece vivo/intacto
    expect(all().find((r) => r.id === 'x').cancelled_at).toBeNull()
  })
})
