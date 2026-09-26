// ---------------------------------------------------------------------------
// FUSO HORARIO — IANA por dentro, cidade por fora.
//
// O motor de lembretes converte "10/09 as 14:00" no instante real usando
// `profiles.timezone` (IANA). Se esse valor estiver errado, o aviso chega na
// hora errada — e ninguem descobre por que. Mas ninguem deveria precisar
// aprender a escrever "America/Fortaleza" para receber um lembrete no horario
// certo.
//
// Entao: o DADO continua IANA (o motor depende disso), e a TELA mostra
// "Fortaleza (GMT−3)". O valor e detectado do proprio aparelho, que ja sabe.
// ---------------------------------------------------------------------------

// O mesmo default da coluna profiles.timezone (migration 0012). Reconhece-lo
// importa: e o valor "ninguem escolheu isto", que pode ser sincronizado sem
// medo. Um fuso diferente do default foi escolha (ou detecao anterior) e nao
// se sobrescreve caladamente.
export const FUSO_PADRAO = 'America/Sao_Paulo'

export function detectarFuso() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return fusoValido(tz) ? tz : null
  } catch {
    return null
  }
}

export function fusoValido(tz) {
  if (!tz || typeof tz !== 'string' || !tz.includes('/')) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

// Deslocamento atual em horas, com sinal ("GMT−3", "GMT+1", "GMT−3:30").
export function offsetLegivel(tz, agora = new Date()) {
  if (!fusoValido(tz)) return ''
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = {}
  for (const part of dtf.formatToParts(agora)) p[part.type] = part.value
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  const minutos = Math.round((asUTC - agora.getTime()) / 60000)
  const sinal = minutos < 0 ? '−' : '+' // minus tipografico, nao hifen
  const abs = Math.abs(minutos)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `GMT${sinal}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

// "America/Fortaleza" -> "Fortaleza (GMT−3)". Sem inventar traducao: a ultima
// parte do IANA JA e o nome da cidade; so trocamos "_" por espaco.
export function rotuloFuso(tz, agora = new Date()) {
  if (!fusoValido(tz)) return '—'
  const cidade = tz.split('/').pop().replace(/_/g, ' ')
  const off = offsetLegivel(tz, agora)
  return off ? `${cidade} (${off})` : cidade
}

// Sincronizar ou nao? Conservador de proposito:
//   - sem fuso guardado, ou guardado = o default que ninguem escolheu, E
//   - o aparelho informa um fuso valido, diferente do guardado
// Qualquer outro caso: nao mexe. Um fuso escolhido (ou detectado antes) nao e
// sobrescrito porque a pessoa viajou com o notebook.
export function deveSincronizar(guardado, detectado) {
  if (!detectado || !fusoValido(detectado)) return false
  if (!guardado) return true
  if (guardado === detectado) return false
  return guardado === FUSO_PADRAO
}
