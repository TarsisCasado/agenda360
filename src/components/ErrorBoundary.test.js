import { describe, it, expect } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

describe('B2 — ErrorBoundary', () => {
  it('inicia sem erro', () => {
    const inst = new ErrorBoundary({})
    expect(inst.state.hasError).toBe(false)
    expect(inst.state.error).toBeNull()
  })

  it('getDerivedStateFromError ativa o estado de erro', () => {
    const err = new Error('falha inesperada')
    const next = ErrorBoundary.getDerivedStateFromError(err)
    expect(next.hasError).toBe(true)
    expect(next.error).toBe(err)
  })

  it('handleReset limpa o estado de erro', () => {
    const inst = new ErrorBoundary({})
    inst.state = { hasError: true, error: new Error('x') }
    // stub minimo de setState (fora de arvore React)
    inst.setState = (patch) => {
      inst.state = { ...inst.state, ...patch }
    }
    inst.handleReset()
    expect(inst.state.hasError).toBe(false)
    expect(inst.state.error).toBeNull()
  })
})
