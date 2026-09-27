import { describe, it, expect, vi, beforeEach } from 'vitest'

// CP6.4.4 — SESSAO RESILIENTE OFFLINE.
// Erro de transporte NAO e logout. Aqui o cliente Supabase e um espiao: nenhuma
// chamada externa acontece. `getSession` (LOCAL) e a fonte de restauracao;
// `getUser` (REMOTO) nao deve ser usado — se for chamado, o teste denuncia.
// vi.mock e hoisted acima dos consts; o estado compartilhado vai por vi.hoisted.
const h = vi.hoisted(() => ({
  state: { session: null, getSessionError: null, profileThrows: false },
  getUserSpy: null,
}))
const state = h.state

vi.mock('../../lib/supabaseClient', () => {
  const getUserSpy = vi.fn(async () => {
    throw new Error('getUser REMOTO nao deveria ser chamado na restauracao offline')
  })
  h.getUserSpy = getUserSpy
  return {
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: h.state.session }, error: h.state.getSessionError })),
      getUser: getUserSpy,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (state.profileThrows) throw new Error('network down')
            return { data: { full_name: 'Tarsis', role: 'admin', timezone: 'America/Fortaleza' }, error: null }
          },
        }),
      }),
    }),
  },
  }
})

import { authService, decideAuthChange } from '../authService'

beforeEach(() => {
  state.session = null
  state.getSessionError = null
  state.profileThrows = false
  h.getUserSpy.mockClear()
})

describe('CP6.4.4 A — sessao offline resiliente', () => {
  it('1. sessao valida + erro de transporte no perfil -> usuario PERMANECE autenticado', async () => {
    state.session = { user: { id: 'u1', email: 'tarsis@x.com' } }
    state.profileThrows = true // rede caiu ao enriquecer
    const user = await authService.getCurrentUser()
    expect(user).toBeTruthy()
    expect(user.id).toBe('u1')
    expect(user.role).toBe('collaborator') // default, sem derrubar a sessao
    expect(h.getUserSpy).not.toHaveBeenCalled() // restauracao nao usa getUser remoto
  })

  it('2. SIGNED_OUT -> limpar usuario (logout real, imediato)', () => {
    expect(decideAuthChange('SIGNED_OUT', { user: { id: 'u1' } })).toEqual({ action: 'clear' })
  })

  it('3. ausencia real de sessao -> null (leva ao Login)', async () => {
    state.session = null
    expect(await authService.getCurrentUser()).toBeNull()
  })

  it('4. evento com sessao valida NAO provoca getUser remoto', async () => {
    const d = decideAuthChange('TOKEN_REFRESHED', { user: { id: 'u1', email: 'a@b.c' } })
    expect(d.action).toBe('set')
    expect(d.authUser.id).toBe('u1')
    // buildUser usa o usuario da sessao + perfil; jamais getUser remoto.
    const u = await authService.buildUser(d.authUser)
    expect(u.id).toBe('u1')
    expect(h.getUserSpy).not.toHaveBeenCalled()
  })

  it('evento transitorio (sem sessao, nao-SIGNED_OUT) -> ignorar (preserva user)', () => {
    expect(decideAuthChange('TOKEN_REFRESHED', null).action).toBe('ignore')
    expect(decideAuthChange('USER_UPDATED', undefined).action).toBe('ignore')
  })

  it('erro inesperado ao ler a sessao -> transitorio (nao desloga)', async () => {
    state.getSessionError = { message: 'storage indisponivel' }
    const r = await authService.getCurrentUser()
    expect(r).toEqual({ transient: true })
  })
})
