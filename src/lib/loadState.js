// ---------------------------------------------------------------------------
// ESTADO DE CARREGAMENTO — a decisao de 4 estados, num lugar so e testavel.
//
// C2.1: nenhuma tela pode dizer "vazio" quando, na verdade, FALHOU ao carregar.
// A distincao que todas as telas de lista precisam fazer, sem reinventa-la:
//   'error'   -> a busca falhou (rede, auth, RLS...). NUNCA mostrar "livre".
//   'loading' -> buscando o PRIMEIRO resultado (sem itens ainda) -> esqueleto.
//   'empty'   -> buscou com sucesso e nao ha nada -> "dia livre" (boa noticia).
//   'data'    -> buscou com sucesso e ha itens -> a lista.
//
// `error` vence `hasItems`: dados antigos em memoria nunca mascaram uma falha
// nova — surge o erro, nao a lista velha dando-se por atual.
// ---------------------------------------------------------------------------
export function viewState({ loading, error, hasItems }) {
  if (error) return 'error'
  if (loading && !hasItems) return 'loading'
  if (!hasItems) return 'empty'
  return 'data'
}
