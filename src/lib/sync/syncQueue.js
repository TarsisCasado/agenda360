// ---------------------------------------------------------------------------
// Camada UNICA de sincronizacao (isolada e reutilizavel por Inbox, Tasks,
// Links, Agenda, Assistente...). Nao conhece dominio: recebe operacoes
// { key, run, onSuccess, onError } e cuida de ORDEM, RETRY, OFFLINE e ROLLBACK.
//
// Garantias:
//  - Serializacao POR CHAVE (key = id do recurso): operacoes no mesmo item
//    executam em ordem; itens diferentes rodam em paralelo (dois cards podem
//    sincronizar ao mesmo tempo).
//  - Retry com backoff exponencial para falhas transitorias.
//  - Offline-ready: se estiver offline, a operacao AGUARDA (nao gasta retry) e
//    e reenviada quando a conexao volta. Nunca bloqueia a UI.
//  - Falha definitiva -> onError (o chamador faz o rollback do estado local).
//  - Preparacao para colaboracao: toda operacao carrega operation_id, timestamp
//    e origin (mesmo que ainda nao sejam persistidos/usados).
//
// Sem dependencias externas. Testavel (delay/isOnline injetaveis).
// ---------------------------------------------------------------------------
import { uid } from '../utils'

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const defaultIsOnline = () =>
  typeof navigator === 'undefined' ? true : navigator.onLine !== false

export function createSyncQueue({
  maxRetries = 4,
  baseDelay = 400,
  maxDelay = 8000,
  pollInterval = 2000,
  isOnline = defaultIsOnline,
  delayFn = delay,
  onStatus = null, // (op, status, error) => void  — para feedback por item
} = {}) {
  // key -> Promise (cauda da cadeia daquele recurso)
  const chains = new Map()

  function makeMeta(extra = {}) {
    return {
      operation_id: uid(),
      timestamp: new Date().toISOString(),
      origin: extra.origin || 'local',
      ...extra,
    }
  }

  async function waitUntilOnline() {
    // Enquanto offline, aguarda (sem consumir tentativas). Reenvia ao voltar.
    while (!isOnline()) {
      await delayFn(pollInterval)
    }
  }

  async function runWithRetry(op) {
    for (let attempt = 1; ; attempt += 1) {
      await waitUntilOnline()
      try {
        const result = await op.run()
        op.status = 'synced'
        onStatus?.(op, 'synced')
        try { op.onSuccess?.(result, op.meta) } catch { /* callback do chamador */ }
        return
      } catch (err) {
        const permanent = err?.permanent === true
        if (permanent || attempt >= maxRetries) {
          op.status = 'failed'
          onStatus?.(op, 'failed', err)
          try { op.onError?.(err, op.meta) } catch { /* callback do chamador */ }
          return
        }
        await delayFn(Math.min(maxDelay, baseDelay * 2 ** (attempt - 1)))
      }
    }
  }

  function enqueue({ key, run, onSuccess, onError, origin, meta } = {}) {
    let resolveDone
    const done = new Promise((r) => { resolveDone = r })
    const op = {
      key: key ?? uid(),
      run,
      onSuccess,
      onError,
      meta: makeMeta({ origin, ...meta }),
      status: 'pending',
      done,
    }
    onStatus?.(op, 'pending')

    const prev = chains.get(op.key) || Promise.resolve()
    const chained = prev
      .then(() => runWithRetry(op))
      .finally(() => {
        resolveDone()
        // limpa a cadeia se esta foi a ultima operacao da chave
        if (chains.get(op.key) === chained) chains.delete(op.key)
      })
    // .catch para nao vazar rejeicao (runWithRetry nunca rejeita, mas por seguranca)
    chains.set(op.key, chained.catch(() => {}))
    return op
  }

  // Aguarda todas as cadeias em andamento (uso em testes/flush).
  async function idle() {
    await Promise.all([...chains.values()])
  }

  return { enqueue, idle }
}
