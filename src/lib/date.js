import {
  format,
  parseISO,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  addDays,
  isSameDay,
  isToday,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Data no formato do banco (YYYY-MM-DD), sempre em horario local.
export function toISODate(date) {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

export function fromISODate(isoDate) {
  // Interpreta "2026-07-08" como data local (evita shift de fuso).
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatLong(date) {
  const d = typeof date === 'string' ? fromISODate(date) : date
  return format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
}

export function formatShort(date) {
  // Atividades sem data: nunca renderiza Invalid Date — exibe rotulo neutro.
  if (!date) return 'sem data'
  const d = typeof date === 'string' ? fromISODate(date) : date
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

export function formatMonthTitle(date) {
  return format(date, "MMMM 'de' yyyy", { locale: ptBR })
}

// Semana comeca na segunda-feira (padrao brasileiro / requisito do Kanban).
export function getWeekDays(reference = new Date()) {
  const start = startOfWeek(reference, { weekStartsOn: 1 })
  const end = endOfWeek(reference, { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
}

// Grade do mes: 6 semanas comecando na segunda anterior.
export function getMonthGrid(reference = new Date()) {
  const monthStart = startOfMonth(reference)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const days = []
  for (let i = 0; i < 42; i += 1) {
    days.push(addDays(gridStart, i))
  }
  return days
}

export function monthRange(reference = new Date()) {
  const monthStart = startOfMonth(reference)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  return {
    start: toISODate(gridStart),
    end: toISODate(addDays(gridStart, 41)),
  }
}

export function weekRange(reference = new Date()) {
  const days = getWeekDays(reference)
  return { start: toISODate(days[0]), end: toISODate(days[6]) }
}

export function nowTimeString() {
  return format(new Date(), 'HH:mm')
}

// Uma atividade esta "atrasada" quando ainda esta pendente (a fazer / em
// andamento) e o horario ja passou.
export function isTaskOverdue(task, now = new Date()) {
  if (!task) return false
  if (!['todo', 'in_progress'].includes(task.status)) return false
  const today = toISODate(now)
  if (task.date < today) return true
  if (task.date > today) return false
  // mesmo dia: compara horario final (ou inicial) com agora
  const ref = task.end_time || task.start_time
  if (!ref) return false
  return ref < format(now, 'HH:mm')
}

// Ordena por horario (sem horario vai para o fim).
export function byTime(a, b) {
  return (a.start_time || '99:99').localeCompare(b.start_time || '99:99')
}

export { isSameDay, isToday, addDays, endOfMonth, startOfMonth, parseISO }
