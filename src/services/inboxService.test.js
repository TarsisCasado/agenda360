import { describe, it, expect, beforeEach, vi } from 'vitest'

// Forca MODO DEMO (independente do .env): roda 100% local, sem rede.
vi.mock('../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}))

import { inboxService } from './inboxService'

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

describe('inboxService — nota de texto (A1/A1.5)', () => {
  it('cria nota com title/content, status inbox e seen false', async () => {
    const saved = await inboxService.create(WS, USER, { title: 'Comprar tablets', content: 'Samsung' })
    expect(saved.type).toBe('note')
    expect(saved.title).toBe('Comprar tablets')
    expect(saved.content).toBe('Samsung')
    expect(saved.status).toBe('inbox')
    expect(saved.seen).toBe(false)
    expect(saved.created_by).toBe(USER)
    expect(saved.updated_by).toBe(USER)
  })

  it('edita title e conteudo', async () => {
    const saved = await inboxService.create(WS, USER, { content: 'rascunho' })
    const up = await inboxService.update(saved, { title: 'A', content: 'final' })
    expect(up.title).toBe('A')
    expect(up.content).toBe('final')
  })

  it('escopa por workspace', async () => {
    await inboxService.create(WS, USER, { content: 'ws1' })
    await inboxService.create(WS2, USER, { content: 'ws2' })
    expect(await inboxService.list(WS)).toHaveLength(1)
    expect(await inboxService.list(WS2)).toHaveLength(1)
  })
})

describe('inboxService — estados (A2.1)', () => {
  it('list filtra por status; "todos" traz tudo', async () => {
    const a = await inboxService.create(WS, USER, { content: 'na caixa' })
    const b = await inboxService.create(WS, USER, { content: 'pensar' })
    await inboxService.moveToThink(b)
    const c = await inboxService.create(WS, USER, { content: 'arquivar' })
    await inboxService.archive(c)

    expect((await inboxService.list(WS, { status: 'inbox' })).map((n) => n.id)).toEqual([a.id])
    expect((await inboxService.list(WS, { status: 'to_think' })).map((n) => n.id)).toEqual([b.id])
    expect((await inboxService.list(WS, { status: 'archived' })).map((n) => n.id)).toEqual([c.id])
    expect(await inboxService.list(WS)).toHaveLength(3) // todos
  })

  it('mover para pensar / caixa / arquivar / restaurar', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    expect((await inboxService.moveToThink(n)).status).toBe('to_think')
    expect((await inboxService.moveToInbox(n)).status).toBe('inbox')
    expect((await inboxService.archive(n)).status).toBe('archived')
    expect((await inboxService.restore(n)).status).toBe('inbox')
  })

  it('marcar como visto (controle visual)', async () => {
    const n = await inboxService.create(WS, USER, { content: 'x' })
    expect(n.seen).toBe(false)
    expect((await inboxService.setSeen(n, true)).seen).toBe(true)
    expect((await inboxService.setSeen(n, false)).seen).toBe(false)
  })
})

describe('inboxService — checklist (A2.1)', () => {
  it('cria checklist e adiciona/marca/edita/remove itens', async () => {
    const cl = await inboxService.create(WS, USER, { type: 'checklist', title: 'Compras' })
    expect(cl.type).toBe('checklist')

    const i1 = await inboxService.addChecklistItem(WS, cl.id, { text: 'Pao', position: 0 })
    const i2 = await inboxService.addChecklistItem(WS, cl.id, { text: 'Leite', position: 1 })
    let items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.text)).toEqual(['Pao', 'Leite'])
    expect(items.every((i) => !i.checked)).toBe(true)

    await inboxService.toggleChecklistItem(i1, true)
    items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items.find((i) => i.id === i1.id).checked).toBe(true)

    await inboxService.updateChecklistItem(i2, { text: 'Leite integral' })
    items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items.find((i) => i.id === i2.id).text).toBe('Leite integral')

    await inboxService.removeChecklistItem(i1)
    items = await inboxService.listChecklistItems(WS, cl.id)
    expect(items).toHaveLength(1)
  })

  it('excluir a nota remove os itens de checklist (cascade em demo)', async () => {
    const cl = await inboxService.create(WS, USER, { type: 'checklist' })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'a' })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'b' })
    await inboxService.remove(cl)
    expect(await inboxService.listChecklistItems(WS, cl.id)).toHaveLength(0)
  })
})

describe('inboxService — conversao de tipo (A2.1)', () => {
  it('nota -> checklist quebra as linhas em itens', async () => {
    const n = await inboxService.create(WS, USER, { content: 'Pao\nLeite\n\nCafe' })
    const conv = await inboxService.setType(WS, n, 'checklist')
    expect(conv.type).toBe('checklist')
    expect(conv.content).toBe('')
    const items = await inboxService.listChecklistItems(WS, n.id)
    expect(items.map((i) => i.text)).toEqual(['Pao', 'Leite', 'Cafe'])
  })

  it('checklist -> nota junta os itens no content', async () => {
    const cl = await inboxService.create(WS, USER, { type: 'checklist' })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'um', position: 0 })
    await inboxService.addChecklistItem(WS, cl.id, { text: 'dois', position: 1 })
    const conv = await inboxService.setType(WS, cl, 'note')
    expect(conv.type).toBe('note')
    expect(conv.content).toBe('um\ndois')
    expect(await inboxService.listChecklistItems(WS, cl.id)).toHaveLength(0)
  })
})
