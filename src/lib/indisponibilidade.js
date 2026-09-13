// ---------------------------------------------------------------------------
// INDISPONIBILIDADE TRANSITORIA — o unico lugar que decide se vale degradar.
//
// O Copiloto precisa continuar o turno quando o backend esta temporariamente
// inalcancavel (Wi-Fi caiu, aviao, tunel). Mas um `catch` generico faria o
// oposto do que se quer: RLS quebrada num deploy, FK violada, JWT expirado e
// bug de programacao passariam a "modo offline", e o defeito viveria escondido
// por semanas. Entao a regra e ALLOWLIST: degrada-se so no que foi reconhecido
// como transporte; o resto sobe.
//
// A FORMA REAL DO ERRO, que nao e a obvia. O `postgrest-js` NAO lanca
// TypeError quando o fetch falha: ele captura e devolve
//
//   { status: 0, error: { message: 'TypeError: Failed to fetch', code: '' } }
//
// e os nossos servicos fazem `if (error) throw error` — ou seja, lancam um
// OBJETO PURO, sem `name`, sem ser `Error`. Um classificador escrito em cima de
// `err instanceof TypeError` reprovaria justamente o caso que importa.
//
// `status === 0` e exclusivo desse caminho de transporte: todo erro de
// aplicacao chega com status HTTP real e `code` preenchido (42501 RLS, 23503
// FK, PGRST301 JWT, PGRST116 zero linhas). Por isso os servicos passaram a
// PRESERVAR status e code ao relancar — sem isso nao ha como decidir.
//
// `navigator.onLine` NAO e autoridade aqui: ele diz "tem link", nao "o servidor
// responde", e mente em captive portal. Serve, no maximo, para escolher uma
// palavra na tela.
// ---------------------------------------------------------------------------

// Mensagens de falha de fetch dos motores reais, ancoradas no inicio para nao
// capturar um bug nosso que por acaso cite a palavra.
const MENSAGEM_DE_REDE =
  /^(failed to fetch|networkerror|network request failed|load failed|fetch failed)/i

export function ehIndisponibilidadeTransitoria(err, profundidade = 0) {
  if (!err) return false

  // 1. PostgREST/Supabase: transporte falhou antes de existir resposta HTTP.
  if (err.status === 0) return true

  // 2. Edge Function inalcancavel (@supabase/functions-js).
  if (err.name === 'FunctionsFetchError') return true

  // 3. Abort/timeout de transporte (AbortController, DOMException).
  if (err.name === 'AbortError' || err.code === 'ABORT_ERR') return true

  // 4. fetch do browser lancando de verdade (fora do wrapper do postgrest).
  if (err instanceof TypeError && MENSAGEM_DE_REDE.test(String(err.message || ''))) return true

  // Erro embrulhado (o `toolRegistry` padroniza falhas de service em
  // AgentError para nao vazar stack, mas preserva a causa). Um nivel basta; o
  // limite existe para nao girar em cadeia circular.
  if (err.cause && profundidade < 3) return ehIndisponibilidadeTransitoria(err.cause, profundidade + 1)

  // Default deliberado: erro de aplicacao ate prova em contrario.
  return false
}

// Relanca um erro do Supabase como Error de verdade, PRESERVANDO o que permite
// classifica-lo. `{ data, error }` sozinho perde o `status`, e e o status que
// separa "sem rede" de "sem permissao".
export function erroDeBanco(error, status) {
  const e = new Error(error?.message || 'Falha ao acessar o banco de dados.')
  e.name = 'SupabaseError'
  e.code = error?.code ?? null
  e.status = status ?? null
  e.details = error?.details ?? null
  e.hint = error?.hint ?? null
  return e
}
