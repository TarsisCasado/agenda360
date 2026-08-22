import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

// ---------------------------------------------------------------------------
// pushService — Web Push (RFC 8030) do lado do navegador.
//
// So opera em MODO SUPABASE: sem backend nao ha onde persistir a subscription
// nem worker de entrega (`push-delivery-worker`) para envia-la. Em modo demo,
// `subscribe()` retorna { ok:false, reason:'demo_mode' } sem tentar nada.
//
// NUNCA pede permissao sozinho ao carregar a pagina: so e chamado a partir de
// uma acao explicita do usuario (botao em AlertCenter). `Notification.
// requestPermission()` exige gesto do usuario em varios navegadores (Safari
// inclusive) — chamar fora de um clique falha silenciosamente.
// ---------------------------------------------------------------------------

export function isPushSupported() {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  )
}

export function getPermission() {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

// iOS/iPadOS: Web Push so funciona em app instalado na Tela de Inicio
// (standalone) — em aba comum do Safari, 'PushManager' nem existe em
// `window` (isPushSupported() ja retorna false nesse caso). Usado para
// mostrar a orientacao de instalacao SO quando faz sentido (iOS + navegador,
// nao iOS + ja instalado).
export function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '')
}

export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false
  const byMediaQuery =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  // `navigator.standalone` e a propriedade proprietaria do Safari/iOS
  // (display-mode: standalone via matchMedia nem sempre e confiavel no iOS).
  const byIOSFlag = typeof navigator !== 'undefined' && navigator.standalone === true
  return Boolean(byMediaQuery || byIOSFlag)
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

async function upsertSubscription(userId, sub) {
  const json = sub.toJSON()
  const row = {
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
    last_seen_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (error) throw error
}

export const pushService = {
  isSupported: isPushSupported,
  getPermission,
  isIOSDevice,
  isStandaloneDisplay,

  // Fluxo completo, disparado por uma acao explicita do usuario:
  //   permissao -> registration.pushManager.subscribe() -> salva no Supabase.
  async subscribe(userId) {
    if (!isSupabaseConfigured) return { ok: false, reason: 'demo_mode' }
    if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
    if (!userId) return { ok: false, reason: 'no_user' }

    const vapidKey = (import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '').trim()
    if (!vapidKey) return { ok: false, reason: 'vapid_not_configured' }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: permission }

    try {
      const registration = await navigator.serviceWorker.ready
      let sub = await registration.pushManager.getSubscription()
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }
      await upsertSubscription(userId, sub)
      return { ok: true }
    } catch (err) {
      console.error('[Agenda360] falha ao ativar push:', err?.message || err)
      return { ok: false, reason: 'subscribe_failed', error: err }
    }
  },

  // Cancela a subscription deste dispositivo (navegador + registro no Supabase).
  async unsubscribe() {
    if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (!sub) return { ok: true }
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      if (isSupabaseConfigured) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      }
      return { ok: true }
    } catch (err) {
      console.error('[Agenda360] falha ao desativar push:', err?.message || err)
      return { ok: false, reason: 'unsubscribe_failed', error: err }
    }
  },

  // Estado atual (usado para refletir o botao corretamente: ja ativado neste
  // dispositivo x so tem permissao do navegador concedida).
  async isSubscribed() {
    if (!isPushSupported()) return false
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return false
    const sub = await registration.pushManager.getSubscription()
    return Boolean(sub)
  },
}
