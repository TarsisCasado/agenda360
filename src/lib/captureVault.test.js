import { describe, it, expect, beforeEach, vi } from 'vitest'
import { guardarCaptura, capturaPendente, limparCaptura, VALIDADE_HORAS } from './captureVault'

// localStorage minimo em ambiente node (mesmo padrao de preferences.test.js).
let store
beforeEach(() => {
  store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

const WS = 'ws-1'

describe('cofre da captura — NUNCA PERDER UMA CAPTURA', () => {
  it('nada guardado, nada a recuperar', () => {
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })

  it('o que foi guardado volta inteiro', () => {
    guardarCaptura('  Reunião com gerentes amanhã às 8:30  ', { workspaceId: WS })
    expect(capturaPendente({ workspaceId: WS }).texto).toBe('Reunião com gerentes amanhã às 8:30')
  })

  it('texto vazio não ocupa o cofre', () => {
    expect(guardarCaptura('   ', { workspaceId: WS })).toBeNull()
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })

  it('a captura sai do cofre só quando teve destino', () => {
    guardarCaptura('comprar pão', { workspaceId: WS })
    limparCaptura()
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })

  it('não vaza entre workspaces', () => {
    guardarCaptura('orçamento do trimestre', { workspaceId: 'trabalho' })
    expect(capturaPendente({ workspaceId: 'casa' })).toBeNull()
    expect(capturaPendente({ workspaceId: 'trabalho' })).not.toBeNull()
  })

  it('sobrevive a um refresh — é o mesmo armazenamento, não memória da tela', () => {
    guardarCaptura('ligar para o dentista', { workspaceId: WS })
    // Nenhum estado de React aqui: o cofre é lido do zero.
    expect(capturaPendente({ workspaceId: WS }).texto).toBe('ligar para o dentista')
  })

  it('captura velha não volta como assombro — e é descartada do cofre', () => {
    guardarCaptura('algo de outro mês', { workspaceId: WS })
    const depois = new Date(Date.now() + (VALIDADE_HORAS + 1) * 36e5)
    expect(capturaPendente({ workspaceId: WS, agora: depois })).toBeNull()
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })

  it('a mais recente substitui a anterior — um slot, não uma fila', () => {
    guardarCaptura('primeira', { workspaceId: WS })
    guardarCaptura('segunda', { workspaceId: WS })
    expect(capturaPendente({ workspaceId: WS }).texto).toBe('segunda')
  })

  it('armazenamento indisponível não derruba a captura', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('bloqueado') },
    })
    expect(() => guardarCaptura('x', { workspaceId: WS })).not.toThrow()
    expect(() => limparCaptura()).not.toThrow()
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })

  it('conteúdo corrompido no armazenamento não quebra a leitura', () => {
    store.set('agenda360.captura.pendente', '{isso não é json')
    expect(capturaPendente({ workspaceId: WS })).toBeNull()
  })
})
