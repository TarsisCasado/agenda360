import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadPreferences,
  savePreferences,
  isOnboarded,
  resetPreferences,
  contextPreferences,
} from './preferences'

// localStorage minimo em ambiente node.
beforeEach(() => {
  const store = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  })
})

const WS = 'ws-1'

describe('preferences', () => {
  it('retorna vazio quando nada salvo', () => {
    expect(loadPreferences(WS).onboarded).toBe(false)
    expect(isOnboarded(WS)).toBe(false)
  })

  it('salva e recupera com merge', () => {
    savePreferences(WS, { wakeTime: '07:00', onboarded: true })
    savePreferences(WS, { sleepTime: '23:00' })
    const p = loadPreferences(WS)
    expect(p.wakeTime).toBe('07:00')
    expect(p.sleepTime).toBe('23:00')
    expect(p.onboarded).toBe(true)
    expect(isOnboarded(WS)).toBe(true)
  })

  it('isola por workspace', () => {
    savePreferences(WS, { goal: 'foco', onboarded: true })
    expect(loadPreferences('ws-2').goal).toBe('')
  })

  it('contextPreferences so expoe campos de grounding e nada antes de onboarded', () => {
    savePreferences(WS, { wakeTime: '06:30', goal: 'segredo' })
    expect(contextPreferences(WS)).toEqual({}) // ainda nao onboarded
    savePreferences(WS, { onboarded: true, workDays: [1, 2, 3, 4, 5] })
    const ctx = contextPreferences(WS)
    expect(ctx.wake_time).toBe('06:30')
    expect(ctx.work_days).toEqual([1, 2, 3, 4, 5])
    expect(ctx.goal).toBeUndefined() // objetivo nunca vai ao contexto
  })

  it('reset limpa', () => {
    savePreferences(WS, { onboarded: true })
    resetPreferences(WS)
    expect(isOnboarded(WS)).toBe(false)
  })
})
