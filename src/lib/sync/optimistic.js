// ---------------------------------------------------------------------------
// Reducers PUROS para atualizacao otimista da Caixa de Entrada.
// Nao tocam em rede/estado do React: recebem valores, retornam novos valores.
// Usados pela pagina para aplicar a mudanca no estado local IMEDIATAMENTE e,
// em caso de erro na sincronizacao, reverter (rollback).
// ---------------------------------------------------------------------------

// ----- Lista de notas -------------------------------------------------------
export function upsertNote(notes, note) {
  const idx = notes.findIndex((n) => n.id === note.id)
  if (idx === -1) return [note, ...notes]
  const copy = notes.slice()
  copy[idx] = note
  return copy
}

export function patchNote(notes, id, patch) {
  return notes.map((n) => (n.id === id ? { ...n, ...patch } : n))
}

export function removeNote(notes, id) {
  return notes.filter((n) => n.id !== id)
}

// Reconcilia uma nota temporaria (id provisorio) com a versao real do servidor.
export function replaceNote(notes, tempId, realNote) {
  return notes.map((n) => (n.id === tempId ? realNote : n))
}

// Reordena por updated_at desc (mesma ordenacao do service), mantendo a lista
// consistente apos edicoes locais.
export function sortByUpdated(notes) {
  return notes.slice().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
}

// ----- Mapa de itens de checklist (noteId -> item[]) ------------------------
export function setItems(map, noteId, items) {
  return { ...map, [noteId]: items }
}

export function addItem(map, noteId, item) {
  const list = map[noteId] || []
  return { ...map, [noteId]: [...list, item] }
}

export function patchItem(map, noteId, itemId, patch) {
  const list = map[noteId] || []
  return { ...map, [noteId]: list.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
}

export function removeItem(map, noteId, itemId) {
  const list = map[noteId] || []
  return { ...map, [noteId]: list.filter((it) => it.id !== itemId) }
}

export function replaceItem(map, noteId, tempId, realItem) {
  const list = map[noteId] || []
  return { ...map, [noteId]: list.map((it) => (it.id === tempId ? realItem : it)) }
}

// Move os itens de uma nota temporaria para o id real (reconcilia checklist
// recem-criado).
export function moveItems(map, fromId, toId) {
  if (fromId === toId) return map
  const next = { ...map }
  next[toId] = next[fromId] || []
  delete next[fromId]
  return next
}

export function dropItems(map, noteId) {
  if (!(noteId in map)) return map
  const next = { ...map }
  delete next[noteId]
  return next
}
