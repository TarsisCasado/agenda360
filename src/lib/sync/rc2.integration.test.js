import { describe, it, expect } from 'vitest'
import { createSyncQueue } from './syncQueue'
import { upsertNote, removeNote, replaceNote } from './optimistic'

// Integracao do fluxo RC-2 (otimista + fila), sem React/DOM.
const instant = () => Promise.resolve()
const deferred = () => {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

describe('RC-2 — fluxo otimista + rollback', () => {
  it('rollback automatico: falha definitiva reverte o estado local', async () => {
    const q = createSyncQueue({ delayFn: instant, maxRetries: 2 })
    let notes = [{ id: 'a' }]
    const temp = { id: 'tmp' }

    // 1) muda o estado local AGORA (otimista)
    notes = upsertNote(notes, temp)
    expect(notes.map((n) => n.id)).toEqual(['tmp', 'a'])

    // 2) sincroniza em segundo plano — falha -> onError reverte
    const op = q.enqueue({
      key: 'tmp',
      run: async () => { throw new Error('db indisponivel') },
      onError: () => { notes = removeNote(notes, 'tmp') },
    })
    await op.done
    expect(op.status).toBe('failed')
    expect(notes.map((n) => n.id)).toEqual(['a']) // desfeito
  })

  it('sucesso reconcilia id temporario -> id real', async () => {
    const q = createSyncQueue({ delayFn: instant })
    let notes = [{ id: 'tmp' }]
    const op = q.enqueue({
      key: 'tmp',
      run: async () => ({ id: 'real', title: 'x' }),
      onSuccess: (saved) => { notes = replaceNote(notes, 'tmp', saved) },
    })
    await op.done
    expect(notes.map((n) => n.id)).toEqual(['real'])
  })

  it('acao em um item nao trava os demais (dois cards ao mesmo tempo)', async () => {
    const q = createSyncQueue({ delayFn: instant })
    const done = []
    const gate = deferred()
    const a = q.enqueue({ key: 'n1', run: async () => { await gate.promise; done.push('a') } })
    const b = q.enqueue({ key: 'n2', run: async () => { done.push('b') } })
    await b.done // b conclui mesmo com "a" pendente
    expect(done).toEqual(['b'])
    gate.resolve()
    await a.done
    expect(done).toEqual(['b', 'a'])
  })
})
