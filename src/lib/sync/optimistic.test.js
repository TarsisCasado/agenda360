import { describe, it, expect } from 'vitest'
import {
  upsertNote, patchNote, removeNote, replaceNote, sortByUpdated,
  setItems, addItem, patchItem, removeItem, replaceItem, moveItems, dropItems,
} from './optimistic'

const N = (id, over) => ({ id, updated_at: '2026-07-11T10:00:00Z', ...over })

describe('optimistic — notas', () => {
  it('upsertNote adiciona no topo ou substitui', () => {
    const list = [N('a'), N('b')]
    expect(upsertNote(list, N('c')).map((n) => n.id)).toEqual(['c', 'a', 'b'])
    expect(upsertNote(list, N('a', { updated_at: 'x' }))[0].updated_at).toBe('x')
  })
  it('patchNote atualiza apenas o alvo (imutavel)', () => {
    const list = [N('a'), N('b')]
    const out = patchNote(list, 'a', { title: 'novo' })
    expect(out[0].title).toBe('novo')
    expect(out).not.toBe(list)
    expect(list[0].title).toBeUndefined() // original intacto
  })
  it('removeNote remove por id', () => {
    expect(removeNote([N('a'), N('b')], 'a').map((n) => n.id)).toEqual(['b'])
  })
  it('replaceNote troca id temporario pela versao real', () => {
    const out = replaceNote([N('tmp-1'), N('b')], 'tmp-1', N('real-1'))
    expect(out.map((n) => n.id)).toEqual(['real-1', 'b'])
  })
  it('sortByUpdated ordena mais recente primeiro', () => {
    const list = [N('a', { updated_at: '2026-01-01' }), N('b', { updated_at: '2026-02-01' })]
    expect(sortByUpdated(list).map((n) => n.id)).toEqual(['b', 'a'])
  })
})

describe('optimistic — checklist', () => {
  const I = (id, over) => ({ id, text: 't', checked: false, ...over })
  it('setItems / addItem', () => {
    let map = setItems({}, 'n1', [I('i1')])
    map = addItem(map, 'n1', I('i2'))
    expect(map.n1.map((i) => i.id)).toEqual(['i1', 'i2'])
  })
  it('patchItem marca sem mutar o original', () => {
    const map = { n1: [I('i1'), I('i2')] }
    const out = patchItem(map, 'n1', 'i1', { checked: true })
    expect(out.n1[0].checked).toBe(true)
    expect(map.n1[0].checked).toBe(false)
  })
  it('removeItem / replaceItem', () => {
    let map = { n1: [I('i1'), I('tmp')] }
    map = replaceItem(map, 'n1', 'tmp', I('real'))
    expect(map.n1.map((i) => i.id)).toEqual(['i1', 'real'])
    map = removeItem(map, 'n1', 'i1')
    expect(map.n1.map((i) => i.id)).toEqual(['real'])
  })
  it('moveItems reconcilia checklist de nota temporaria', () => {
    const map = { 'tmp-n': [I('i1')] }
    const out = moveItems(map, 'tmp-n', 'real-n')
    expect(out['real-n']).toHaveLength(1)
    expect('tmp-n' in out).toBe(false)
  })
  it('dropItems remove a chave', () => {
    expect(dropItems({ n1: [I('i1')] }, 'n1')).toEqual({})
  })
})
