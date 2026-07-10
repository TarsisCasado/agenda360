// ---------------------------------------------------------------------------
// Event Bus interno — pub/sub leve e in-memory. Sem tabela, sem dependencias.
// Permite que modulos (Notification Engine, analytics, plugins futuros) reajam
// a eventos de dominio sem acoplar ao Agent Runtime.
// ---------------------------------------------------------------------------

// Eventos tipados (constantes) — evita strings soltas espalhadas pelo codigo.
export const EVENTS = {
  ACTION_PROPOSED: 'action.proposed',
  ACTION_CONFIRMED: 'action.confirmed',
  ACTION_CANCELLED: 'action.cancelled',
  ACTION_SUCCEEDED: 'action.succeeded',
  ACTION_FAILED: 'action.failed',
  TASK_CREATED: 'task.created',
  TASK_UPDATED: 'task.updated',
  TASK_DELETED: 'task.deleted',
  LINK_CREATED: 'link.created',
}

export function createEventBus() {
  const listeners = new Map()

  const off = (type, fn) => {
    listeners.get(type)?.delete(fn)
  }

  const on = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set())
    listeners.get(type).add(fn)
    return () => off(type, fn)
  }

  return {
    on,
    off,
    once(type, fn) {
      const unsub = on(type, (payload) => {
        unsub()
        fn(payload)
      })
      return unsub
    },
    emit(type, payload) {
      const set = listeners.get(type)
      if (!set) return
      for (const fn of [...set]) {
        try {
          fn(payload)
        } catch (err) {
          // um listener com defeito nunca deve derrubar o emissor
          console.error('[eventBus] listener falhou para', type, err)
        }
      }
    },
    clear() {
      listeners.clear()
    },
  }
}

// Instancia padrao da aplicacao.
export const eventBus = createEventBus()
