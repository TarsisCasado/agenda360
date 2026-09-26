// ---------------------------------------------------------------------------
// CAMADA DETERMINISTICA — ATO DE FALA.
//
// Responde uma pergunta so: este turno e um ACEITE, uma RECUSA/DESISTENCIA, ou
// nenhum dos dois?
//
// Por que isto NAO e "um if por frase": aceitar e desistir formam uma classe
// GRAMATICAL FECHADA em qualquer idioma — algumas dezenas de formas, nao
// milhares. E a mesma natureza da tabela de dias da semana em temporal.js: um
// lexico pequeno e estavel, nao uma regra de negocio. O que e aberto (o assunto
// da atividade, o valor dos campos) continua sendo tratado por extracao, nunca
// por lista.
//
// Regra de ouro do CP5.1: este modulo NUNCA decide sozinho. Quem decide e o
// turnClassifier, que so aceita "confirmar"/"cancelar" quando o turno NAO traz
// alteracao de campo. Por isso "nao quero lembrete" (que parece recusa) acaba
// classificado como MODIFICACAO — o delta vence o ato de fala.
// ---------------------------------------------------------------------------
import { normalizeWithMap, spanToSource } from './normalize'

// Aceite. Precisa ser a frase inteira ou abrir a frase: "isso" no meio de
// "cancela isso" e anafora, nao aceite.
const CONFIRM = [
  /^(sim|s|isso|isso\s+mesmo|exato|exatamente|certo|correto|confirm\w*)\b/,
  /^(ok|okay|okey|blz|beleza|perfeito|otimo|show|fechado|combinado|pode\s+ser|ta\s+bom|tudo\s+certo)\b/,
  /^(pode|manda|bora)\s+(salvar|criar|confirmar|agendar|marcar|registrar|ver|mandar)\b/,
  /^(salva|salvar|cria|criar|agenda|agendar|registra|registrar)\s*(isso|ai|entao)?$/,
  /^(e\s+)?(isso|esse|essa)\s+(ai|mesmo)\b/,
  /^(pode\s+)?(ir|seguir|prosseguir)\b/,
  /^(👍|✅|👌)/u,
]

// Desistencia. Note que "nao quero" / "nao precisa" so contam quando NAO ha
// complemento (o complemento vira alteracao — ver comentario do topo).
const CANCEL = [
  /^(cancela|cancelar|cancele|cancelado)\b/,
  /^(esquece|esquecer|esqueca|deixa\s+(pra\s+la|quieto|isso)|deixe\s+pra\s+la)\b/,
  /^(descarta|descartar|descarte|desiste|desistir|desisti)\b/,
  /^(apaga|apagar|remove|remover|joga\s+fora)\s+(isso|essa|esse|tudo)?$/,
  /^nao\s*,?\s*(deixa|esquece|obrigad)/,
  /^(nao|nao\s+quero|nao\s+precisa|nao\s+e\s+isso|melhor\s+nao)\s*(isso|nao|mais)?$/,
  /^(❌|🚫)/u,
]

function firstMatch(text, patterns) {
  for (const re of patterns) {
    const m = re.exec(text)
    if (m) return [m.index, m.index + m[0].length]
  }
  return null
}

// detectSpeechAct(texto) -> { act: 'confirm' | 'cancel' | null, spans: [] }
// `spans` sao intervalos no texto ORIGINAL, para que o classificador saiba o
// que ja foi consumido ao procurar um assunto residual.
export function detectSpeechAct(text) {
  const raw = String(text || '').trim()
  if (!raw) return { act: null, spans: [] }
  const normalized = normalizeWithMap(raw)
  const t = normalized.text.trim()

  const cancel = firstMatch(t, CANCEL)
  if (cancel) return { act: 'cancel', spans: [spanToSource(normalized, cancel[0], cancel[1])] }

  const confirm = firstMatch(t, CONFIRM)
  if (confirm) return { act: 'confirm', spans: [spanToSource(normalized, confirm[0], confirm[1])] }

  return { act: null, spans: [] }
}

export const __test__ = { CONFIRM, CANCEL }
