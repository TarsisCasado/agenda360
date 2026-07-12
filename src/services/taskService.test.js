import { describe, it, expect, beforeEach, vi } from 'vitest'

// Forca MODO DEMO (independente do .env): o teste roda 100% local, sem rede.
vi.mock('../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

// logService que SEMPRE falha ao registrar: prova que a operacao principal
// (criar/alterar tarefa) nao pode ser derrubada por uma falha de log.
vi.mock('./logService', () => ({
  logService: {
    record: vi.fn().mockRejectedValue(new Error('log indisponivel')),
    list: vi.fn(),
  },
}))

import { taskService } from './taskService'
import { logService } from './logService'

// Ambiente demo (sem Supabase configurado nos testes) usa localStorage.
beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
  logService.record.mockClear()
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const USER = '00000000-0000-4000-8000-000000000001'

describe('A3 — logging best-effort', () => {
  it('cria a tarefa mesmo com o log falhando', async () => {
    const saved = await taskService.create(WS, USER, {
      title: 'Comprar pao',
      date: '2026-07-11',
    })
    expect(saved).toBeTruthy()
    expect(saved.id).toBeTruthy()
    expect(saved.title).toBe('Comprar pao')
    // tentou registrar o log (e a falha foi engolida)
    expect(logService.record).toHaveBeenCalledTimes(1)
  })

  it('atualiza status mesmo com o log falhando', async () => {
    const saved = await taskService.create(WS, USER, {
      title: 'Treino',
      date: '2026-07-11',
    })
    logService.record.mockClear()
    const updated = await taskService.changeStatus(USER, saved, 'done')
    expect(updated.status).toBe('done')
    expect(logService.record).toHaveBeenCalledTimes(1)
  })

  it('exclui a tarefa mesmo com o log falhando', async () => {
    const saved = await taskService.create(WS, USER, {
      title: 'Remover',
      date: '2026-07-11',
    })
    await expect(taskService.remove(USER, saved)).resolves.toBeUndefined()
    const after = await taskService.list(WS, {})
    expect(after.find((t) => t.id === saved.id)).toBeUndefined()
  })
})
