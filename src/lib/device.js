// ---------------------------------------------------------------------------
// Deteccao de dispositivo e estado de notificacoes do dispositivo.
//
// Funcoes puras que leem os globais do navegador de forma DEFENSIVA (guardas
// typeof), para rodarem tambem em Node (testes) e nunca lancarem. Servem para
// decidir a UI de "Notificacoes deste dispositivo" sem esconder opcoes por
// engano no iPhone instalado como PWA.
//
// IMPORTANTE (honestidade tecnica): isto trata da PERMISSAO local de
// notificacao (API Notification). O envio de Web Push pelo servidor
// (VAPID + worker de entrega) ainda NAO existe no projeto — quando existir,
// o "prompt"/"granted" daqui sera o pre-requisito para criar a subscription.
// ---------------------------------------------------------------------------

// iOS (iPhone/iPad/iPod). Cobre o iPadOS 13+, que se anuncia como "Macintosh"
// mas tem tela por toque (maxTouchPoints > 1).
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return true
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1
}

// App aberto como PWA instalado (tela cheia, sem barra do navegador).
// Dupla checagem: display-mode padrao (Android/desktop) e navigator.standalone
// (Safari/iOS, que nao implementa display-mode:standalone de forma confiavel).
export function isStandaloneDisplay() {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true
    } catch {
      // matchMedia pode lancar em ambientes exoticos: ignora e tenta o fallback.
    }
  }
  if (typeof navigator !== 'undefined' && navigator.standalone === true) return true
  return false
}

// A API Notification esta disponivel neste contexto?
// No iOS, ela SO existe quando o app esta instalado como PWA (iOS 16.4+).
export function isNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

// 'granted' | 'denied' | 'default' | 'unsupported'
export function getNotificationPermission() {
  if (!isNotificationSupported()) return 'unsupported'
  try {
    return window.Notification.permission
  } catch {
    return 'unsupported'
  }
}

// Estado semantico que a UI consome. A ordem importa: no iOS fora do PWA a
// orientacao correta e INSTALAR (a API nem existe ali), entao esse caso vem
// antes de "unsupported".
//
//   'ios-not-installed' -> iOS aberto no Safari, ainda nao adicionado a Tela
//                          de Inicio. UI: "Adicione a Tela de Inicio...".
//   'unsupported'       -> navegador sem API Notification (nao-iOS).
//   'prompt'            -> suportado, permissao ainda nao decidida. UI: botao
//                          "Ativar notificacoes".
//   'granted'           -> UI: "Notificacoes ativadas".
//   'denied'            -> UI: "Bloqueadas" + instrucao para reativar.
export function describeDeviceNotifications() {
  if (isIOSDevice() && !isStandaloneDisplay()) return 'ios-not-installed'
  const perm = getNotificationPermission()
  if (perm === 'unsupported') return 'unsupported'
  if (perm === 'granted') return 'granted'
  if (perm === 'denied') return 'denied'
  return 'prompt'
}
