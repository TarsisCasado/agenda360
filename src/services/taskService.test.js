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

describe('T1.1.5 — atividades sem data + origin', () => {
  it('cria atividade COM data (fluxo atual preservado)', async () => {
    const t = await taskService.create(WS, USER, {
      title: 'Com data',
      date: '2026-07-20',
      start_time: '09:00',
      end_time: '10:00',
    })
    expect(t.date).toBe('2026-07-20')
    expect(t.start_time).toBe('09:00')
    expect(t.end_time).toBe('10:00')
  })

  it('cria atividade SEM data e normaliza horarios (sem orfaos)', async () => {
    const t = await taskService.create(WS, USER, {
      title: 'Sem data',
      date: null,
      // horarios enviados por engano devem ser descartados
      start_time: '09:00',
      end_time: '10:00',
    })
    expect(t.date).toBeNull()
    expect(t.start_time).toBeNull()
    expect(t.end_time).toBeNull()
  })

  it('remover a data de uma atividade limpa os horarios', async () => {
    const t = await taskService.create(WS, USER, {
      title: 'Vira sem data',
      date: '2026-07-20',
      start_time: '09:00',
      end_time: '10:00',
    })
    const upd = await taskService.update(USER, t, { date: null })
    expect(upd.date).toBeNull()
    expect(upd.start_time).toBeNull()
    expect(upd.end_time).toBeNull()
  })

  it('edita uma atividade sem data (continua editavel)', async () => {
    const t = await taskService.create(WS, USER, { title: 'Rascunho', date: null })
    const upd = await taskService.update(USER, t, { title: 'Rascunho revisado' })
    expect(upd.title).toBe('Rascunho revisado')
    expect(upd.date).toBeNull()
  })

  it('atribuir uma data depois volta a permitir horarios', async () => {
    const t = await taskService.create(WS, USER, { title: 'Depois agendo', date: null })
    const upd = await taskService.update(USER, t, {
      date: '2026-07-21',
      start_time: '14:00',
    })
    expect(upd.date).toBe('2026-07-21')
    expect(upd.start_time).toBe('14:00')
  })

  it('filtros por periodo NAO retornam atividades sem data', async () => {
    await taskService.create(WS, USER, { title: 'No periodo', date: '2026-07-20' })
    await taskService.create(WS, USER, { title: 'Fora (sem data)', date: null })
    const ranged = await taskService.list(WS, { start: '2026-07-01', end: '2026-07-31' })
    expect(ranged.some((t) => t.title === 'No periodo')).toBe(true)
    expect(ranged.some((t) => t.date == null)).toBe(false)
  })

  it('busca sem intervalo (Command Palette) INCLUI sem-data', async () => {
    await taskService.create(WS, USER, { title: 'Achavel', date: null })
    const all = await taskService.list(WS, {})
    expect(all.some((t) => t.title === 'Achavel' && t.date == null)).toBe(true)
  })

  it('listUndated retorna SOMENTE atividades sem data', async () => {
    await taskService.create(WS, USER, { title: 'Com data', date: '2026-07-20' })
    await taskService.create(WS, USER, { title: 'Sem data A', date: null })
    await taskService.create(WS, USER, { title: 'Sem data B', date: null })
    const undated = await taskService.listUndated(WS)
    expect(undated).toHaveLength(2)
    expect(undated.every((t) => t.date == null)).toBe(true)
  })

  it('criacao manual grava origin = manual', async () => {
    const t = await taskService.create(WS, USER, { title: 'Manual', date: null })
    expect(t.origin).toBe('manual')
  })

  it('origin fora da lista de confianca vira manual (form comum nao escolhe)', async () => {
    const t = await taskService.create(WS, USER, {
      title: 'Tentou spoofar',
      date: null,
      origin: 'hacker',
    })
    expect(t.origin).toBe('manual')
  })

  it('origin de fluxo interno confiavel e aceito', async () => {
    const t = await taskService.create(WS, USER, {
      title: 'Da caixa',
      date: null,
      origin: 'inbox',
    })
    expect(t.origin).toBe('inbox')
  })

  it('edicao comum NAO altera a origem', async () => {
    const t = await taskService.create(WS, USER, {
      title: 'Origem fixa',
      date: null,
      origin: 'inbox',
    })
    const upd = await taskService.update(USER, t, { title: 'Editada', origin: 'assistant' })
    expect(upd.origin).toBe('inbox')
  })
})
