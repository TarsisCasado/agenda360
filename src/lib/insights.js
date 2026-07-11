// ---------------------------------------------------------------------------
// Insights & personalidade — 100% por REGRAS (sem IA remota). Transforma os
// dados que ja existem (tarefas) em frases humanas e sugestoes discretas.
// Funcoes puras e testaveis. Nao acessa rede, banco nem runtime do agente.
// ---------------------------------------------------------------------------
import { toISODate, fromISODate, addDays, isTaskOverdue } from './date'
import { STATUS } from './constants'

const WEEKDAY_NAME = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

// Frase-resumo do dia com personalidade (elegante, nunca robotica).
export function daySummary({ pending = 0, done = 0, overdue = 0, next = null } = {}) {
  if (overdue >= 3) return 'Algumas tarefas ficaram para trás. Posso ajudar a reorganizar.'
  if (pending === 0 && done === 0 && overdue === 0) return 'Seu dia está livre. Um bom momento para planejar.'
  if (pending === 0 && done > 0) return 'Tudo concluído por aqui. Dia impecável.'
  if (pending <= 1 && overdue === 0) return 'Hoje sua agenda está tranquila.'
  if (next?.start_time) return `Preparei tudo para você. Próximo compromisso às ${next.start_time}.`
  return `Você tem ${pending} ${pending === 1 ? 'atividade' : 'atividades'} pela frente. Vamos com calma.`
}

// Streak: dias consecutivos (terminando hoje ou ontem) com >=1 tarefa concluida.
export function completionStreak(tasks = [], today = toISODate(new Date())) {
  const doneByDay = new Set(
    tasks.filter((t) => t.status === STATUS.DONE).map((t) => t.date),
  )
  let streak = 0
  let cursor = fromISODate(today)
  // Permite comecar por ontem caso hoje ainda nao tenha conclusao.
  if (!doneByDay.has(today)) cursor = addDays(cursor, -1)
  for (let i = 0; i < 60; i += 1) {
    if (doneByDay.has(toISODate(cursor))) {
      streak += 1
      cursor = addDays(cursor, -1)
    } else break
  }
  return streak
}

// Progresso da meta semanal (segunda->domingo) de tarefas concluidas.
export function weeklyProgress(tasks = [], today = toISODate(new Date()), goal = 10) {
  const base = fromISODate(today)
  const dow = base.getDay() // 0=dom
  const offsetToMonday = dow === 0 ? -6 : 1 - dow
  const monday = addDays(base, offsetToMonday)
  const days = new Set()
  for (let i = 0; i < 7; i += 1) days.add(toISODate(addDays(monday, i)))
  const done = tasks.filter((t) => t.status === STATUS.DONE && days.has(t.date)).length
  return { done, goal, pct: Math.min(100, Math.round((done / goal) * 100)) }
}

// Gera insights por regras. Retorna descritores neutros (a UI decide icones).
// tipos: 'habit' | 'overdue' | 'streak' | 'calm' | 'productive'
export function buildInsights(tasks = [], { today = toISODate(new Date()), max = 2 } = {}) {
  const out = []
  const todayTasks = tasks.filter((t) => t.date === today)
  const pending = todayTasks.filter((t) => [STATUS.TODO, STATUS.IN_PROGRESS].includes(t.status))
  const overdue = tasks.filter((t) => isTaskOverdue(t))
  const todayDow = fromISODate(today).getDay()

  // 1) Habito recorrente no mesmo dia da semana (>=2 ocorrencias passadas).
  const past = tasks.filter((t) => t.date < today)
  const byTitle = new Map()
  for (const t of past) {
    const d = fromISODate(t.date)
    if (d.getDay() !== todayDow) continue
    const k = norm(t.title)
    if (!k) continue
    const cur = byTitle.get(k) || { count: 0, sample: t }
    cur.count += 1
    byTitle.set(k, cur)
  }
  const existsToday = new Set(todayTasks.map((t) => norm(t.title)))
  let habit = null
  for (const [k, v] of byTitle) {
    if (v.count >= 2 && !existsToday.has(k)) {
      if (!habit || v.count > habit.count) habit = { ...v, key: k }
    }
  }
  if (habit) {
    out.push({
      id: 'habit',
      type: 'habit',
      tone: 'violet',
      title: `Você costuma ${habit.sample.title} ${WEEKDAY_NAME[todayDow]}. Deseja repetir?`,
      cta: {
        label: 'Adicionar hoje',
        kind: 'create',
        payload: {
          title: habit.sample.title,
          category_id: habit.sample.category_id || null,
          priority: habit.sample.priority || 'medium',
          start_time: habit.sample.start_time || '',
          date: today,
        },
      },
    })
  }

  // 2) Muitas atrasadas.
  if (overdue.length >= 3) {
    out.push({
      id: 'overdue',
      type: 'overdue',
      tone: 'amber',
      title: `Você tem ${overdue.length} tarefas atrasadas. Talvez seja melhor reagendar algumas.`,
      cta: { label: 'Revisar', kind: 'navigate', payload: '/dia' },
    })
  }

  // 3) Produtividade (hoje vs ontem).
  const doneToday = todayTasks.filter((t) => t.status === STATUS.DONE).length
  const yesterday = toISODate(addDays(fromISODate(today), -1))
  const doneYesterday = tasks.filter((t) => t.date === yesterday && t.status === STATUS.DONE).length
  if (doneToday > 0 && doneToday > doneYesterday) {
    out.push({
      id: 'productive',
      type: 'productive',
      tone: 'emerald',
      title: 'Você está mais produtivo do que ontem. Continue assim.',
    })
  }

  // 4) Dia calmo (fallback positivo).
  if (out.length === 0 && pending.length <= 1 && overdue.length === 0) {
    out.push({
      id: 'calm',
      type: 'calm',
      tone: 'brand',
      title: 'Dia tranquilo pela frente. Aproveite para adiantar algo importante.',
    })
  }

  return out.slice(0, max)
}
