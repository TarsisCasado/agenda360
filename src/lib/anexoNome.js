import { extensaoDe, normalizarMime } from './anexoPolitica'

// ---------------------------------------------------------------------------
// O NOME DO ARQUIVO BAIXADO, E A URL QUE PEDE PARA BAIXAR.
//
// Duas coisas pequenas que moram juntas porque so existem juntas: o Storage
// recebe o nome DENTRO da URL, no parametro `download`.
//
// POR QUE ISTO E PURO E NAO UM METODO DO SERVICO.
//
// Verificado no `@supabase/storage-js` 2.110.1 (`createSignedUrl`, linhas
// 1045-1050 do bundle): o POST para `/object/sign/<path>` envia APENAS
// `{ expiresIn }`. O parametro `download` e colado na URL ja assinada, do lado
// do cliente, e NAO entra na assinatura.
//
// A consequencia e o ponto inteiro deste modulo: a URL que baixa pode ser
// derivada da URL que exibe, aqui, sem rede. E e isso que conserta o download
// no iPhone — nao ha mais `await` entre o toque da pessoa e a abertura do
// link, entao o Safari nao tem por que tratar a abertura como pop-up de
// origem desconhecida.
//
// Nada disto afrouxa a seguranca: o token continua sendo o mesmo token
// assinado, com a mesma validade de uma hora. `download` nao e credencial, e
// instrucao de cabecalho — quem nao tem o token nao baixa nada.
// ---------------------------------------------------------------------------

// Teto do nome. Nenhum sistema de arquivos reclama de 80; o iOS corta bem
// antes disso na exibicao.
export const MAX_NOME = 80

// ---------------------------------------------------------------------------
// DE UM TITULO DE NOTA PARA UM NOME DE ARQUIVO.
//
// O que a pessoa ve na pasta Downloads tem de dizer de onde aquilo veio. Hoje
// o arquivo chega com o UUID do path (`a1b2c3d4-….jpg`), que nao diz nada.
//
// A limpeza e CONSERVADORA de proposito. Nao e estetica: um nome de arquivo
// que viaja num cabecalho HTTP e depois no sistema de arquivos tem tres
// armadilhas conhecidas — separador de caminho (`/`, `\`), quebra de linha
// (que parte o cabecalho em dois) e nome reservado. Em vez de tentar listar o
// que e perigoso, mantem-se so o que e seguramente inofensivo.
// ---------------------------------------------------------------------------
export function nomeDeArquivoSeguro(base, mime, { maximo = MAX_NOME } = {}) {
  const ext = extensaoDe(normalizarMime(mime))

  let limpo = String(base ?? '')
    .normalize('NFD')
    // Tira o acento, preserva a letra: "Reunião" -> "Reuniao". Perder o
    // acento e menos ruim que entregar um nome que o download quebra.
    .replace(/[̀-ͯ]/g, '')
    // Tudo que nao for letra, numero, espaco, ponto, hifen ou sublinhado vira
    // hifen. Inclui `/`, `\`, `\n`, `:`, `"` e qualquer coisa fora do ASCII.
    .replace(/[^A-Za-z0-9 ._-]+/g, '-')
    .replace(/[-\s]+/g, '-')
    // Ponto no inicio esconde o arquivo em sistemas unix; hifen no inicio faz
    // a linha de comando confundi-lo com uma opcao.
    .replace(/^[-._]+/, '')
    .replace(/[-._]+$/, '')
    .slice(0, maximo)
    .replace(/[-._]+$/, '')

  // Sobrou nada (titulo vazio, so emoji, so pontuacao): o nome generico ainda
  // e melhor que um UUID, porque diz o que a coisa e.
  if (!limpo) limpo = 'anexo'

  // O arquivo ja terminava com a extensao certa: nao duplicar.
  if (limpo.toLowerCase().endsWith('.' + ext)) return limpo
  return `${limpo}.${ext}`
}

// ---------------------------------------------------------------------------
// A MESMA URL, PEDINDO PARA BAIXAR.
//
// `download` faz o Storage responder com `Content-Disposition: attachment`.
// E o servidor que resolve isso, e nao o atributo `download` do `<a>` — que e
// IGNORADO em link de outra origem, o que e precisamente o caso aqui.
//
// Devolve null quando nao ha URL: quem chama ja trata esse caso, e inventar
// uma string quebrada seria pior.
// ---------------------------------------------------------------------------
export function urlComDownload(url, nome = '') {
  if (!url) return null
  const base = String(url)
  // ---------------------------------------------------------------------------
  // `data:` E `blob:` SAIEM INTACTAS.
  //
  // No modo demonstracao a URL do anexo e uma data-URL: o conteudo do arquivo
  // ESTA na string. Acrescentar `?download=` ali nao e um parametro, e lixo
  // colado no fim do base64 — o navegador passaria a decodificar uma imagem
  // corrompida. Nestes dois esquemas quem faz o arquivo ser salvo e o atributo
  // `download` do proprio `<a>`, que funciona porque a origem e a mesma.
  // ---------------------------------------------------------------------------
  if (/^(data|blob):/i.test(base)) return base
  // Nao duplicar o parametro se ele ja estiver la (URL pedida ao Storage com
  // `baixar: true`).
  if (/[?&]download=/.test(base)) return base
  const separador = base.includes('?') ? '&' : '?'
  const valor = nome ? encodeURIComponent(nome) : ''
  return `${base}${separador}download=${valor}`
}
