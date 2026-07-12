import { describe, it, expect, beforeEach, vi } from 'vitest'

// Forca MODO DEMO (independente do .env): roda 100% local, sem rede.
vi.mock('../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

import { inboxService } from './inboxService'

// localStorage minimo em ambiente node.
beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

const WS = '00000000-0000-4000-8000-0000000000b1'
const WS2 = '00000000-0000-4000-8000-0000000000b2'
const USER = '00000000-0000-4000-8000-000000000001'

describe('inboxService (A1 — nota de texto)', () => {
  it('cria e lista nota (com title e updated_by preparados)', async () => {
    const saved = await inboxService.create(WS, USER, {
      title: 'Comprar tablets',
      content: 'Ver orcamento da Samsung',
    })
    expect(saved.id).toBeTruthy()
    expect(saved.title).toBe('Comprar tablets')
    expect(saved.content).toBe('Ver orcamento da Samsung')
    expect(saved.archived).toBe(false)
    expect(saved.workspace_id).toBe(WS)
    expect(saved.created_by).toBe(USER)
    expect(saved.updated_by).toBe(USER) // campo preparado (sem logica de share)

    const list = await inboxService.list(WS)
    expect(list).toHaveLength(1)
    expect(list[0].title).toBe('Comprar tablets')
  })

  it('cria nota sem title (title default vazio)', async () => {
    const saved = await inboxService.create(WS, USER, { content: 'so conteudo' })
    expect(saved.title).toBe('')
    expect(saved.content).toBe('so conteudo')
  })

  it('edita title e conteudo', async () => {
    const saved = await inboxService.create(WS, USER, { content: 'rascunho' })
    const updated = await inboxService.update(saved, {
      title: 'Assunto',
      content: 'ideia final',
    })
    expect(updated.title).toBe('Assunto')
    expect(updated.content).toBe('ideia final')
    const list = await inboxService.list(WS)
    expect(list[0].title).toBe('Assunto')
    expect(list[0].content).toBe('ideia final')
  })

  it('arquiva e restaura (some/volta da lista ativa)', async () => {
    const saved = await inboxService.create(WS, USER, { content: 'nota' })
    await inboxService.archive(saved)
    expect(await inboxService.list(WS)).toHaveLength(0) // ativas
    expect(await inboxService.list(WS, { archived: true })).toHaveLength(1)
    await inboxService.unarchive(saved)
    expect(await inboxService.list(WS)).toHaveLength(1)
    expect(await inboxService.list(WS, { archived: true })).toHaveLength(0)
  })

  it('exclui a nota', async () => {
    const saved = await inboxService.create(WS, USER, { content: 'temporaria' })
    await inboxService.remove(saved)
    expect(await inboxService.list(WS)).toHaveLength(0)
  })

  it('escopa por workspace (nao vaza entre espacos)', async () => {
    await inboxService.create(WS, USER, { content: 'do ws 1' })
    await inboxService.create(WS2, USER, { content: 'do ws 2' })
    const l1 = await inboxService.list(WS)
    const l2 = await inboxService.list(WS2)
    expect(l1).toHaveLength(1)
    expect(l2).toHaveLength(1)
    expect(l1[0].content).toBe('do ws 1')
    expect(l2[0].content).toBe('do ws 2')
  })

  it('lista ordena mais recentes primeiro', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-11T10:00:00Z'))
      await inboxService.create(WS, USER, { content: 'primeira' })
      vi.setSystemTime(new Date('2026-07-11T11:00:00Z'))
      await inboxService.create(WS, USER, { content: 'segunda' })
      const list = await inboxService.list(WS)
      expect(list.map((n) => n.content)).toEqual(['segunda', 'primeira'])
    } finally {
      vi.useRealTimers()
    }
  })
})
