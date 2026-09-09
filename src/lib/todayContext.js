// ---------------------------------------------------------------------------
// "Frase do momento" do Hoje (Daily Command Center) — REGRAS LOCAIS, sem IA.
// Puro e testavel. Usa apenas dados realmente disponiveis. A frase muda com o
// horario e com o estado real do dia (atrasadas, proxima, progresso).
// ---------------------------------------------------------------------------

export function greetingFor(now = new Date()) {
  const h = now.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`

// Espera contadores/valores JA calculados (mantem a funcao pura e sem deps):
//   overdueCount, pendingCount, doneCount, totalToday, nextStartTime (HH:MM|null)
export function todayPhrase({
  overdueCount = 0,
  pendingCount = 0,
  doneCount = 0,
  totalToday = 0,
  nextStartTime = null,
  now = new Date(),
} = {}) {
  // 1) Atrasos primeiro — o que mais pede atencao.
  if (overdueCount > 0) {
    return `Você tem ${plural(overdueCount, 'tarefa atrasada', 'tarefas atrasadas')}.`
  }
  // 2) Proximo compromisso com horario ainda por vir.
  if (nextStartTime) {
    return `Seu próximo compromisso é às ${nextStartTime}.`
  }
  // 3) Progresso do dia, quando ha tarefas de hoje.
  if (totalToday > 0) {
    if (pendingCount === 0) return 'Tudo concluído por hoje. 🎉'
    return `Você concluiu ${doneCount} de ${totalToday} ${totalToday === 1 ? 'tarefa' : 'tarefas'} hoje.`
  }
  // 4) Nada agendado — mensagem por periodo.
  const h = now.getHours()
  if (h < 12) return 'Nada agendado ainda. Que tal planejar o dia?'
  if (h < 18) return 'Seu dia está livre a partir de agora.'
  return 'Dia tranquilo por aqui. Bom descanso.'
}
