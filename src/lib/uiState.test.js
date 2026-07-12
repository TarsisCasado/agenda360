import { describe, it, expect } from 'vitest'
import { workspaceGate } from './uiState'

describe('B1 — workspaceGate', () => {
  it("retorna 'loading' enquanto carrega", () => {
    expect(workspaceGate({ loading: true, workspaces: [] })).toBe('loading')
    expect(workspaceGate({ loading: true, workspaces: [{ id: 'a' }] })).toBe('loading')
  })

  it("retorna 'empty' quando nao ha workspaces", () => {
    expect(workspaceGate({ loading: false, workspaces: [] })).toBe('empty')
    expect(workspaceGate({ loading: false, workspaces: null })).toBe('empty')
    expect(workspaceGate({ loading: false })).toBe('empty')
  })

  it("retorna 'ready' quando ha ao menos um workspace", () => {
    expect(workspaceGate({ loading: false, workspaces: [{ id: 'a' }] })).toBe('ready')
  })

  it('nunca lanca com entrada ausente', () => {
    expect(() => workspaceGate()).not.toThrow()
    expect(workspaceGate()).toBe('empty')
  })
})
