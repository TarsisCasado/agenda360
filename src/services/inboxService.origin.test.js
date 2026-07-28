import { describe, it, expect, beforeEach, vi } from 'vitest'

// MODO DEMO (sem Supabase).
vi.mock('../lib/supabaseClient', () => ({ supabase: null, isSupabaseConfigured: false }))

import { inboxService } from './inboxService'
import { localStore } from './localStore'

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('inboxService — origin (canais persistiveis)', () => {
  it('aceita origin manual', async () => {
    const n = await inboxService.create(WS, USER, { type: 'note', origin: 'manual' })
    expect(n.origin).toBe('manual')
  })

  it('aceita origin photo', async () => {
    const n = await inboxService.create(WS, USER, { type: 'note', origin: 'photo' })
    expect(n.origin).toBe('photo')
  })

  it('origem invalida NAO e persistida livremente (cai para manual — legado)', async () => {
    const n = await inboxService.create(WS, USER, { type: 'note', origin: 'google_calendar' })
    expect(n.origin).toBe('manual')
    expect(n.origin).not.toBe('google_calendar')
  })
})

describe('inboxService — id explicito (fluxos internos)', () => {
  it('aceita id explicito valido (UUID) e o persiste', async () => {
    const id = crypto.randomUUID()
    const n = await inboxService.create(WS, USER, { id, type: 'note' })
    expect(n.id).toBe(id)
  })

  it('rejeita id invalido ANTES de persistir (nada e gravado)', async () => {
    await expect(
      inboxService.create(WS, USER, { id: 'nao-e-uuid', type: 'note' }),
    ).rejects.toThrow(/uuid/i)
    expect(localStore.table('inbox_items')).toHaveLength(0)
  })

  it('sem id: mantem o comportamento atual (gera UUID)', async () => {
    const n = await inboxService.create(WS, USER, { type: 'note' })
    expect(n.id).toMatch(UUID_RE)
  })
})
