// ---------------------------------------------------------------------------
// Pequenos seletores puros de estado de UI (sem React), para manter a logica
// testavel e consistente entre telas. Nao acessam rede/DOM.
// ---------------------------------------------------------------------------

// Estado do "portao" de workspace na casca autenticada:
//   'loading' -> ainda carregando a lista de workspaces
//   'empty'   -> carregou e o usuario nao possui nenhum workspace
//   'ready'   -> ha ao menos um workspace utilizavel
// Nunca lanca; entradas ausentes sao tratadas como vazio.
export function workspaceGate({ loading, workspaces } = {}) {
  if (loading) return 'loading'
  if (!Array.isArray(workspaces) || workspaces.length === 0) return 'empty'
  return 'ready'
}
