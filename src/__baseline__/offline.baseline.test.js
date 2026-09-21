import { describe, it, expect, beforeEach, vi } from 'vitest'
import { guardarCaptura, limparCaptura, capturaPendente, VALIDADE_HORAS } from '../lib/captureVault'
import { createSyncQueue } from '../lib/sync/syncQueue'
import { upsertNote, patchNote, replaceNote, removeNote, sortByUpdated } from '../lib/sync/optimistic'
import { baseline, invariante } from './contrato'

// ---------------------------------------------------------------------------
// BASELINE — OFFLINE E FILA.
//
// AREA CONGELADA, e a mais perigosa de todas por um motivo especifico: sua
// falha e INVISIVEL ate o pior momento. Ninguem percebe que a fila parou de
// reenviar enquanto ha rede; percebe-se no metro, com a captura perdida.
//
// Este arquivo nao muda estrategia nenhuma: fotografa o que existe. O relogio
// e a conectividade sao injetados, entao nada aqui depende de rede real nem de
// espera de verdade.
// ---------------------------------------------------------------------------

const WS = 'ws-1'

beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

describe('BASELINE Offline — o cofre da captura', () => {
  it(invariante('INV-22', 'a captura e guardada localmente, sem rede e sem servico'), () => {
    const r = guardarCaptura('  ligar para o Rubens  ', { workspaceId: WS })
    expect(r.texto).toBe('ligar para o Rubens') // ja vem aparado
    expect(capturaPendente({ workspaceId: WS })?.texto).toBe('ligar para o Rubens')
  })

  it(baseline('captura vazia ou so espacos nao e guardada'), () => {
    expect(guardarCaptura('   ', { workspaceId: WS })).toBeNull()
    expect(guardarCaptura('', { workspaceId: WS })).toBeNull()
  })

  it(baseline('dentro de 72 horas a captura volta'), () => {
    expect(VALIDADE_HORAS).toBe(72)
    guardarCaptura('antiga', { workspaceId: WS })
    const daquiA1Hora = new Date(Date.now() + 3600 * 1000)
    expect(capturaPendente({ workspaceId: WS, agora: daquiA1Hora })?.texto).toBe('antiga')
  })

  it(baseline('passadas 72 horas ela nao volta — e a consulta LIMPA o cofre'), () => {
    guardarCaptura('antiga', { workspaceId: WS })
    const daquiA4Dias = new Date(Date.now() + 96 * 3600 * 1000)
    expect(capturaPendente({ workspaceId: WS, agora: daquiA4Dias })).toBeNull()
    // Efeito colateral real: a leitura que encontra uma captura vencida a
    // apaga. Consultar de novo, mesmo no presente, nao a traz de volta.
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })

  it(baseline('a captura de um workspace NAO reaparece em outro'), () => {
    guardarCaptura('coisa do trabalho', { workspaceId: 'trabalho' })
    expect(capturaPendente({ workspaceId: 'casa' })).toBeNull()
    expect(capturaPendente({ workspaceId: 'trabalho' })?.texto).toBe('coisa do trabalho')
  })

  it(baseline('limpar remove a pendencia'), () => {
    guardarCaptura('x', { workspaceId: WS })
    limparCaptura()
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })

  it(baseline('sem armazenamento disponivel, guardar falha em silencio e nao derruba nada'), () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('quota') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('quota') },
    })
    expect(() => guardarCaptura('x', { workspaceId: WS })).not.toThrow()
    expect(guardarCaptura('x', { workspaceId: WS })).toBeNull()
    expect(() => capturaPendente({ workspaceId: WS })).not.toThrow()
  })
})

describe('BASELINE Offline — a fila de sincronizacao', () => {
  it(baseline('offline: a operacao ESPERA em vez de consumir tentativas'), async () => {
    let online = false
    const run = vi.fn(async () => 'ok')
    const fila = createSyncQueue({ isOnline: () => online, delayFn: async () => { online = true }, pollInterval: 1 })
    const op = fila.enqueue({ key: 'k', run })
    await op.done
    expect(run).toHaveBeenCalledTimes(1) // rodou UMA vez, ao voltar a rede
    expect(op.status).toBe('synced')
  })

  it(baseline('falha transitoria: tenta de novo, com espera crescente'), async () => {
    let n = 0
    const esperas = []
    const run = vi.fn(async () => {
      n += 1
      if (n < 3) throw new Error('rede')
      return 'ok'
    })
    const fila = createSyncQueue({
      isOnline: () => true,
      delayFn: async (ms) => { esperas.push(ms) },
      baseDelay: 400,
    })
    const op = fila.enqueue({ key: 'k', run })
    await op.done
    expect(op.status).toBe('synced')
    expect(run).toHaveBeenCalledTimes(3)
    expect(esperas).toEqual([400, 800]) // backoff exponencial
  })

  it(baseline('erro PERMANENTE nao e retentado'), async () => {
    const run = vi.fn(async () => {
      const e = new Error('400')
      e.permanent = true
      throw e
    })
    const fila = createSyncQueue({ isOnline: () => true, delayFn: async () => {} })
    const op = fila.enqueue({ key: 'k', run, onError: vi.fn() })
    await op.done
    expect(run).toHaveBeenCalledTimes(1)
    expect(op.status).toBe('failed')
  })

  it(baseline('esgotadas as tentativas, a operacao falha em vez de tentar para sempre'), async () => {
    const run = vi.fn(async () => { throw new Error('rede') })
    const fila = createSyncQueue({ isOnline: () => true, delayFn: async () => {}, maxRetries: 4 })
    const op = fila.enqueue({ key: 'k', run })
    await op.done
    expect(run).toHaveBeenCalledTimes(4)
    expect(op.status).toBe('failed')
  })

  it(
    invariante('nao-duplicar', 'operacoes da MESMA chave sao serializadas, nunca concorrentes'),
    async () => {
      const ordem = []
      const fila = createSyncQueue({ isOnline: () => true, delayFn: async () => {} })
      const lenta = fila.enqueue({
        key: 'mesma',
        run: async () => { await new Promise((r) => setTimeout(r, 20)); ordem.push('primeira') },
      })
      const rapida = fila.enqueue({ key: 'mesma', run: async () => { ordem.push('segunda') } })
      await Promise.all([lenta.done, rapida.done])
      expect(ordem).toEqual(['primeira', 'segunda'])
    },
  )

  it(baseline('chaves diferentes correm em paralelo'), async () => {
    const fila = createSyncQueue({ isOnline: () => true, delayFn: async () => {} })
    const a = fila.enqueue({ key: 'a', run: async () => 'a' })
    const b = fila.enqueue({ key: 'b', run: async () => 'b' })
    await fila.idle()
    expect([a.status, b.status]).toEqual(['synced', 'synced'])
  })

  it(baseline('toda operacao carrega um operation_id proprio, para rastreio'), async () => {
    const fila = createSyncQueue({ isOnline: () => true, delayFn: async () => {} })
    const a = fila.enqueue({ key: 'a', run: async () => 'a' })
    const b = fila.enqueue({ key: 'b', run: async () => 'b' })
    await fila.idle()
    expect(a.meta.operation_id).toBeTruthy()
    expect(a.meta.operation_id).not.toBe(b.meta.operation_id)
  })
})

describe('BASELINE Offline — estado otimista', () => {
  it(baseline('o item aparece na hora e e substituido quando o servidor responde'), () => {
    let notas = upsertNote([], { id: 'temp-1', title: 'nova', updated_at: '2026-09-21T10:00:00Z' })
    expect(notas.length).toBe(1)
    notas = replaceNote(notas, 'temp-1', { id: 'real-1', title: 'nova', updated_at: '2026-09-21T10:00:01Z' })
    expect(notas.map((n) => n.id)).toEqual(['real-1'])
    expect(notas.length).toBe(1) // trocou, NAO duplicou
  })

  it(baseline('editar aplica o patch sem recriar o item'), () => {
    const notas = patchNote([{ id: 'a', title: 'velho' }], 'a', { title: 'novo' })
    expect(notas).toEqual([{ id: 'a', title: 'novo' }])
  })

  it(baseline('remover tira o item da lista'), () => {
    expect(removeNote([{ id: 'a' }, { id: 'b' }], 'a').map((n) => n.id)).toEqual(['b'])
  })

  it(baseline('a lista fica ordenada pela atualizacao mais recente'), () => {
    const ordenadas = sortByUpdated([
      { id: 'velha', updated_at: '2026-09-01T00:00:00Z' },
      { id: 'nova', updated_at: '2026-09-21T00:00:00Z' },
    ])
    expect(ordenadas.map((n) => n.id)).toEqual(['nova', 'velha'])
  })
})
