import { describe, it, expect, beforeEach, vi } from 'vitest'

const state = {
  configured: true,
  upserts: [],
  upsertError: null,
  deletes: [],
}

vi.mock('../lib/supabaseClient', () => ({
  get supabase() {
    return {
      from: (table) => {
        if (table !== 'push_subscriptions') throw new Error(`tabela inesperada: ${table}`)
        return {
          upsert(row, opts) {
            state.upserts.push({ row, opts })
            return Promise.resolve({ error: state.upsertError })
          },
          delete() {
            return {
              eq(col, val) {
                state.deletes.push({ col, val })
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    }
  },
  get isSupabaseConfigured() {
    return state.configured
  },
}))

const { pushService, isPushSupported, getPermission } = await import('./pushService')

const USER = '00000000-0000-4000-8000-000000000001'
const VAPID_KEY = 'BNc0m8h1e5J3q9x2q1w3e4r5t6y7u8i9o0p1a2s3d4f5g6h7j8k9l0z1x2c3v4b5n6m7' // formato base64url, valor arbitrario de teste

function stubBrowser({ permission = 'default', existingSub = null, subscribeResult = null } = {}) {
  const calls = { requestPermission: 0, subscribe: 0, getSubscription: 0, unsubscribe: 0 }
  const sub = subscribeResult || {
    endpoint: 'https://push.example.com/abc',
    keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    toJSON() {
      return { endpoint: this.endpoint, keys: this.keys }
    },
    unsubscribe: vi.fn(async () => {
      calls.unsubscribe += 1
      return true
    }),
  }
  const registration = {
    pushManager: {
      async getSubscription() {
        calls.getSubscription += 1
        return existingSub
      },
      async subscribe() {
        calls.subscribe += 1
        return sub
      },
    },
  }
  vi.stubGlobal('window', { PushManager: function () {} })
  vi.stubGlobal('navigator', {
    serviceWorker: {
      ready: Promise.resolve(registration),
      async getRegistration() {
        return existingSub ? registration : null
      },
    },
    userAgent: 'vitest',
  })
  vi.stubGlobal('Notification', {
    permission,
    requestPermission: vi.fn(async () => {
      calls.requestPermission += 1
      return permission
    }),
  })
  return { calls, sub, registration }
}

beforeEach(() => {
  state.configured = true
  state.upserts = []
  state.upsertError = null
  state.deletes = []
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.stubEnv('VITE_VAPID_PUBLIC_KEY', VAPID_KEY)
})

describe('pushService — suporte e permissao', () => {
  it('isPushSupported() e false sem window/navigator (Node puro)', () => {
    vi.unstubAllGlobals()
    expect(isPushSupported()).toBe(false)
  })

  it('isPushSupported() e true com serviceWorker + PushManager + Notification', () => {
    stubBrowser()
    expect(isPushSupported()).toBe(true)
  })

  it('getPermission() reflete Notification.permission', () => {
    stubBrowser({ permission: 'granted' })
    expect(getPermission()).toBe('granted')
  })
})

describe('pushService.subscribe()', () => {
  it('modo demo (sem Supabase): retorna demo_mode sem tocar no navegador', async () => {
    state.configured = false
    stubBrowser({ permission: 'granted' })
    const result = await pushService.subscribe(USER)
    expect(result).toEqual({ ok: false, reason: 'demo_mode' })
    expect(state.upserts).toHaveLength(0)
  })

  it('sem suporte do navegador: retorna unsupported', async () => {
    vi.unstubAllGlobals()
    const result = await pushService.subscribe(USER)
    expect(result).toEqual({ ok: false, reason: 'unsupported' })
  })

  it('sem userId: retorna no_user antes de pedir permissao', async () => {
    const { calls } = stubBrowser({ permission: 'granted' })
    const result = await pushService.subscribe(null)
    expect(result).toEqual({ ok: false, reason: 'no_user' })
    expect(calls.requestPermission).toBe(0)
  })

  it('sem VITE_VAPID_PUBLIC_KEY configurada: retorna vapid_not_configured', async () => {
    stubBrowser({ permission: 'granted' })
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    const result = await pushService.subscribe(USER)
    expect(result).toEqual({ ok: false, reason: 'vapid_not_configured' })
  })

  it('permissao negada: retorna denied sem chamar pushManager.subscribe', async () => {
    const { calls } = stubBrowser({ permission: 'denied' })
    const result = await pushService.subscribe(USER)
    expect(result).toEqual({ ok: false, reason: 'denied' })
    expect(calls.subscribe).toBe(0)
  })

  it('caminho feliz: assina, salva endpoint/p256dh/auth no Supabase por upsert(onConflict=endpoint)', async () => {
    stubBrowser({ permission: 'granted' })
    const result = await pushService.subscribe(USER)
    expect(result).toEqual({ ok: true })
    expect(state.upserts).toHaveLength(1)
    const { row, opts } = state.upserts[0]
    expect(opts).toEqual({ onConflict: 'endpoint' })
    expect(row).toMatchObject({
      user_id: USER,
      endpoint: 'https://push.example.com/abc',
      p256dh: 'p256dh-value',
      auth: 'auth-value',
    })
  })

  it('subscription ja existente no navegador: reaproveita, nao assina de novo', async () => {
    const existingSub = {
      endpoint: 'https://push.example.com/existing',
      keys: { p256dh: 'x', auth: 'y' },
      toJSON() {
        return { endpoint: this.endpoint, keys: this.keys }
      },
    }
    const { calls } = stubBrowser({ permission: 'granted', existingSub })
    const result = await pushService.subscribe(USER)
    expect(result).toEqual({ ok: true })
    expect(calls.subscribe).toBe(0)
    expect(state.upserts[0].row.endpoint).toBe('https://push.example.com/existing')
  })
})

describe('pushService.unsubscribe()', () => {
  it('sem subscription ativa: retorna ok sem chamar delete', async () => {
    stubBrowser({ permission: 'granted', existingSub: null })
    const result = await pushService.unsubscribe()
    expect(result).toEqual({ ok: true })
    expect(state.deletes).toHaveLength(0)
  })

  it('com subscription ativa: cancela no navegador e remove no Supabase', async () => {
    const existingSub = {
      endpoint: 'https://push.example.com/bye',
      unsubscribe: vi.fn(async () => true),
    }
    stubBrowser({ permission: 'granted', existingSub })
    const result = await pushService.unsubscribe()
    expect(result).toEqual({ ok: true })
    expect(existingSub.unsubscribe).toHaveBeenCalledTimes(1)
    expect(state.deletes).toEqual([{ col: 'endpoint', val: 'https://push.example.com/bye' }])
  })
})

describe('pushService.isSubscribed()', () => {
  it('true quando ha registration + subscription', async () => {
    stubBrowser({ permission: 'granted', existingSub: { endpoint: 'e' } })
    expect(await pushService.isSubscribed()).toBe(true)
  })

  it('false sem registration', async () => {
    stubBrowser({ permission: 'granted', existingSub: null })
    expect(await pushService.isSubscribed()).toBe(false)
  })
})

// Deteccao de iOS/standalone: ver src/lib/device.test.js (fonte unica,
// cobre tambem iPadOS 13+ via maxTouchPoints — pushService nao duplica mais
// essa logica).
