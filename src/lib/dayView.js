// ---------------------------------------------------------------------------
// Particao das tarefas de um dia para a Agenda diaria.
// Garante que NENHUMA tarefa fique invisivel: alem das "sem horario", tarefas
// com horario fora da grade exibida (ex.: antes das 06:00 ou apos as 23:00)
// vao para um grupo proprio "fora da grade" em vez de sumirem.
// Funcao pura e testavel.
// ---------------------------------------------------------------------------

// Precedencia da data exibida na Agenda diaria: o parametro ?date manda; senao
// usa o fallback (hoje). Fonte unica usada pelo estado inicial e pela sync.
export function resolveDayDate(paramDate, fallback) {
  return paramDate || fallback
}

// Hora inteira de um "HH:mm" (ou null se invalido/ausente).
export function timeToHour(time) {
  if (!time) return null
  const h = Number(String(time).split(':')[0])
  return Number.isFinite(h) ? h : null
}

const byStartTime = (a, b) =>
  String(a.start_time || '').localeCompare(String(b.start_time || ''))

export function partitionDayTasks(tasks = [], { startHour = 6, endHour = 23 } = {}) {
  const untimed = []
  const timed = []
  const outOfGrid = []
  for (const t of tasks) {
    const h = timeToHour(t.start_time)
    if (h === null) {
      untimed.push(t)
    } else if (h < startHour || h > endHour) {
      outOfGrid.push(t)
    } else {
      timed.push(t)
    }
  }
  return {
    untimed,
    timed: timed.sort(byStartTime),
    outOfGrid: outOfGrid.sort(byStartTime),
  }
}
