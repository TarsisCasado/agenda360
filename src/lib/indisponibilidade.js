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
// capturar um bug nosso que por acaso cite a palavra. Sao quatro dialetos para
// a mesma coisa: Chrome diz "Failed to fetch", Safari diz "Load failed",
// Firefox diz "NetworkError...", o undici do Node diz "fetch failed".
const MENSAGEM_DE_REDE =
  /^(failed to fetch|networkerror|network request failed|load failed|fetch failed)/i

// O postgrest nao propaga o erro original: ele monta `"<Nome>: <mensagem>"`
// numa string. Entao "TypeError: Load failed" e TEXTO, nao um TypeError — foi
// exatamente por isso que a regra de mensagem, sozinha, nao reconheceu o
// Safari no QA do CP6.4.6. Aqui o prefixo e removido antes de comparar.
const semPrefixoDeNome = (mensagem) => String(mensagem || '').replace(/^[A-Za-z]*Error:\s*/, '')

export function ehIndisponibilidadeTransitoria(err, profundidade = 0) {
  if (!err) return false

  // 1. PostgREST/Supabase: transporte falhou antes de existir resposta HTTP.
  if (err.status === 0) return true

  // 2. Edge Function inalcancavel (@supabase/functions-js).
  if (err.name === 'FunctionsFetchError') return true

  // 3. Abort/timeout de transporte (AbortController, DOMException).
  if (err.name === 'AbortError' || err.code === 'ABORT_ERR') return true

  // 4. fetch do browser lancando de verdade (fora do wrapper do postgrest).
  if (err instanceof TypeError && MENSAGEM_DE_REDE.test(semPrefixoDeNome(err.message))) return true

  // 5. O objeto cru do postgrest, quando o `status` nao chegou ate aqui (um
  //    servico que ainda relance `error` direto). A assinatura e estreita de
  //    proposito: `code` VAZIO — string vazia, nao ausente — e so o postgrest
  //    produz isso, e so no caminho de transporte. Todo erro de aplicacao vem
  //    com code preenchido (42501, 23503, PGRST301...), e um Error comum tem
  //    `code` undefined. Isto NAO alarga a allowlist: acrescenta uma forma
  //    conhecida, nao uma heuristica.
  if (err.code === '' && MENSAGEM_DE_REDE.test(semPrefixoDeNome(err.message))) return true

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
