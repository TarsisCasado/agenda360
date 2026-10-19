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
import { capitalizeFirst } from './utils'

// Data no formato do banco (YYYY-MM-DD), sempre em horario local.
export function toISODate(date) {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'yyyy-MM-dd')
}

// Formato aceito por fromISODate: SOMENTE data (YYYY-MM-DD).
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Verdadeiro quando a string e uma data pura (sem hora). Timestamps completos
// ("2026-08-22T18:28:11.123Z") NAO sao datas puras — ver formatTimestamp.
export function isDateOnly(value) {
  return typeof value === 'string' && DATE_ONLY_RE.test(value)
}

export function fromISODate(isoDate) {
  // Interpreta "2026-07-08" como data local (evita shift de fuso).
  // Endurecido: entrada que nao seja date-only devolve null em vez de produzir
  // um Invalid Date que so estoura la na frente, dentro do format().
  const m = DATE_ONLY_RE.exec(typeof isoDate === 'string' ? isoDate : '')
  if (!m) return null
  const [, y, mo, d] = m
  const dt = new Date(Number(y), Number(mo) - 1, Number(d))
  // Rejeita datas inexistentes ("2026-02-31" viraria 03/03).
  if (dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) return null
  return dt
}

// Converte qualquer entrada (Date | date-only | timestamp ISO) num Date valido,
// ou null. E o unico ponto que aceita timestamp — os formatadores de data pura
// continuam recusando, para que o tipo errado apareca como bug e nao como crash.
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string' || !value.trim()) return null
  if (isDateOnly(value)) return fromISODate(value)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatLong(date) {
  const d = typeof date === 'string' ? fromISODate(date) : date
  if (!d) return 'sem data'
  // Ja sai pronto para uso como rotulo: "Segunda-feira, 24 de agosto de 2026".
  return capitalizeFirst(format(d, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }))
}

// DATA PURA (tasks.date = YYYY-MM-DD). Nao aceita timestamp de propósito:
// use formatTimestamp para created_at/updated_at.
export function formatShort(date) {
  // Atividades sem data / valor invalido: nunca renderiza Invalid Date nem
  // estoura RangeError — exibe rotulo neutro.
  if (!date) return 'sem data'
  const d = typeof date === 'string' ? fromISODate(date) : toDate(date)
  if (!d) return 'sem data'
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

// TIMESTAMP (created_at/updated_at: "2026-08-22T18:28:11.123Z").
// Hoje -> "18:28"; este ano -> "22 ago"; anos anteriores -> "22/08/2025".
export function formatTimestamp(value, now = new Date()) {
  const d = toDate(value)
  if (!d) return ''
  if (isSameDay(d, now)) return format(d, 'HH:mm')
  if (d.getFullYear() === now.getFullYear()) return format(d, "d MMM", { locale: ptBR })
  return format(d, 'dd/MM/yyyy', { locale: ptBR })
}

// TIMESTAMP completo, para logs/detalhes.
export function formatTimestampLong(value) {
  const d = toDate(value)
  if (!d) return ''
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

// "Agosto de 2026" — nunca "Agosto De 2026".
export function formatMonthTitle(date) {
  return capitalizeFirst(format(date, "MMMM 'de' yyyy", { locale: ptBR }))
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
