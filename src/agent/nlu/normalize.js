// ---------------------------------------------------------------------------
// CAMADA DETERMINISTICA — normalizacao de texto PT-BR com MAPA DE INDICES.
//
// Por que o mapa: os extratores (tempo, prioridade) trabalham no texto
// normalizado (minusculo, sem acento), mas quem monta o TITULO precisa recortar
// exatamente o mesmo trecho no texto ORIGINAL. Sem esse mapeamento sobram
// residuos ("...08:30hs" -> titulo "Reuniao com gerentes s"), que foi um dos
// bugs reais do QA.
//
// normalizeWithMap garante: para todo indice i do texto normalizado existe
// map[i] = indice do caractere que o originou no texto original.
// ---------------------------------------------------------------------------

// Normalizacao simples (sem mapa) — para comparacoes/testes de presenca.
export function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// Normaliza caractere a caractere preservando a correspondencia de indices.
export function normalizeWithMap(input) {
  const src = String(input || '')
  let text = ''
  const map = []
  for (let i = 0; i < src.length; i += 1) {
    const decomposed = src[i]
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    // Um caractere pode virar 0 (acento solto), 1 ou 2 chars (ligaduras).
    for (const c of decomposed) {
      text += c
      map.push(i)
    }
  }
  return { text, map, source: src }
}

// Converte um intervalo [start, end) do texto normalizado para o original.
export function spanToSource({ map, source }, start, end) {
  if (start >= end) return null
  const from = map[start]
  const last = map[Math.min(end, map.length) - 1]
  if (from === undefined || last === undefined) return null
  return [from, last + 1 <= source.length ? last + 1 : source.length]
}

// Une intervalos sobrepostos/adjacentes (facilita o recorte do titulo).
export function mergeSpans(spans = []) {
  const sorted = [...spans].filter(Boolean).sort((a, b) => a[0] - b[0])
  const out = []
  for (const span of sorted) {
    const last = out[out.length - 1]
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1])
    else out.push([span[0], span[1]])
  }
  return out
}

// Remove os intervalos do texto original, trocando por espaco (nunca junta
// palavras vizinhas).
export function cutSpans(source, spans = []) {
  const merged = mergeSpans(spans)
  let out = ''
  let cursor = 0
  for (const [start, end] of merged) {
    out += source.slice(cursor, start) + ' '
    cursor = end
  }
  return out + source.slice(cursor)
}
