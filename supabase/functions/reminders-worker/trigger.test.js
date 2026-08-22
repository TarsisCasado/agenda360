import { describe, it, expect } from 'vitest'
import { maybeTriggerPushDelivery, triggerPushDelivery } from './worker.ts'

// ===========================================================================
// Testes do DISPARO IMEDIATO do push-delivery-worker (Sprint 2 / Etapa 1E).
// `fetchImpl` injetavel (sem rede real). Cobrem exatamente os 4 requisitos
// pedidos:
//   a) chama delivery quando cria push notifications
//   b) nao chama quando nao cria nenhuma
//   c) falha no trigger imediato nao quebra reminders-worker
//   d) nao causa duplicidade logica (no maximo 1 chamada por execucao)
// ===========================================================================

const OPTS = { url: 'https://x.supabase.co/functions/v1/push-delivery-worker', secret: 'shh' }

function makeFetch(impl) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return impl ? impl(url, init) : new Response(null, { status: 200 })
  }
  return { fetchImpl, calls }
}

describe('maybeTriggerPushDelivery — (a) dispara quando ha push novo', () => {
  it('push_enqueued > 0 -> chama o push-delivery-worker', async () => {
    const { fetchImpl, calls } = makeFetch()
    const result = await maybeTriggerPushDelivery({ push_enqueued: 1 }, { ...OPTS, fetchImpl })
    expect(calls).toHaveLength(1)
    expect(result).toEqual({ attempted: true, ok: true, status: 200 })
  })

  it('a chamada usa POST, header x-push-worker-secret e a URL configurada', async () => {
    const { fetchImpl, calls } = makeFetch()
    await maybeTriggerPushDelivery({ push_enqueued: 2 }, { ...OPTS, fetchImpl })
    expect(calls[0].url).toBe(OPTS.url)
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.headers['x-push-worker-secret']).toBe(OPTS.secret)
  })
})

describe('maybeTriggerPushDelivery — (b) NAO dispara sem push novo', () => {
  it('push_enqueued = 0 -> nao chama fetch', async () => {
    const { fetchImpl, calls } = makeFetch()
    const result = await maybeTriggerPushDelivery({ push_enqueued: 0 }, { ...OPTS, fetchImpl })
    expect(calls).toHaveLength(0)
    expect(result).toEqual({ attempted: false, ok: false })
  })

  it('push_enqueued ausente/undefined -> nao chama fetch (tratado como 0)', async () => {
    const { fetchImpl, calls } = makeFetch()
    await maybeTriggerPushDelivery({}, { ...OPTS, fetchImpl })
    expect(calls).toHaveLength(0)
  })

  it('sem secret configurado -> nao tenta, mesmo com push novo (evita 401 previsivel)', async () => {
    const { fetchImpl, calls } = makeFetch()
    const result = await maybeTriggerPushDelivery({ push_enqueued: 1 }, { url: OPTS.url, secret: '', fetchImpl })
    expect(calls).toHaveLength(0)
    expect(result.attempted).toBe(false)
  })
})

describe('triggerPushDelivery / maybeTriggerPushDelivery — (c) falha no disparo NAO propaga erro', () => {
  it('fetch rejeita (rede indisponivel) -> resolve normalmente, nao lanca', async () => {
    const fetchImpl = async () => {
      throw new Error('network down')
    }
    await expect(
      maybeTriggerPushDelivery({ push_enqueued: 1 }, { ...OPTS, fetchImpl }),
    ).resolves.toEqual({ attempted: true, ok: false, error: 'network down' })
  })

  it('push-delivery-worker responde 500 -> ok:false, mas nao lanca (best-effort)', async () => {
    const { fetchImpl } = makeFetch(async () => new Response(null, { status: 500 }))
    const result = await maybeTriggerPushDelivery({ push_enqueued: 1 }, { ...OPTS, fetchImpl })
    expect(result).toEqual({ attempted: true, ok: false, status: 500 })
  })

  it('push-delivery-worker responde 401 (segredo desalinhado) -> nao lanca, so reporta', async () => {
    const { fetchImpl } = makeFetch(async () => new Response(null, { status: 401 }))
    const result = await triggerPushDelivery({ ...OPTS, fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.status).toBe(401)
  })

  it('timeout (abort) -> resolve com erro, nao trava nem lanca', async () => {
    const fetchImpl = async (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    const result = await triggerPushDelivery({ ...OPTS, fetchImpl, timeoutMs: 5 })
    expect(result.attempted).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/abort/i)
  })
})

describe('maybeTriggerPushDelivery — (d) sem duplicidade logica', () => {
  it('varios push novos no MESMO lote (push_enqueued=5) -> so 1 chamada HTTP', async () => {
    const { fetchImpl, calls } = makeFetch()
    await maybeTriggerPushDelivery({ push_enqueued: 5 }, { ...OPTS, fetchImpl })
    expect(calls).toHaveLength(1)
  })

  it('duas execucoes SEGUIDAS do reminders-worker (2 ticks) -> 1 chamada cada, nunca mais que isso por tick', async () => {
    const { fetchImpl, calls } = makeFetch()
    await maybeTriggerPushDelivery({ push_enqueued: 1 }, { ...OPTS, fetchImpl })
    await maybeTriggerPushDelivery({ push_enqueued: 2 }, { ...OPTS, fetchImpl })
    expect(calls).toHaveLength(2) // 1 por execucao, nunca 1+2
  })

  // A protecao contra ENTREGA duplicada (dispatch imediato + cron concorrendo
  // no mesmo minuto) e do claim atomico do push-delivery-worker, nao daqui —
  // ver supabase/functions/push-delivery-worker/deliver.test.js
  // ("idempotencia: notification ja em processing... e pulada"). O disparo
  // imediato so pede para o worker rodar mais cedo; quem decide quem
  // efetivamente entrega continua sendo o claim, intocado por esta mudanca.
})
