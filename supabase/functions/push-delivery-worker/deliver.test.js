import { describe, it, expect } from 'vitest'
import { deliverDuePushNotifications, DEFAULT_MAX_ATTEMPTS } from './deliver.ts'

// ===========================================================================
// Testes da LOGICA PURA de entrega. `db` FALSO simula supabase-js para
// notifications/tasks/push_subscriptions; `sendPush` FALSO simula o envio
// HTTP (sem rede/Deno). Relogio (`now`) sempre deterministico.
// ===========================================================================

const NOW = '2026-08-16T12:00:00.000Z'
const VAPID = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:ops@agenda360.app' }

function makeDb({ notifications = [], tasks = [], subscriptions = [] } = {}) {
  const state = {
    notifications: notifications.map((n) => ({ ...n })),
    tasks: [...tasks],
    subscriptions: subscriptions.map((s) => ({ ...s })),
  }
  const calls = { notifUpdates: [], subUpdates: [] }

  function parseOr(orExpr) {
    // suporta exatamente o formato usado por deliver.ts:
    // "status.eq.pending,and(status.eq.processing,claimed_at.lt.<iso>)"
    const [pendingPart, staleGroup] = orExpr.split(',and(')
    const staleIso = staleGroup ? staleGroup.replace('status.eq.processing,claimed_at.lt.', '').replace(')', '') : null
    return { pendingPart, staleIso }
  }

  function notificationsQuery() {
    const filters = { eq: {}, lte: {}, is: {}, in: {} }
    let orExpr = null
    let order = null
    let limit = Infinity
    let updatePatch = null
    let mode = 'select'
    const q = {
      select(_cols) {
        if (mode === 'update_pending') return q
        return q
      },
      update(patch) {
        mode = 'update'
        updatePatch = patch
        return q
      },
      eq(col, val) {
        filters.eq[col] = val
        return q
      },
      lte(col, val) {
        filters.lte[col] = val
        return q
      },
      is(col, val) {
        filters.is[col] = val
        return q
      },
      in(col, vals) {
        filters.in[col] = vals
        return q
      },
      or(expr) {
        orExpr = expr
        return q
      },
      order(col, o) {
        order = { col, asc: o?.ascending !== false }
        return q
      },
      limit(n) {
        limit = n
        return q
      },
      then(resolve) {
        let rows = state.notifications.filter((r) => {
          for (const [k, v] of Object.entries(filters.eq)) if (r[k] !== v) return false
          for (const [k, v] of Object.entries(filters.lte)) if (!(r[k] <= v)) return false
          if (orExpr) {
            const { staleIso } = parseOr(orExpr)
            const isPending = r.status === 'pending'
            const isStale = r.status === 'processing' && staleIso && r.claimed_at && r.claimed_at < staleIso
            if (!isPending && !isStale) return false
          }
          return true
        })
        if (mode === 'update') {
          for (const r of rows) {
            Object.assign(r, updatePatch)
            calls.notifUpdates.push({ id: r.id, patch: { ...updatePatch } })
          }
          resolve({ data: rows.map((r) => ({ id: r.id })), error: null })
          return
        }
        if (order) rows = [...rows].sort((a, b) => (a[order.col] < b[order.col] ? -1 : 1))
        if (limit < Infinity) rows = rows.slice(0, limit)
        resolve({ data: rows, error: null })
      },
    }
    return q
  }

  function tasksQuery() {
    const q = {
      select: () => q,
      in(_col, vals) {
        return {
          then(resolve) {
            resolve({ data: state.tasks.filter((t) => vals.includes(t.id)), error: null })
          },
        }
      },
    }
    return q
  }

  function subsQuery() {
    let inVals = null
    let isNull = null
    let updatePatch = null
    let mode = 'select'
    let eqId = null
    const q = {
      select: () => q,
      update(patch) {
        mode = 'update'
        updatePatch = patch
        return q
      },
      in(_col, vals) {
        inVals = vals
        return q
      },
      is(_col, val) {
        isNull = val
        return q
      },
      eq(_col, val) {
        eqId = val
        return q
      },
      then(resolve) {
        if (mode === 'update') {
          const row = state.subscriptions.find((s) => s.id === eqId)
          if (row) {
            Object.assign(row, updatePatch)
            calls.subUpdates.push({ id: row.id, patch: { ...updatePatch } })
          }
          resolve({ data: row ? [row] : [], error: null })
          return
        }
        let rows = state.subscriptions
        if (inVals) rows = rows.filter((s) => inVals.includes(s.user_id))
        if (isNull === null) rows = rows.filter((s) => s.disabled_at == null)
        resolve({ data: rows, error: null })
      },
    }
    return q
  }

  const db = {
    from(table) {
      if (table === 'notifications') return notificationsQuery()
      if (table === 'tasks') return tasksQuery()
      if (table === 'push_subscriptions') return subsQuery()
      throw new Error(`tabela inesperada: ${table}`)
    },
  }
  return { db, state, calls }
}

describe('deliverDuePushNotifications', () => {
  it('entrega com sucesso: status=sent, sent_at preenchido, 1 chamada de push', async () => {
    const { db, state } = makeDb({
      notifications: [
        { id: 'n1', task_id: 't1', user_id: 'u1', channel: 'push', status: 'pending', attempts: 0, scheduled_for: '2026-08-16T11:00:00.000Z' },
      ],
      tasks: [{ id: 't1', title: 'Reuniao gerencial', date: '2026-08-16', start_time: '08:00:00', category: { name: 'Reuniao' } }],
      subscriptions: [{ id: 's1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a', disabled_at: null }],
    })
    let sentPayload = null
    const sendPush = async (sub, payload) => {
      sentPayload = payload
      return { ok: true, status: 201, expired: false }
    }
    const counters = await deliverDuePushNotifications(db, { now: NOW, vapid: VAPID, sendPush })
    expect(counters).toMatchObject({ found: 1, sent: 1, retried: 0, failed: 0, skipped: 0, errors: 0 })
    expect(state.notifications[0].status).toBe('sent')
    expect(state.notifications[0].sent_at).toBe(NOW)
    expect(sentPayload.title).toBe('Agenda 360')
    expect(sentPayload.body).toContain('Reuniao gerencial')
    expect(sentPayload.body).toContain('08:00')
    expect(sentPayload.data.taskId).toBe('t1')
    expect(sentPayload.data.url).toContain('/dia?date=2026-08-16&task=t1')
  })

  it('multi-dispositivo: sucesso em pelo menos um marca sent; desativa o expirado', async () => {
    const { db, state, calls } = makeDb({
      notifications: [{ id: 'n1', task_id: null, user_id: 'u1', channel: 'push', status: 'pending', attempts: 0, scheduled_for: '2026-08-16T11:00:00.000Z' }],
      subscriptions: [
        { id: 's1', user_id: 'u1', endpoint: 'https://push/old', p256dh: 'p', auth: 'a', disabled_at: null },
        { id: 's2', user_id: 'u1', endpoint: 'https://push/new', p256dh: 'p', auth: 'a', disabled_at: null },
      ],
    })
    const sendPush = async (sub) => {
      if (sub.endpoint === 'https://push/old') return { ok: false, status: 410, expired: true }
      return { ok: true, status: 201, expired: false }
    }
    const counters = await deliverDuePushNotifications(db, { now: NOW, vapid: VAPID, sendPush })
    expect(counters.sent).toBe(1)
    expect(counters.disabled_subscriptions).toBe(1)
    expect(state.notifications[0].status).toBe('sent')
    expect(calls.subUpdates).toEqual([{ id: 's1', patch: { disabled_at: NOW, disabled_reason: 'http_410' } }])
  })

  it('sem subscription ativa: retry ate maxAttempts, depois failed', async () => {
    const { db, state } = makeDb({
      notifications: [{ id: 'n1', task_id: null, user_id: 'u1', channel: 'push', status: 'pending', attempts: DEFAULT_MAX_ATTEMPTS - 1, scheduled_for: '2026-08-16T11:00:00.000Z' }],
      subscriptions: [],
    })
    const counters = await deliverDuePushNotifications(db, { now: NOW, vapid: VAPID, sendPush: async () => ({ ok: true, status: 201, expired: false }) })
    expect(counters.failed).toBe(1)
    expect(state.notifications[0].status).toBe('failed')
    expect(state.notifications[0].last_error).toBe('no_active_subscription')
  })

  it('falha transitoria (5xx): volta para pending com attempts incrementado (retry)', async () => {
    const { db, state } = makeDb({
      notifications: [{ id: 'n1', task_id: null, user_id: 'u1', channel: 'push', status: 'pending', attempts: 0, scheduled_for: '2026-08-16T11:00:00.000Z' }],
      subscriptions: [{ id: 's1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a', disabled_at: null }],
    })
    const counters = await deliverDuePushNotifications(db, { now: NOW, vapid: VAPID, sendPush: async () => ({ ok: false, status: 500, expired: false }) })
    expect(counters.retried).toBe(1)
    expect(state.notifications[0].status).toBe('pending')
    expect(state.notifications[0].attempts).toBe(1)
  })

  it('idempotencia: notification ja em processing (nao estagnada) e pulada', async () => {
    const { db, state } = makeDb({
      notifications: [{ id: 'n1', task_id: null, user_id: 'u1', channel: 'push', status: 'processing', claimed_at: '2026-08-16T11:59:00.000Z', attempts: 0, scheduled_for: '2026-08-16T11:00:00.000Z' }],
      subscriptions: [{ id: 's1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a', disabled_at: null }],
    })
    const sendPush = async () => ({ ok: true, status: 201, expired: false })
    const counters = await deliverDuePushNotifications(db, { now: NOW, vapid: VAPID, sendPush, staleMinutes: 5 })
    // claimed_at (11:59) NAO e anterior ao limiar de estagnacao (12:00 - 5min = 11:55) -> nao elegivel.
    expect(counters.found).toBe(0)
    expect(state.notifications[0].status).toBe('processing')
  })

  it('recuperacao: notification estagnada em processing ha mais de staleMinutes e reprocessada', async () => {
    const { db, state } = makeDb({
      notifications: [{ id: 'n1', task_id: null, user_id: 'u1', channel: 'push', status: 'processing', claimed_at: '2026-08-16T11:00:00.000Z', attempts: 1, scheduled_for: '2026-08-16T10:00:00.000Z' }],
      subscriptions: [{ id: 's1', user_id: 'u1', endpoint: 'https://push/1', p256dh: 'p', auth: 'a', disabled_at: null }],
    })
    const sendPush = async () => ({ ok: true, status: 201, expired: false })
    const counters = await deliverDuePushNotifications(db, { now: NOW, vapid: VAPID, sendPush, staleMinutes: 5 })
    expect(counters.found).toBe(1)
    expect(counters.sent).toBe(1)
    expect(state.notifications[0].status).toBe('sent')
  })

  it('nada vencido: retorna contadores zerados sem tocar o banco', async () => {
    const { db } = makeDb({ notifications: [] })
    const counters = await deliverDuePushNotifications(db, { now: NOW, vapid: VAPID, sendPush: async () => ({ ok: true, status: 201, expired: false }) })
    expect(counters).toEqual({ found: 0, sent: 0, retried: 0, failed: 0, skipped: 0, disabled_subscriptions: 0, errors: 0 })
  })
})
