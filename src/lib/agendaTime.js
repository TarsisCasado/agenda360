// Geometria pura da timeline da Agenda (posicionamento proporcional). Testável.

export function toMinutes(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
}

// Retorna { top, height } em px para um evento na timeline.
//   startHour: primeira hora da grade; hourPx: altura de 1h; minHeight: piso.
export function blockGeometry(startTime, endTime, { startHour = 6, hourPx = 56, minHeight = 30 } = {}) {
  const gridStart = startHour * 60
  const start = toMinutes(startTime)
  const end = endTime ? toMinutes(endTime) : start + 60
  const top = ((start - gridStart) / 60) * hourPx
  const height = Math.max(minHeight, ((Math.max(end, start + 15) - start) / 60) * hourPx - 4)
  return { top, height }
}
