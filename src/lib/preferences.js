// ---------------------------------------------------------------------------
// Preferencias do usuario (rotina) — armazenadas LOCALMENTE (localStorage),
// por workspace. NAO usa banco/tabela nova: e um espelho leve de contexto que
// alimenta o Context Engine (grounding) e a personalidade do produto.
//
// Coletadas no onboarding conversacional. Tudo opcional; o produto funciona
// sem nenhuma delas ("Pular por enquanto").
// ---------------------------------------------------------------------------

const PREFIX = 'agenda360.prefs.'

const EMPTY = {
  onboarded: false, // concluiu ou pulou o onboarding
  skipped: false, // pulou explicitamente
  wakeTime: '', // "07:00"
  sleepTime: '', // "23:00"
  workStart: '', // "09:00"
  workEnd: '', // "18:00"
  workDays: [], // [1,2,3,4,5] (0=domingo)
  hasKids: null, // bool
  doesSports: null, // bool
  studies: null, // bool
  dayPreference: '', // "morning" | "night"
  goal: '', // texto curto do objetivo principal
  updatedAt: null,
}

function keyFor(workspaceId) {
  return PREFIX + (workspaceId || 'default')
}

export function loadPreferences(workspaceId) {
  try {
    const raw = localStorage.getItem(keyFor(workspaceId))
    if (!raw) return { ...EMPTY }
    return { ...EMPTY, ...JSON.parse(raw) }
  } catch {
    return { ...EMPTY }
  }
}

export function savePreferences(workspaceId, patch) {
  const next = { ...loadPreferences(workspaceId), ...patch, updatedAt: new Date().toISOString() }
  try {
    localStorage.setItem(keyFor(workspaceId), JSON.stringify(next))
  } catch {
    /* storage indisponivel: silencioso, produto segue funcionando */
  }
  return next
}

export function isOnboarded(workspaceId) {
  return loadPreferences(workspaceId).onboarded === true
}

export function resetPreferences(workspaceId) {
  try {
    localStorage.removeItem(keyFor(workspaceId))
  } catch {
    /* ignore */
  }
}

// Apenas os campos "seguros"/relevantes para o interpretador (grounding).
// NUNCA inclui o objetivo em texto livre (fica so na experiencia local).
export function contextPreferences(workspaceId) {
  const p = loadPreferences(workspaceId)
  if (!p.onboarded) return {}
  const out = {}
  if (p.wakeTime) out.wake_time = p.wakeTime
  if (p.sleepTime) out.sleep_time = p.sleepTime
  if (p.workStart) out.work_start = p.workStart
  if (p.workEnd) out.work_end = p.workEnd
  if (p.workDays?.length) out.work_days = p.workDays
  if (p.dayPreference) out.day_preference = p.dayPreference
  return out
}

export const PREFERENCES_EMPTY = EMPTY
