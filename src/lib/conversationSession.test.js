import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  guardarConversa,
  conversaAberta,
  esquecerConversa,
  VALIDADE_HORAS,
} from './conversationSession'

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

describe('ponteiro da conversa aberta', () => {
  it('sem conversa guardada, nada a retomar', () => {
    expect(conversaAberta({ workspaceId: WS })).toBeNull()
  })

  it('guarda e devolve o id', () => {
    guardarConversa('conv-1', { workspaceId: WS })
    expect(conversaAberta({ workspaceId: WS })).toBe('conv-1')
  })

  it('sobrevive ao refresh — é armazenamento, não memória do React', () => {
    guardarConversa('conv-1', { workspaceId: WS })
    expect(conversaAberta({ workspaceId: WS })).toBe('conv-1')
    expect(conversaAberta({ workspaceId: WS })).toBe('conv-1')
  })

  it('não vaza entre workspaces', () => {
    guardarConversa('conv-trabalho', { workspaceId: 'trabalho' })
    expect(conversaAberta({ workspaceId: 'casa' })).toBeNull()
  })

  it('"Limpar" esquece a conversa', () => {
    guardarConversa('conv-1', { workspaceId: WS })
    esquecerConversa()
    expect(conversaAberta({ workspaceId: WS })).toBeNull()
  })

  it('conversa velha não volta como assombro', () => {
    guardarConversa('conv-1', { workspaceId: WS })
    const depois = new Date(Date.now() + (VALIDADE_HORAS + 1) * 36e5)
    expect(conversaAberta({ workspaceId: WS, agora: depois })).toBeNull()
    expect(conversaAberta({ workspaceId: WS })).toBeNull()
  })

  it('id vazio não ocupa o ponteiro', () => {
    expect(guardarConversa('', { workspaceId: WS })).toBeNull()
    expect(conversaAberta({ workspaceId: WS })).toBeNull()
  })

  it('armazenamento indisponível não derruba a tela', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('bloqueado') },
    })
    expect(() => guardarConversa('conv-1', { workspaceId: WS })).not.toThrow()
    expect(() => esquecerConversa()).not.toThrow()
    expect(conversaAberta({ workspaceId: WS })).toBeNull()
  })

  it('conteúdo corrompido não quebra a leitura', () => {
    store.set('agenda360.copiloto.conversa', 'nao é json')
    expect(conversaAberta({ workspaceId: WS })).toBeNull()
  })
})
