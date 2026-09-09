// ---------------------------------------------------------------------------
// CAMADA DETERMINISTICA — extracao do TITULO.
//
// Principio: o titulo e o texto do USUARIO menos (a) os trechos ja consumidos
// como data/hora/periodo — recortados por SPAN exato, nao por regex "adivinhada"
// — e (b) o envelope de comando ("me lembra de", "preciso", "agende").
//
// O que NAO fazemos: reescrever o conteudo. "vê os processos" continua "vê os
// processos"; nomes, empresas e girias do usuario ficam como ele escreveu.
// Normalizar linguagem coloquial e trabalho SEMANTICO (LLM), nao deste modulo.
// ---------------------------------------------------------------------------
import { cutSpans } from './normalize'

// Envelope de comando no INICIO da frase. Ordem: do mais longo para o mais
// curto, aplicado repetidamente ("preciso lembrar de ligar" -> "ligar").
const PREFIXES = [
  /^\s*(por favor|pfv)[,\s]+/i,
  /^\s*(me\s+)?lembr(a|e|ar)(\s*-?\s*me)?\s+(de|do|da|dos|das)\s+/i,
  /^\s*(me\s+)?lembr(a|e|ar)(\s*-?\s*me)?\s+/i,
  /^\s*n[aã]o\s+(posso|pode|podemos)\s+esquecer\s+(de|do|da)\s+/i,
  /^\s*n[aã]o\s+esque[cç]a(\s*-?\s*me)?\s+(de|do|da)\s+/i,
  /^\s*(eu\s+)?preciso\s+(de\s+)?/i,
  /^\s*(eu\s+)?tenho\s+(que|de)\s+/i,
  /^\s*(eu\s+)?(vou\s+)?(ter|precisar)\s+(que|de)\s+/i,
  /^\s*(eu\s+)?tenho\s+/i,
  /^\s*(eu\s+)?quero\s+/i,
  /^\s*(eu\s+)?devo\s+/i,
  /^\s*(agenda|agende|agendar|marca|marque|marcar|cria|crie|criar|adiciona|adicione|adicionar|anota|anote|anotar|coloca|coloque|bota|bote)\s+/i,
  /^\s*(uma|um|a|o)\s+(nova|novo)\s+(tarefa|atividade|reuni[aã]o|lembrete)\s+/i,
  /^\s*(nova|novo)\s+(tarefa|atividade|lembrete)\s+/i,
  /^\s*(uma|um)\s+(?=\w)/i,
  /^\s*(a\s+|as\s+|o\s+|os\s+)?(tarefa|atividade|lembrete)\s+/i,
  /^\s*(que|de|do|da|para|pra|pro)\s+/i,
]

// Ruido no FIM da frase (reforco de intencao, nao conteudo).
const SUFFIXES = [
  /[,;]?\s*n[aã]o\s+(posso|quero|pode)\s+(esquecer|deixar)(\s+(disso|isso|dele|dela|essa|isto))?\s*[.!]?\s*$/i,
  /[,;]?\s*n[aã]o\s+esque[cç]a(\s+(disso|isso))?\s*[.!]?\s*$/i,
  /[,;]?\s*(por favor|pfv|obrigad[oa])\s*[.!]?\s*$/i,
  /[,;]?\s*(sem falta|impreterivelmente)\s*[.!]?\s*$/i,
]

// Marcadores de prioridade — viram campo proprio, nao ficam no titulo.
const PRIORITY_TOKENS = [
  /\bprioridade\s+(alta|baixa|m[eé]dia|urgente|normal)\b/gi,
  /\b(urgent[ie]|urgentemente)\b/gi,
  /\bmuito\s+importante\b/gi,
]

function applyRepeatedly(text, patterns, limit = 4) {
  let out = text
  for (let round = 0; round < limit; round += 1) {
    let changed = false
    for (const re of patterns) {
      const next = out.replace(re, '')
      if (next !== out) {
        out = next
        changed = true
      }
    }
    if (!changed) break
  }
  return out
}

function tidy(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/^[\s,;:.\-–—]+/, '')
    .replace(/[\s,;:.\-–—]+$/, '')
    .trim()
}

function capitalize(text) {
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// extractTitle(original, spans, { dropPriority }) -> string ('' quando sobra nada)
export function extractTitle(original, spans = [], { dropPriority = true } = {}) {
  let text = cutSpans(String(original || ''), spans)
  text = text.replace(/https?:\/\/\S+/g, ' ')
  if (dropPriority) {
    for (const re of PRIORITY_TOKENS) text = text.replace(re, ' ')
  }
  text = tidy(text)
  text = applyRepeatedly(text, SUFFIXES)
  text = applyRepeatedly(text, PREFIXES)
  text = tidy(text)
  // Sobras de conectivo que perderam o complemento ("com", "de", "pra").
  text = text.replace(/^(com|de|do|da|para|pra|pro|em|no|na|que)\s*$/i, '')
  text = tidy(text)
  if (text.replace(/[^\p{L}\p{N}]/gu, '').length < 2) return ''
  return capitalize(text)
}

// Consulta ("busque X"): mantem so o termo procurado.
const QUERY_PREFIXES = [
  /^\s*(me\s+)?(busque|buscar|busca|procure|procurar|procura|pesquise|pesquisar|pesquisa|encontre|encontrar|acha|ache|mostre|mostrar|liste|listar|ver|veja)\s+/i,
  /^\s*(a|o|as|os)\s+(tarefas?|atividades?|compromissos?)\s+/i,
  /^\s*(tarefas?|atividades?|compromissos?)\s+/i,
  /^\s*(de|do|da|sobre|com|por|pra|para)\s+/i,
  /^\s*(minhas?|meus?)\s+/i,
]

export function extractQuery(original, spans = []) {
  let text = tidy(cutSpans(String(original || ''), spans))
  text = applyRepeatedly(text, QUERY_PREFIXES)
  return tidy(text).replace(/[?!.]+$/, '').trim()
}

// Alvo de uma acao sobre tarefa existente ("conclui a tarefa X").
const TARGET_PREFIXES = [
  /^\s*(por favor|pfv)[,\s]+/i,
  /^\s*(ja\s+|já\s+)?(conclu\w*|finaliz\w*|termin\w*|encerr\w*|fechar?|feito|fiz)\s+/i,
  /^\s*(marca|marque|marcar)\s+(como\s+)?(feit[oa]|conclu\w*|pronta?)\s*/i,
  /^\s*(reagend\w*|remarc\w*|adia\w*|adie|mude|mudar|passe|passar|move[r]?)\s+/i,
  /^\s*(cancel\w*|exclu\w*|apagu?e?\w*|delet\w*|remov\w*|remova)\s+/i,
  /^\s*(a|o|as|os)\s+(tarefa|atividade|compromisso)\s+/i,
  /^\s*(tarefa|atividade|compromisso)\s+/i,
  // Artigo solto no inicio do alvo ("a reuniao com o Jander"): a busca por
  // titulo e aproximada, o artigo so atrapalha.
  /^\s*(a|o|as|os)\s+(?=\w)/i,
  /^\s*(de|do|da|para|pra|pro|com)\s+/i,
]

export function extractTarget(original, spans = []) {
  let text = tidy(cutSpans(String(original || ''), spans))
  text = applyRepeatedly(text, TARGET_PREFIXES)
  return tidy(text).replace(/[?!.]+$/, '').trim()
}

export const __test__ = { PREFIXES, SUFFIXES }
