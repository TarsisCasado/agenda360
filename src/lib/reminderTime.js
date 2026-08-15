// ---------------------------------------------------------------------------
// Calculo do instante do lembrete (remind_at) a partir da data/hora LOCAL do
// compromisso no fuso do DESTINATARIO. Usa Intl (nativo) — sem dependencia
// nova (o projeto tem apenas date-fns, sem date-fns-tz). Trata DST calculando
// o offset do fuso NO instante alvo.
//
// Regra: remind_at = (date + start_time) no fuso `tz`  −  minutes_before.
// Nunca assume um fuso fixo: `tz` vem SEMPRE de profiles.timezone.
// ---------------------------------------------------------------------------

// Offset (ms) do fuso `tz` no instante `date` (Date). asUTC(parts) − date.
function tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = {}
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUTC - date.getTime()
}

// Converte um relogio de parede (y,mo,d,h,mi) interpretado no fuso `tz` para o
// instante UTC (ms). Uma correcao de offset cobre as bordas de DST.
function wallClockInTzToUtc(y, mo, d, h, mi, tz) {
  const naiveUTC = Date.UTC(y, mo - 1, d, h, mi, 0)
  let offset = tzOffsetMs(new Date(naiveUTC), tz)
  const corrected = tzOffsetMs(new Date(naiveUTC - offset), tz)
  if (corrected !== offset) offset = corrected
  return naiveUTC - offset
}

// Retorna o remind_at como string ISO (UTC) OU null quando nao ha data/hora
// suficiente. Lanca se o fuso for invalido (dado corrompido) — o chamador
// trata como falha de sincronizacao (nao cria reminder silenciosamente errado).
export function computeRemindAt(dateStr, timeStr, minutesBefore, tz) {
  if (!dateStr || !timeStr) return null
  if (!tz) throw new Error('timezone ausente para calcular remind_at')

  const [y, mo, d] = String(dateStr).split('-').map(Number)
  const [h, mi] = String(timeStr).split(':').map(Number)
  if (![y, mo, d, h, mi].every(Number.isFinite)) return null

  let startUtc
  try {
    startUtc = wallClockInTzToUtc(y, mo, d, h, mi, tz)
  } catch {
    throw new Error(`timezone invalido: ${tz}`)
  }
  const mins = Number.isFinite(Number(minutesBefore)) ? Number(minutesBefore) : 0
  return new Date(startUtc - mins * 60000).toISOString()
}
