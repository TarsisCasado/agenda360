import { describe, it, expect } from 'vitest'
import { viewState } from './loadState'

// C2.1 — a regra que impede "agenda vazia" de ser confundida com "falha ao
// carregar". Cobre os quatro estados e a recuperacao apos tentar de novo.
describe('viewState — erro nunca e confundido com vazio', () => {
  it('sucesso com dados -> data', () => {
    expect(viewState({ loading: false, error: null, hasItems: true })).toBe('data')
  })

  it('sucesso com lista vazia -> empty', () => {
    expect(viewState({ loading: false, error: null, hasItems: false })).toBe('empty')
  })

  it('carregando o primeiro resultado -> loading (nao "empty")', () => {
    expect(viewState({ loading: true, error: null, hasItems: false })).toBe('loading')
  })

  it('erro de rede -> error (nunca "empty")', () => {
    const error = new Error('Failed to fetch')
    expect(viewState({ loading: false, error, hasItems: false })).toBe('error')
  })

  it('falha de autenticacao/RLS (401) -> error', () => {
    const error = Object.assign(new Error('permission denied'), { status: 401 })
    expect(viewState({ loading: false, error, hasItems: false })).toBe('error')
  })

  it('erro VENCE dados antigos em memoria (nao mascara a falha com lista velha)', () => {
    expect(viewState({ loading: false, error: new Error('x'), hasItems: true })).toBe('error')
  })

  it('erro vence loading (uma nova tentativa que ja falhou mostra o erro)', () => {
    expect(viewState({ loading: true, error: new Error('x'), hasItems: false })).toBe('error')
  })

  it('recuperacao apos "tentar novamente": error -> loading -> data', () => {
    // 1) falhou
    expect(viewState({ loading: false, error: new Error('rede'), hasItems: false })).toBe('error')
    // 2) retry em andamento (o hook limpa o error e liga o loading)
    expect(viewState({ loading: true, error: null, hasItems: false })).toBe('loading')
    // 3) sucesso
    expect(viewState({ loading: false, error: null, hasItems: true })).toBe('data')
  })
})
