// Agrupamento puro de tarefas por status, para a area TAREFAS (organizador
// independente do calendario). Testavel sem render.
//
// Regra: tarefas SEM data aparecem primeiro dentro de cada coluna (o foco do
// organizador e o backlog acionavel), depois as datadas por data ascendente.

export function groupTasksByStatus(tasks = [], statuses = []) {
  const groups = {}
  for (const s of statuses) groups[s] = []
  for (const t of tasks) {
    if (t && t.status in groups) groups[t.status].push(t)
  }
  for (const s of statuses) {
    groups[s].sort((a, b) => {
      const da = a.date ?? '' // sem data ('') ordena antes de qualquer data
      const db = b.date ?? ''
      if (da === db) return 0
      return da < db ? -1 : 1
    })
  }
  return groups
}
