import { describe, it, expect, vi } from 'vitest'
import { createSyncQueue } from './syncQueue'

const instant = () => Promise.resolve()
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('syncQueue — ordem e paralelismo', () => {
  it('serializa operacoes da MESMA chave em ordem', async () => {
    const q = createSyncQueue({ delayFn: instant })
    const order = []
    const a = q.enqueue({ key: 'n1', run: async () => { order.push('a') } })
    const b = q.enqueue({ key: 'n1', run: async () => { order.push('b') } })
    await Promise.all([a.done, b.done])
    expect(order).toEqual(['a', 'b'])
  })

  it('executa chaves DIFERENTES em paralelo', async () => {
    const q = createSyncQueue({ delayFn: instant })
    const g1 = deferred(); const g2 = deferred()
    const started = {}
    const a = q.enqueue({ key: 'n1', run: async () => { started.a = true; await g1.promise } })
    const b = q.enqueue({ key: 'n2', run: async () => { started.b = true; await g2.promise } })
    await Promise.resolve() // deixa as duas cadeias iniciarem
    await Promise.resolve()
    expect(started.a).toBe(true)
    expect(started.b).toBe(true) // ambas em voo ao mesmo tempo
    g1.resolve(); g2.resolve()
    await Promise.all([a.done, b.done])
  })
})

describe('syncQueue — retry e rollback', () => {
  it('retenta falha transitoria e depois sucede (sem onError)', async () => {
    const q = createSyncQueue({ delayFn: instant, maxRetries: 4 })
    let n = 0
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const op = q.enqueue({
      key: 'n1',
      run: async () => { n += 1; if (n < 3) throw new Error('flaky'); return 'ok' },
      onSuccess, onError,
    })
    await op.done
    expect(n).toBe(3)
    expect(onSuccess).toHaveBeenCalledWith('ok', expect.any(Object))
    expect(onError).not.toHaveBeenCalled()
    expect(op.status).toBe('synced')
  })

  it('falha definitiva apos esgotar retries -> onError (rollback)', async () => {
    const q = createSyncQueue({ delayFn: instant, maxRetries: 3 })
    const onError = vi.fn()
    const op = q.enqueue({
      key: 'n1',
      run: async () => { throw new Error('boom') },
      onError,
    })
    await op.done
    expect(onError).toHaveBeenCalledTimes(1)
    expect(op.status).toBe('failed')
  })

  it('erro permanent nao retenta', async () => {
    const q = createSyncQueue({ delayFn: instant, maxRetries: 5 })
    let n = 0
    const op = q.enqueue({
      key: 'n1',
      run: async () => { n += 1; const e = new Error('nope'); e.permanent = true; throw e },
    })
    await op.done
    expect(n).toBe(1)
    expect(op.status).toBe('failed')
  })
})

describe('syncQueue — offline-ready', () => {
  it('aguarda enquanto offline e reenvia quando volta (sem gastar retry)', async () => {
    let online = false
    const q = createSyncQueue({
      isOnline: () => online,
      delayFn: (ms) => new Promise((r) => setTimeout(r, ms)),
      pollInterval: 5,
      maxRetries: 1, // se "offline" contasse como retry, falharia
    })
    let ran = false
    const op = q.enqueue({ key: 'n1', run: async () => { ran = true; return 'ok' } })
    await new Promise((r) => setTimeout(r, 20))
    expect(ran).toBe(false) // ficou pendente, nao falhou
    expect(op.status).toBe('pending')
    online = true
    await op.done
    expect(ran).toBe(true)
    expect(op.status).toBe('synced')
  })
})

describe('syncQueue — metadados de colaboracao', () => {
  it('toda operacao tem operation_id, timestamp e origin', async () => {
    const q = createSyncQueue({ delayFn: instant })
    const op = q.enqueue({ key: 'n1', origin: 'inbox', run: async () => {} })
    await op.done
    expect(op.meta.operation_id).toBeTruthy()
    expect(op.meta.timestamp).toBeTruthy()
    expect(op.meta.origin).toBe('inbox')
  })

  it('onStatus reporta pending -> synced', async () => {
    const seen = []
    const q = createSyncQueue({ delayFn: instant, onStatus: (op, s) => seen.push(s) })
    const op = q.enqueue({ key: 'n1', run: async () => {} })
    await op.done
    expect(seen).toEqual(['pending', 'synced'])
  })
})
