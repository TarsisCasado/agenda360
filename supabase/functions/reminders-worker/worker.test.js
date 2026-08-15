import { describe, it, expect, beforeEach } from 'vitest'
import { enqueueDueReminders, DEFAULT_BATCH_SIZE } from './worker.ts'

// ===========================================================================
// Testes da LOGICA PURA de enqueue. Sem rede, sem Deno: um `db` FALSO simula
// o supabase-js (filtros de elegibilidade em reminders, UNIQUE(reminder_id,
// channel) -> 23505 em notifications, e erros injetaveis por passo).
// Relogio (`now`) sempre determinstico.
// ===========================================================================

const NOW = '2026-08-15T12:00:00.000Z'

// -------- fake db --------------------------------------------------------
// reminders: array de linhas. notifications: array + UNIQUE(reminder_id,channel).
// hooks: forca erro no insert de notification e/ou no update de reminder.
function makeDb(reminders, opts = {}) {
  const notifications = opts.notifications ? [...opts.notifications] : []
  const hooks = opts.hooks || {}
  const calls = { notifInserts: [], reminderUpdates: [] }

  // Consulta encadeada de reminders (select...eq...is...lte...order...limit).
  function remindersQuery() {
    const filters = { eq: {}, is: {}, lte: {} }
    let order = null
    let limit = Infinity
    const q = {
      select() { return q },
      eq(col, val) { filters.eq[col] = val; return q },
      is(col, val) { filters.is[col] = val; return q },
      lte(col, val) { filters.lte[col] = val; return q },
      order(col, o) { order = { col, asc: o?.ascending !== false }; return q },
      limit(n) { limit = n; return q },
      then(resolve) {
        if (hooks.selectError) { resolve({ data: null, error: hooks.selectError }); return }
        let rows = reminders.filter((r) => {
          if ('sent' in filters.eq && r.sent !== filters.eq.sent) return false
          if ('cancelled_at' in filters.is && r.cancelled_at != null) return false
          if ('remind_at' in filters.lte && !(r.remind_at <= filters.lte.remind_at)) return false
          return true
        })
        if (order) {
          rows = [...rows].sort((a, b) => {
            const av = a[order.col]; const bv = b[order.col]
            return (av < bv ? -1 : av > bv ? 1 : 0) * (order.asc ? 1 : -1)
          })
        }
        rows = rows.slice(0, limit)
        resolve({ data: rows, error: null })
      },
    }
    return q
  }

  function notificationsChain() {
    return {
      async insert(payload) {
        calls.notifInserts.push(payload)
        if (hooks.insertError) return { error: hooks.insertError }
        // UNIQUE(reminder_id, channel) WHERE reminder_id IS NOT NULL.
        const dup = notifications.some(
          (n) => n.reminder_id != null &&
            n.reminder_id === payload.reminder_id && n.channel === payload.channel,
        )
        if (dup) return { error: { code: '23505', message: 'duplicate key' } }
        notifications.push({ ...payload })
        return { error: null }
      },
    }
  }

  function reminderUpdateChain() {
    let patch = null
    const filters = {}
    const chain = {
      update(p) { patch = p; return chain },
      eq(col, val) { filters[col] = val; return chain },
      then(resolve) {
        calls.reminderUpdates.push({ patch, filters })
        if (hooks.updateError) { resolve({ error: hooks.updateError }); return }
        const row = reminders.find((r) => r.id === filters.id && r.sent === false)
        if (row) Object.assign(row, patch)
        resolve({ error: null })
      },
    }
    return chain
  }

  const db = {
    _reminders: reminders,
    _notifications: notifications,
    _calls: calls,
    from(table) {
      if (table === 'reminders') {
        // insert nao e usado aqui; select vs update decidido pelo metodo chamado.
        const base = remindersQuery()
        base.update = (p) => reminderUpdateChain().update(p)
        return base
      }
      if (table === 'notifications') return notificationsChain()
      throw new Error(`tabela inesperada: ${table}`)
    },
  }
  return db
}

const WS = 'ws-1'
const REC = 'user-1'
const rem = (over = {}) => ({
  id: 'r1', workspace_id: WS, task_id: 't1', recipient_id: REC,
  type: 'in_app', remind_at: '2026-08-15T11:45:00.000Z',
  sent: false, cancelled_at: null, ...over,
})

let logs
const captureLog = (e) => logs.push(e)
beforeEach(() => { logs = [] })

describe('enqueueDueReminders — elegibilidade', () => {
  it('1. reminder vencido, vivo, com recipient -> enfileira 1', async () => {
    const db = makeDb([rem()])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c).toEqual({ found: 1, enqueued: 1, already_exists: 0, skipped: 0, errors: 0 })
    expect(db._notifications).toHaveLength(1)
  })

  it('2. remind_at no futuro -> nao encontrado', async () => {
    const db = makeDb([rem({ remind_at: '2026-08-15T13:00:00.000Z' })])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.found).toBe(0)
    expect(db._notifications).toHaveLength(0)
  })

  it('3. remind_at exatamente = now -> elegivel (<=)', async () => {
    const db = makeDb([rem({ remind_at: NOW })])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.found).toBe(1)
    expect(c.enqueued).toBe(1)
  })

  it('4. sent=true -> ignorado', async () => {
    const db = makeDb([rem({ sent: true })])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.found).toBe(0)
  })

  it('5. cancelled_at != null -> ignorado', async () => {
    const db = makeDb([rem({ cancelled_at: '2026-08-10T00:00:00.000Z' })])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.found).toBe(0)
  })

  it('6. mistura: so os elegiveis sao processados', async () => {
    const db = makeDb([
      rem({ id: 'a' }),
      rem({ id: 'b', remind_at: '2026-08-15T20:00:00.000Z' }), // futuro
      rem({ id: 'c', sent: true }),
      rem({ id: 'd', cancelled_at: '2026-08-01T00:00:00.000Z' }),
      rem({ id: 'e', recipient_id: null }), // legado
    ])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.found).toBe(2) // a, e
    expect(c.enqueued).toBe(1) // a
    expect(c.skipped).toBe(1) // e
  })
})

describe('enqueueDueReminders — snapshot da notification', () => {
  it('7. herda campos DIRETAMENTE do reminder (sem recalcular da task)', async () => {
    const db = makeDb([rem({
      id: 'rX', workspace_id: 'wsX', task_id: 'tX', recipient_id: 'uX',
      type: 'whatsapp', remind_at: '2026-08-15T10:00:00.000Z',
    })])
    await enqueueDueReminders(db, { now: NOW })
    expect(db._notifications[0]).toMatchObject({
      reminder_id: 'rX',
      workspace_id: 'wsX',
      task_id: 'tX',
      user_id: 'uX',
      channel: 'whatsapp',
      scheduled_for: '2026-08-15T10:00:00.000Z',
      status: 'pending',
      payload: {},
    })
  })

  it('8. task_id NULL e permitido -> notification com task_id null', async () => {
    const db = makeDb([rem({ task_id: null })])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.enqueued).toBe(1)
    expect(db._notifications[0].task_id).toBeNull()
  })

  it('9. payload minimo (sem dados sensiveis)', async () => {
    const db = makeDb([rem()])
    await enqueueDueReminders(db, { now: NOW })
    expect(db._notifications[0].payload).toEqual({})
  })

  it('10. status inicial sempre pending', async () => {
    const db = makeDb([rem()])
    await enqueueDueReminders(db, { now: NOW })
    expect(db._notifications[0].status).toBe('pending')
  })
})

describe('enqueueDueReminders — legado (recipient_id NULL)', () => {
  it('11. sem recipient -> skipped, NAO cria notification', async () => {
    const db = makeDb([rem({ recipient_id: null })])
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.skipped).toBe(1)
    expect(c.enqueued).toBe(0)
    expect(db._notifications).toHaveLength(0)
  })

  it('12. sem recipient -> reminder permanece NAO processado (sent=false)', async () => {
    const db = makeDb([rem({ recipient_id: null })])
    await enqueueDueReminders(db, { now: NOW })
    expect(db._reminders[0].sent).toBe(false)
    expect(db._calls.reminderUpdates).toHaveLength(0)
  })

  it('13. skip e observavel via log (skip_no_recipient)', async () => {
    const db = makeDb([rem({ recipient_id: null })])
    await enqueueDueReminders(db, { now: NOW, log: captureLog })
    expect(logs).toContainEqual(expect.objectContaining({ event: 'skip_no_recipient', reminder_id: 'r1' }))
  })
})

describe('enqueueDueReminders — ordem e consistencia', () => {
  it('14. ordem: notification ANTES de marcar sent=true', async () => {
    const order = []
    const db = makeDb([rem()])
    const origFrom = db.from.bind(db)
    db.from = (t) => {
      const chain = origFrom(t)
      if (t === 'notifications') {
        const orig = chain.insert.bind(chain)
        chain.insert = (p) => { order.push('notification'); return orig(p) }
      }
      if (t === 'reminders' && chain.update) {
        const orig = chain.update.bind(chain)
        chain.update = (p) => { order.push('mark_sent'); return orig(p) }
      }
      return chain
    }
    await enqueueDueReminders(db, { now: NOW })
    expect(order).toEqual(['notification', 'mark_sent'])
  })

  it('15. sucesso -> marca sent=true com guarda .eq(sent,false)', async () => {
    const db = makeDb([rem()])
    await enqueueDueReminders(db, { now: NOW })
    expect(db._reminders[0].sent).toBe(true)
    const upd = db._calls.reminderUpdates[0]
    expect(upd.patch).toEqual({ sent: true })
    expect(upd.filters).toEqual({ id: 'r1', sent: false })
  })

  it('16. erro de insert (nao-23505) -> NAO marca sent, conta errors, continua', async () => {
    const db = makeDb([rem({ id: 'a' }), rem({ id: 'b' })], {
      hooks: { insertError: { code: '42501', message: 'permission denied' } },
    })
    const c = await enqueueDueReminders(db, { now: NOW, log: captureLog })
    expect(c.errors).toBe(2)
    expect(c.enqueued).toBe(0)
    expect(db._calls.reminderUpdates).toHaveLength(0) // nunca marcou sent
    expect(db._reminders.every((r) => r.sent === false)).toBe(true)
    expect(logs.some((l) => l.event === 'insert_notification_failed')).toBe(true)
  })

  it('17. erro ao marcar sent -> conta errors mas notification permanece', async () => {
    const db = makeDb([rem()], { hooks: { updateError: { code: '55000', message: 'boom' } } })
    const c = await enqueueDueReminders(db, { now: NOW, log: captureLog })
    expect(c.enqueued).toBe(1)
    expect(c.errors).toBe(1)
    expect(db._notifications).toHaveLength(1) // notification convergira na proxima
    expect(logs.some((l) => l.event === 'mark_sent_failed')).toBe(true)
  })

  it('18. erro de LEITURA (select) -> lanca, nada e processado', async () => {
    const db = makeDb([rem()], { hooks: { selectError: { code: '08006', message: 'conn' } } })
    await expect(enqueueDueReminders(db, { now: NOW })).rejects.toThrow(/reminders vencidos/)
  })
})

describe('enqueueDueReminders — idempotencia (UNIQUE 23505)', () => {
  it('19. notification ja existe -> already_exists, sem duplicar, marca sent', async () => {
    const db = makeDb([rem()], {
      notifications: [{ reminder_id: 'r1', channel: 'in_app', status: 'pending' }],
    })
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.already_exists).toBe(1)
    expect(c.enqueued).toBe(0)
    expect(db._notifications).toHaveLength(1) // nao duplicou
    expect(db._reminders[0].sent).toBe(true) // convergiu
  })

  it('20. rodar 2x seguidas: 2a vez converge por already_exists', async () => {
    const reminders = [rem()]
    const db = makeDb(reminders)
    const c1 = await enqueueDueReminders(db, { now: NOW })
    expect(c1.enqueued).toBe(1)
    // Simula crash antes de marcar sent: reverte sent para false, notification fica.
    reminders[0].sent = false
    const c2 = await enqueueDueReminders(db, { now: NOW })
    expect(c2.already_exists).toBe(1)
    expect(db._notifications).toHaveLength(1)
    expect(reminders[0].sent).toBe(true)
  })

  it('21. canal diferente NAO colide (UNIQUE e por reminder_id+channel)', async () => {
    const db = makeDb([rem({ type: 'whatsapp' })], {
      notifications: [{ reminder_id: 'r1', channel: 'in_app', status: 'pending' }],
    })
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c.enqueued).toBe(1) // canal whatsapp e novo
    expect(db._notifications).toHaveLength(2)
  })
})

describe('enqueueDueReminders — batch e ordenacao', () => {
  it('22. respeita batchSize (processa no maximo N)', async () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      rem({ id: `r${i}`, remind_at: `2026-08-15T1${i}:00:00.000Z`.replace('1', '0') }))
    const db = makeDb(many)
    const c = await enqueueDueReminders(db, { now: NOW, batchSize: 3 })
    expect(c.found).toBe(3)
    expect(c.enqueued).toBe(3)
  })

  it('23. ordena por remind_at ASC (mais antigos primeiro)', async () => {
    const db = makeDb([
      rem({ id: 'novo', remind_at: '2026-08-15T11:00:00.000Z' }),
      rem({ id: 'antigo', remind_at: '2026-08-15T09:00:00.000Z' }),
      rem({ id: 'meio', remind_at: '2026-08-15T10:00:00.000Z' }),
    ])
    await enqueueDueReminders(db, { now: NOW, batchSize: 2 })
    // batch de 2 pega os 2 mais antigos: antigo e meio.
    const ids = db._notifications.map((n) => n.reminder_id)
    expect(ids).toEqual(['antigo', 'meio'])
  })

  it('24. batchSize invalido (<=0) cai no default', async () => {
    const db = makeDb([rem()])
    const c = await enqueueDueReminders(db, { now: NOW, batchSize: 0 })
    expect(c.enqueued).toBe(1)
    expect(DEFAULT_BATCH_SIZE).toBe(100)
  })
})

describe('enqueueDueReminders — observabilidade e relogio', () => {
  it('25. contadores refletem um lote misto exato', async () => {
    const db = makeDb([
      rem({ id: 'ok1' }),
      rem({ id: 'ok2', type: 'push' }),
      rem({ id: 'dup' }),
      rem({ id: 'leg', recipient_id: null }),
    ], { notifications: [{ reminder_id: 'dup', channel: 'in_app', status: 'pending' }] })
    const c = await enqueueDueReminders(db, { now: NOW })
    expect(c).toEqual({ found: 4, enqueued: 2, already_exists: 1, skipped: 1, errors: 0 })
  })

  it('26. logs NUNCA contem segredos/tokens/payload sensivel', async () => {
    const db = makeDb([rem({ recipient_id: null }), rem({ id: 'r2' })], {
      hooks: {},
    })
    // forca um erro de insert no segundo para gerar log de erro tambem
    const db2 = makeDb([rem({ recipient_id: null })], {})
    await enqueueDueReminders(db2, { now: NOW, log: captureLog })
    const serialized = JSON.stringify(logs)
    expect(serialized).not.toMatch(/service_role|authorization|bearer|secret|token/i)
    // Sanidade: ainda assim ha observabilidade util.
    expect(logs.length).toBeGreaterThan(0)
    void db
  })

  it('now default (sem opts) usa Date atual — nao lanca', async () => {
    const db = makeDb([rem({ remind_at: '2000-01-01T00:00:00.000Z' })])
    const c = await enqueueDueReminders(db)
    expect(c.enqueued).toBe(1)
  })
})
