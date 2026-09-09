import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  isIOSDevice,
  isStandaloneDisplay,
  isNotificationSupported,
  getNotificationPermission,
  describeDeviceNotifications,
} from './device'

// Helpers para simular o ambiente do navegador em Node (deterministico).
// standalone: valor de matchMedia('(display-mode: standalone)').matches
// iosStandalone: navigator.standalone (Safari/iOS)
// permission: valor de Notification.permission; undefined => API ausente.
function setEnv({ ua = '', maxTouchPoints = 0, standalone, iosStandalone, permission } = {}) {
  vi.stubGlobal('navigator', { userAgent: ua, maxTouchPoints, standalone: iosStandalone })
  vi.stubGlobal('window', {
    matchMedia: (q) => ({
      matches: q.includes('display-mode: standalone') ? Boolean(standalone) : false,
    }),
    // 'Notification' in window controla o suporte:
    ...(permission !== undefined ? { Notification: { permission } } : {}),
  })
  if (permission !== undefined) {
    vi.stubGlobal('Notification', { permission })
  }
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const IPAD13 = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('device — deteccao de plataforma', () => {
  it('isIOSDevice: iPhone -> true', () => {
    setEnv({ ua: IPHONE })
    expect(isIOSDevice()).toBe(true)
  })

  it('isIOSDevice: iPadOS 13+ (Macintosh + toque) -> true', () => {
    setEnv({ ua: IPAD13, maxTouchPoints: 5 })
    expect(isIOSDevice()).toBe(true)
  })

  it('isIOSDevice: Macintosh SEM toque (desktop) -> false', () => {
    setEnv({ ua: IPAD13, maxTouchPoints: 0 })
    expect(isIOSDevice()).toBe(false)
  })

  it('isIOSDevice: desktop Windows -> false', () => {
    setEnv({ ua: DESKTOP })
    expect(isIOSDevice()).toBe(false)
  })
})

describe('device — standalone (PWA instalado)', () => {
  it('display-mode standalone -> true', () => {
    setEnv({ ua: DESKTOP, standalone: true })
    expect(isStandaloneDisplay()).toBe(true)
  })

  it('navigator.standalone (iOS) -> true', () => {
    setEnv({ ua: IPHONE, iosStandalone: true })
    expect(isStandaloneDisplay()).toBe(true)
  })

  it('nenhum dos dois -> false', () => {
    setEnv({ ua: IPHONE, standalone: false, iosStandalone: false })
    expect(isStandaloneDisplay()).toBe(false)
  })
})

describe('device — suporte e permissao de Notification', () => {
  it('API ausente -> unsupported', () => {
    setEnv({ ua: DESKTOP }) // sem permission => sem window.Notification
    expect(isNotificationSupported()).toBe(false)
    expect(getNotificationPermission()).toBe('unsupported')
  })

  it('API presente -> reflete Notification.permission', () => {
    setEnv({ ua: DESKTOP, permission: 'default' })
    expect(isNotificationSupported()).toBe(true)
    expect(getNotificationPermission()).toBe('default')
  })
})

describe('device — describeDeviceNotifications (estado semantico da UI)', () => {
  it('iPhone no Safari, NAO instalado -> ios-not-installed', () => {
    // Sem API Notification e sem standalone: no iOS a orientacao e INSTALAR.
    setEnv({ ua: IPHONE, standalone: false, iosStandalone: false })
    expect(describeDeviceNotifications()).toBe('ios-not-installed')
  })

  it('iPhone instalado (standalone), permissao ainda nao decidida -> prompt', () => {
    setEnv({ ua: IPHONE, iosStandalone: true, permission: 'default' })
    expect(describeDeviceNotifications()).toBe('prompt')
  })

  it('iPhone instalado, permissao concedida -> granted', () => {
    setEnv({ ua: IPHONE, iosStandalone: true, permission: 'granted' })
    expect(describeDeviceNotifications()).toBe('granted')
  })

  it('iPhone instalado, permissao negada -> denied', () => {
    setEnv({ ua: IPHONE, iosStandalone: true, permission: 'denied' })
    expect(describeDeviceNotifications()).toBe('denied')
  })

  it('desktop sem API Notification -> unsupported', () => {
    setEnv({ ua: DESKTOP })
    expect(describeDeviceNotifications()).toBe('unsupported')
  })

  it('desktop com API e permissao default -> prompt', () => {
    setEnv({ ua: DESKTOP, permission: 'default' })
    expect(describeDeviceNotifications()).toBe('prompt')
  })

  it('Android instalado (standalone) com default -> prompt', () => {
    setEnv({ ua: 'Mozilla/5.0 (Linux; Android 14)', standalone: true, permission: 'default' })
    expect(describeDeviceNotifications()).toBe('prompt')
  })
})

// ---------------------------------------------------------------------------
// CP4.1 — o TEMA NAO participa da decisao de push.
//
// No QA em iPhone apareceram duas mensagens diferentes (uma em tema claro,
// outra em escuro), levantando a suspeita de que o tema influenciava a
// disponibilidade de push. Nao influencia: a decisao depende SO de
// (a) plataforma/instalacao, (b) Notification.permission e (c) ambiente de
// build (isPushConfigured). Estes casos travam isso.
// ---------------------------------------------------------------------------
describe('describeDeviceNotifications — independente do tema', () => {
  const themes = ['light', 'dark']

  it.each(themes)('iPhone no Safari (nao instalado) -> ios-not-installed no tema %s', (theme) => {
    setEnv({ ua: IPHONE, permission: 'default' })
    globalThis.document = { documentElement: { classList: { contains: (c) => c === theme } } }
    globalThis.window.matchMedia = (q) => ({
      matches: q.includes('prefers-color-scheme: dark') ? theme === 'dark' : false,
    })
    expect(describeDeviceNotifications()).toBe('ios-not-installed')
    delete globalThis.document
  })

  it.each(themes)('iPhone instalado com permissao default -> prompt no tema %s', (theme) => {
    setEnv({ ua: IPHONE, iosStandalone: true, permission: 'default' })
    globalThis.window.matchMedia = (q) => ({
      matches: q.includes('display-mode: standalone')
        ? true
        : q.includes('prefers-color-scheme: dark') && theme === 'dark',
    })
    expect(describeDeviceNotifications()).toBe('prompt')
  })
})
