// ---------------------------------------------------------------------------
// CAMADA DETERMINISTICA — INTERROGATIVA.
//
// Responde duas coisas, nenhuma delas sobre intencao:
//
//   1) este turno e uma PERGUNTA (pede informacao) em vez de uma INSTRUCAO?
//   2) sobre QUE CAMPOS ele pergunta, quando da para saber?
//
// Por que isto nao e "um if por frase": interrogar e um ATO DE FALA, marcado
// gramaticalmente. Em portugues os marcadores sao tres, todos de classe
// fechada — ponto de interrogacao, pronome/adverbio interrogativo na abertura,
// e pergunta-cauda no fim ("..., correto?"). Sao dezenas de formas, nao
// milhares, exatamente como a tabela de dias da semana em temporal.js.
//
// O que e ABERTO (o assunto, os valores) continua saindo por extracao.
//
// A guarda que evita confundir pergunta com ordem: um verbo de acao sobre a
// entidade ("muda", "coloca", "agenda") faz do turno uma INSTRUCAO mesmo com
// interrogacao — "muda para sexta?" e pedido, nao consulta.
// ---------------------------------------------------------------------------
import { normalizeWithMap, spanToSource } from './normalize'

// Pronomes e adverbios interrogativos — classe fechada.
const INTERROGATIVE_OPENERS =
  /^(o\s+que|oque|que|qual|quais|quando|onde|aonde|como|quanto|quantos|quantas|quem|cade|porque|por\s+que|pq)\b/

// Pergunta-cauda: "..., correto?", "..., certo?", "..., né?". Exige conteudo
// ANTES do marcador — "certo" sozinho continua sendo aceite, nao pergunta.
const TAG_QUESTION = /\S+\s+(correto|certo|ne|nao\s+e|isso\s+mesmo|verdade)\s*\??\s*$/

// Verbos de ACAO sobre a entidade. Lista propria (mais estreita que as
// stopwords de delta.js, que incluem preenchimento como "ficar"): so entram
// verbos que, na abertura de um turno, pedem uma mudanca.
const IMPERATIVE_VERBS =
  /\b(muda|mudar|mude|troca|trocar|troque|altera|alterar|altere|ajusta|ajustar|ajuste|coloca|colocar|coloque|poe|ponha|bota|botar|bote|deixa|deixar|deixe|passa|passar|passe|joga|jogar|jogue|move|mover|mova|manda|mandar|mande|marca|marcar|marque|agenda|agendar|agende|cria|criar|crie|adiciona|adicionar|adicione|registra|registrar|salva|salvar|salve|remove|remover|apaga|apagar|cancela|cancelar|esquece|tira|tirar|reagenda|reagendar)\b/

// Campos que uma pergunta pode mirar. Serve so para ORDENAR a resposta — a
// resposta em si sempre sai do estado real do rascunho.
const FIELD_LEXICON = [
  ['titulo', /\b(titulo|nome|assunto|entendeu|entendi|entendida)\b/],
  ['data', /\b(data|dia|prazo|quando)\b/],
  ['horario', /\b(horario|hora|horas)\b/],
  ['prioridade', /\b(prioridade|urgencia|urgente|importancia)\b/],
  ['lembrete', /\b(lembrete|lembrar|alarme|alerta|aviso|notificacao)\b/],
  ['categoria', /\b(categoria|etiqueta|tag)\b/],
  ['destino', /\b(onde|aparecer|aparece|kanban|backlog|agenda|lista|tarefas)\b/],
]

// detectQuestion(texto) -> { isQuestion, fields, spans, hasImperative }
export function detectQuestion(text) {
  const raw = String(text || '').trim()
  if (!raw) return { isQuestion: false, fields: [], spans: [], hasImperative: false }

  const normalized = normalizeWithMap(raw)
  const t = normalized.text.trim()

  const spans = []
  const opener = INTERROGATIVE_OPENERS.exec(t)
  if (opener) spans.push(spanToSource(normalized, opener.index, opener.index + opener[0].length))

  const isQuestion = raw.includes('?') || Boolean(opener) || TAG_QUESTION.test(t)
  const hasImperative = IMPERATIVE_VERBS.test(t)

  const fields = FIELD_LEXICON.filter(([, re]) => re.test(t)).map(([name]) => name)

  return { isQuestion, fields, spans, hasImperative }
}

export const __test__ = { INTERROGATIVE_OPENERS, TAG_QUESTION, IMPERATIVE_VERBS, FIELD_LEXICON }
