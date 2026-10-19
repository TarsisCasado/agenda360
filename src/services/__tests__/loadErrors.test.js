import { describe, it, expect, beforeEach, vi } from 'vitest'

// C2.1 — a camada que alimenta Hoje/Agenda/Semana: taskService.list com
// servicos ISOLADOS (sem rede). Prova que uma falha SOBE como erro (para a UI
// mostrar o estado de erro, nunca "vazio") e que ler NUNCA escreve.
const state = { result: { data: [], error: null, status: 200 } }
const writes = { insert: 0, update: 0, delete: 0 }

vi.mock('../../lib/supabaseClient', () => {
  const makeQuery = () => {
    const q = {
      select: () => q, eq: () => q, is: () => q,
      order: () => q, gte: () => q, lte: () => q,
      insert: () => { writes.insert += 1; return q },
      update: () => { writes.update += 1; return q },
      delete: () => { writes.delete += 1; return q },
      // awaitable: `await query` resolve o resultado configurado
      then: (resolve) => resolve(state.result),
    }
    return q
  }
  return { isSupabaseConfigured: true, supabase: { from: () => makeQuery() } }
})

vi.mock('../logService', () => ({ logService: { record: vi.fn(), list: vi.fn() } }))

import { taskService } from '../taskService'

const WS = '00000000-0000-4000-8000-0000000000b1'

beforeEach(() => {
  state.result = { data: [], error: null, status: 200 }
  writes.insert = 0; writes.update = 0; writes.delete = 0
})

describe('C2.1 — taskService.list diferencia sucesso de falha (serviços isolados)', () => {
  it('sucesso com dados -> devolve a lista', async () => {
    state.result = { data: [{ id: 't1', title: 'A' }], error: null, status: 200 }
    const r = await taskService.list(WS, {})
    expect(r).toHaveLength(1)
    expect(writes).toEqual({ insert: 0, update: 0, delete: 0 }) // ler nao escreve
  })

  it('sucesso com lista vazia -> [] (nao e erro)', async () => {
    state.result = { data: [], error: null, status: 200 }
    const r = await taskService.list(WS, { start: '2026-10-01', end: '2026-10-07' })
    expect(r).toEqual([])
  })

  it('erro de rede -> LANCA (a UI vira estado de erro, nunca "vazio")', async () => {
    state.result = { data: null, error: { message: 'TypeError: Failed to fetch' }, status: undefined }
    await expect(taskService.list(WS, {})).rejects.toBeTruthy()
    expect(writes).toEqual({ insert: 0, update: 0, delete: 0 }) // falha nao dispara escrita
  })

  it('falha de autenticacao/RLS (401) -> LANCA', async () => {
    state.result = { data: null, error: { message: 'permission denied', code: 'PGRST301' }, status: 401 }
    await expect(taskService.list(WS, {})).rejects.toBeTruthy()
    expect(writes).toEqual({ insert: 0, update: 0, delete: 0 })
  })

  it('recuperação após tentar de novo: 1a falha, 2a sucesso', async () => {
    state.result = { data: null, error: { message: 'conexao perdida' }, status: 503 }
    await expect(taskService.list(WS, {})).rejects.toBeTruthy()
    state.result = { data: [{ id: 't2', title: 'voltou' }], error: null, status: 200 }
    const r = await taskService.list(WS, {})
    expect(r).toHaveLength(1)
    expect(writes).toEqual({ insert: 0, update: 0, delete: 0 })
  })
})
