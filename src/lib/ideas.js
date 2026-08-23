// Helpers puros de Ideias (inbox_items). Derivacao de titulo/resumo para a
// lista e para os cards de "Ideias recentes". Testavel sem render.

export function firstLine(s) {
  return (s || '').split('\n').find((l) => l.trim()) || ''
}

// Titulo exibido: o title explicito; senao a 1a linha do corpo; senao rotulo.
export function ideaTitle(note, fallback = 'Sem título') {
  const t = (note?.title || '').trim()
  if (t) return t
  const fromBody = firstLine(note?.content).trim()
  return fromBody || fallback
}

// Resumo de 1 linha: primeira linha do corpo que nao seja o proprio titulo.
export function ideaSnippet(note) {
  const title = (note?.title || '').trim()
  const lines = (note?.content || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const body = lines.find((l) => l !== title)
  return body || ''
}

// Ordena ideias por atualizacao (mais recentes primeiro), sem mutar a origem.
export function sortIdeasByRecent(notes = []) {
  return [...notes].sort((a, b) =>
    (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''),
  )
}
