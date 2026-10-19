// ---------------------------------------------------------------------------
// POLITICA DE ANEXO — pura, sem rede, sem DOM, sem banco.
//
// Este arquivo responde a UMA pergunta: este arquivo pode entrar, e em que
// condicoes? Nao envia, nao converte, nao desenha. Separar a DECISAO do EFEITO
// e o que torna a parte mais sensivel do upload testavel sem navegador.
//
// -------------------- POR QUE ALLOWLIST, E NAO BLOCKLIST -------------------
//
// Ate aqui o produto aceitava QUALQUER mime nao vazio. Uma blocklist ("proibir
// .exe, .html, .svg") erra por omissao na primeira extensao que ninguem
// lembrou. Uma allowlist erra por excesso de zelo — recusa algo legitimo — e
// esse erro e visivel, reclamavel e corrigivel acrescentando uma linha aqui.
//
// O CRITERIO DE PERIGO e o que o NAVEGADOR faz com o arquivo quando ele e
// aberto pela URL assinada do Storage:
//
//   image/svg+xml   SVG e um documento XML que EXECUTA <script>. Aberto em
//                   aba, roda no dominio do Storage do Supabase. Nao alcanca
//                   a sessao do Agenda 360 (outra origem), mas e codigo
//                   hostil hospedado sob o seu projeto. FORA.
//   text/html       idem, sem disfarce. FORA.
//   *xhtml*, *xml*  mesma familia. FORA.
//   executaveis     o navegador nao os roda, mas o disco de quem baixa sim.
//                   O produto nao e repositorio de binario. FORA.
//
// text/plain e text/csv ficam DENTRO: o navegador os exibe como texto, sem
// executar nada.
//
// -------------------- ASSINATURA: DEFESA EM PROFUNDIDADE -------------------
//
// `file.type` vem do sistema operacional e e, no fim, palpite por extensao.
// Renomear `virus.html` para `foto.jpg` entrega um `image/jpeg` mentiroso.
// Isso sozinho ja seria pouco perigoso — o Storage devolve o arquivo com o
// contentType que gravamos, entao um HTML servido como image/jpeg nao executa.
// Mas conferir os primeiros bytes custa quase nada e fecha a porta antes dela
// virar discussao.
//
// A conferencia e por CONTRADICAO, nao por prova: se o arquivo tem bytes
// suficientes e eles discordam do mime declarado, recusa. Se nao houver bytes
// (ou o formato nao tiver assinatura estavel, como texto), nao ha o que
// contradizer e a verificacao se cala.
// ---------------------------------------------------------------------------

// Teto duro, igual para os dois modos. Mantido em 10 MB por compatibilidade
// com o contrato que ja existia (`MAX_ASSET_BYTES`).
export const MAX_BYTES = 10 * 1024 * 1024

// Teto do MODO DEMO, muito menor e por um motivo fisico: ali o binario vira
// data-URL dentro do localStorage, cuja cota tipica e ~5 MB para o site
// INTEIRO — notas, tarefas, links e anexos no mesmo balde. Base64 ainda infla
// o arquivo em ~33%. Recusar antes com uma frase clara e melhor do que deixar
// o navegador lancar QuotaExceededError no meio do envio.
export const MAX_BYTES_DEMO = 1.5 * 1024 * 1024

// Lado maior, em pixels, para o qual uma foto e reduzida antes de subir. 2000px
// cobre leitura em tela cheia e impressao caseira, e derruba uma foto de 12 MP
// de ~4 MB para ~400 kB.
export const LADO_MAXIMO = 2000

// Qualidade do JPEG de saida. 0.85 e o ponto em que artefato deixa de ser
// perceptivel em foto de documento, que e o caso de uso real aqui.
export const QUALIDADE_JPEG = 0.85

export const MOTIVO = {
  SEM_ARQUIVO: 'sem_arquivo',
  SEM_MIME: 'sem_mime',
  FORMATO_RECUSADO: 'formato_recusado',
  ACIMA_DO_LIMITE: 'acima_do_limite',
  ACIMA_DO_LIMITE_DEMO: 'acima_do_limite_demo',
  VAZIO: 'vazio',
  ASSINATURA_DIVERGENTE: 'assinatura_divergente',
}

// Assinaturas (magic numbers) dos formatos onde ela e estavel.
// `deslocamento` existe por causa do HEIC: os 4 primeiros bytes sao o tamanho
// da caixa ISO-BMFF e variam; o que identifica e o 'ftyp' na posicao 4.
const ASSINATURAS = {
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff] }],
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  'image/gif': [{ bytes: [0x47, 0x49, 0x46, 0x38] }],
  'image/webp': [{ bytes: [0x52, 0x49, 0x46, 0x46] }],
  'image/heic': [{ bytes: [0x66, 0x74, 0x79, 0x70], deslocamento: 4 }],
  'image/heif': [{ bytes: [0x66, 0x74, 0x79, 0x70], deslocamento: 4 }],
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }],
}

// ---------------------------------------------------------------------------
// A ALLOWLIST. Cada linha e uma decisao explicita: o que o navegador faz com
// este tipo, e por que isso e aceitavel.
// ---------------------------------------------------------------------------
export const FORMATOS = [
  // Imagens que todo navegador decodifica.
  { mime: 'image/jpeg', kind: 'image', ext: 'jpg', rotulo: 'Imagem JPEG' },
  { mime: 'image/png', kind: 'image', ext: 'png', rotulo: 'Imagem PNG' },
  { mime: 'image/webp', kind: 'image', ext: 'webp', rotulo: 'Imagem WebP' },
  // GIF entra, mas NUNCA e reconvertido — ver `planoDeImagem`.
  { mime: 'image/gif', kind: 'image', ext: 'gif', rotulo: 'Imagem GIF' },
  // O formato nativo da camera do iPhone. Entra; a conversao e best-effort.
  { mime: 'image/heic', kind: 'image', ext: 'heic', rotulo: 'Foto HEIC' },
  { mime: 'image/heif', kind: 'image', ext: 'heif', rotulo: 'Foto HEIF' },

  { mime: 'application/pdf', kind: 'pdf', ext: 'pdf', rotulo: 'PDF' },

  { mime: 'audio/mpeg', kind: 'audio', ext: 'mp3', rotulo: 'Áudio MP3' },
  // Mesma coisa que `audio/mpeg` para quem grava: algumas plataformas
  // reportam assim, e recusar por grafia seria recusar o arquivo certo.
  { mime: 'audio/mp3', kind: 'audio', ext: 'mp3', rotulo: 'Áudio MP3' },
  { mime: 'audio/wav', kind: 'audio', ext: 'wav', rotulo: 'Áudio WAV' },
  { mime: 'audio/x-wav', kind: 'audio', ext: 'wav', rotulo: 'Áudio WAV' },
  { mime: 'audio/wave', kind: 'audio', ext: 'wav', rotulo: 'Áudio WAV' },
  { mime: 'audio/mp4', kind: 'audio', ext: 'm4a', rotulo: 'Áudio M4A' },
  // O Gravador de Voz do iPhone entrega `.m4a` com ESTE mime, nao `audio/mp4`.
  { mime: 'audio/x-m4a', kind: 'audio', ext: 'm4a', rotulo: 'Áudio M4A' },
  { mime: 'audio/aac', kind: 'audio', ext: 'aac', rotulo: 'Áudio AAC' },
  { mime: 'audio/webm', kind: 'audio', ext: 'weba', rotulo: 'Áudio WebM' },
  { mime: 'audio/ogg', kind: 'audio', ext: 'ogg', rotulo: 'Áudio OGG' },

  // Texto puro: o navegador EXIBE, nao executa.
  { mime: 'text/plain', kind: 'file', ext: 'txt', rotulo: 'Texto' },
  { mime: 'text/csv', kind: 'file', ext: 'csv', rotulo: 'Planilha CSV' },

  // Documentos de escritorio: baixados, nunca renderizados pelo navegador.
  { mime: 'application/msword', kind: 'file', ext: 'doc', rotulo: 'Documento Word' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'file', ext: 'docx', rotulo: 'Documento Word',
  },
  { mime: 'application/vnd.ms-excel', kind: 'file', ext: 'xls', rotulo: 'Planilha Excel' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'file', ext: 'xlsx', rotulo: 'Planilha Excel',
  },
  { mime: 'application/vnd.ms-powerpoint', kind: 'file', ext: 'ppt', rotulo: 'Apresentação' },
  {
    mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    kind: 'file', ext: 'pptx', rotulo: 'Apresentação',
  },
]

const POR_MIME = new Map(FORMATOS.map((f) => [f.mime, f]))

export const MIMES_ACEITOS = FORMATOS.map((f) => f.mime)

// ---------------------------------------------------------------------------
// DUAS LISTAS, E A DIFERENCA E O PONTO.
//
// `MIMES_ACEITOS` e o que a pessoa pode ESCOLHER. `MIMES_NO_BUCKET` e o que
// pode ser GUARDADO. HEIC e HEIF estao na primeira e nao na segunda: a foto do
// iPhone entra pela porta, mas so passa pela segunda depois de convertida em
// JPEG, porque o original carrega EXIF com GPS que nao conseguimos remover sem
// decodificar.
//
// Isso nao e zelo do cliente: o bucket `captures` foi configurado no UX-M2.2
// com exatamente estes 23 tipos, e um HEIC original e recusado pelo SERVIDOR.
// A lista daqui existe para que a recusa aconteca ANTES da rede, com uma frase
// em vez de um 400 — e `anexoPolitica.test.js` falha se as duas divergirem.
// ---------------------------------------------------------------------------
export const SO_CONVERTIDO = ['image/heic', 'image/heif']

export const MIMES_NO_BUCKET = MIMES_ACEITOS.filter((m) => !SO_CONVERTIDO.includes(m))

// `true` quando o Storage aceitaria este mime como esta.
export const podeSubir = (mime) => MIMES_NO_BUCKET.includes(normalizarMime(mime))

// O teto do bucket, em bytes, declarado no UX-M2.2. Repetido aqui de proposito:
// se um dia os dois divergirem, o cliente recusa antes e a pessoa le o motivo,
// em vez de descobrir pelo erro da rede.
export const MAX_BYTES_BUCKET = 10485760

// O valor do atributo `accept` do seletor de arquivo. Nao e seguranca — e
// cortesia: faz o iOS abrir a fototeca ja filtrada em vez de oferecer tudo e
// recusar depois.
export const ACCEPT = MIMES_ACEITOS.join(',')

export const normalizarMime = (mime) => String(mime || '').trim().toLowerCase().split(';')[0]

export const formatoDe = (mime) => POR_MIME.get(normalizarMime(mime)) || null
export const ehAceito = (mime) => POR_MIME.has(normalizarMime(mime))
export const ehImagem = (mime) => formatoDe(mime)?.kind === 'image'
export const ehHeic = (mime) => ['image/heic', 'image/heif'].includes(normalizarMime(mime))

// Formatos que PODEM carregar EXIF — e, portanto, latitude e longitude de onde
// a foto foi tirada. Sao estes que valem reconverter mesmo sem precisar
// encolher: trocar alguns kilobytes por nao publicar o endereco de casa e um
// negocio obviamente bom.
const PODE_TER_EXIF = ['image/jpeg', 'image/heic', 'image/heif', 'image/webp']
export const podeTerExif = (mime) => PODE_TER_EXIF.includes(normalizarMime(mime))

export const kindDe = (mime) => formatoDe(mime)?.kind || 'file'
export const extensaoDe = (mime) => formatoDe(mime)?.ext || 'bin'

// ---------------------------------------------------------------------------
// URLS TEMPORARIAS. A URL assinada do Storage vale uma hora. Quem deixa o
// detalhe aberto mais que isso ve a imagem parar de carregar — entao o lugar
// certo de decidir "ja venceu?" e aqui, puro e testavel, e nao espalhado pelos
// componentes.
//
// A MARGEM existe porque o relogio do aparelho e o do servidor nao batem, e
// porque entre decidir e usar passa tempo. Renovar 60 segundos antes custa uma
// chamada a mais e evita a imagem quebrada.
// ---------------------------------------------------------------------------
export const EXPIRACAO_URL_SEGUNDOS = 3600
export const MARGEM_RENOVACAO_SEGUNDOS = 60

export function urlExpirada(expiraEm, agora = Date.now(), margemSegundos = MARGEM_RENOVACAO_SEGUNDOS) {
  if (!expiraEm) return true
  const limite = typeof expiraEm === 'number' ? expiraEm : Date.parse(expiraEm)
  if (!Number.isFinite(limite)) return true
  return limite - margemSegundos * 1000 <= agora
}

export function tamanhoLegivel(bytes) {
  const n = Number(bytes) || 0
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
  if (n >= 1024) return `${Math.round(n / 1024)} kB`
  return `${n} bytes`
}

// --- Assinatura -------------------------------------------------------------

// `true` quando os bytes NAO contradizem o mime. Silencia (devolve true) se
// nao houver assinatura conhecida ou bytes suficientes para comparar: a
// ausencia de prova nao e prova de fraude.
export function assinaturaConfere(bytes, mime) {
  const esperadas = ASSINATURAS[normalizarMime(mime)]
  if (!esperadas) return true
  if (!bytes || bytes.length === 0) return true
  return esperadas.some(({ bytes: assinatura, deslocamento = 0 }) => {
    const disponivel = bytes.length - deslocamento
    if (disponivel <= 0) return true
    const n = Math.min(assinatura.length, disponivel)
    for (let i = 0; i < n; i += 1) {
      if (bytes[deslocamento + i] !== assinatura[i]) return false
    }
    return true
  })
}

// --- A decisao --------------------------------------------------------------

const RECUSA = (motivo, mensagem) => ({ ok: false, motivo, mensagem })

/**
 * Decide se um arquivo pode ser anexado. PURA: recebe forma, nao Blob.
 *
 * @param {{type?: string, size?: number}} arquivo
 * @param {{demo?: boolean, bytes?: Uint8Array|number[]}} opcoes
 *   `bytes` e o inicio do arquivo, quando ja lido — habilita a conferencia de
 *   assinatura. Sem ele a validacao continua valendo, so sem essa camada.
 */
export function validarArquivo(arquivo, { demo = false, bytes = null } = {}) {
  if (!arquivo) return RECUSA(MOTIVO.SEM_ARQUIVO, 'Nenhum arquivo foi escolhido.')

  const mime = normalizarMime(arquivo.type)
  if (!mime) {
    return RECUSA(
      MOTIVO.SEM_MIME,
      'Não consegui identificar o tipo deste arquivo (mime ausente). Tente enviá-lo de novo, ou converta para PDF.',
    )
  }

  const formato = POR_MIME.get(mime)
  if (!formato) {
    return RECUSA(
      MOTIVO.FORMATO_RECUSADO,
      `Este tipo de arquivo não pode ser anexado (${mime}). Valem fotos, PDF, áudio, texto e documentos do Office.`,
    )
  }

  const tamanho = Number(arquivo.size)
  // Tamanho ANTES de assinatura, de proposito: um arquivo de 40 MB nao deve
  // ser lido so para descobrir que tambem e grande demais.
  if (Number.isFinite(tamanho)) {
    if (tamanho === 0) {
      return RECUSA(MOTIVO.VAZIO, 'Este arquivo está vazio.')
    }
    if (tamanho > MAX_BYTES) {
      return RECUSA(
        MOTIVO.ACIMA_DO_LIMITE,
        `Arquivo de ${tamanhoLegivel(tamanho)} excede o limite de ${tamanhoLegivel(MAX_BYTES)}.`,
      )
    }
    if (demo && tamanho > MAX_BYTES_DEMO) {
      return RECUSA(
        MOTIVO.ACIMA_DO_LIMITE_DEMO,
        `No modo demonstração o limite é ${tamanhoLegivel(MAX_BYTES_DEMO)} por arquivo, porque o conteúdo fica guardado no próprio navegador.`,
      )
    }
  }

  if (!assinaturaConfere(bytes, mime)) {
    return RECUSA(
      MOTIVO.ASSINATURA_DIVERGENTE,
      'O conteúdo deste arquivo não corresponde ao tipo declarado. Por segurança, ele não foi anexado.',
    )
  }

  return { ok: true, kind: formato.kind, ext: formato.ext, mime, rotulo: formato.rotulo }
}

/**
 * O que fazer com uma IMAGEM aceita, antes de subir. PURA: decide a partir de
 * mime e dimensoes; quem executa e `anexoImagem.js`.
 *
 * As tres saidas possiveis:
 *   'preservar'  nao mexer no arquivo original;
 *   'reduzir'    redesenhar menor e reencodar em JPEG;
 *   'reencodar'  mesmo tamanho, mas reencodar — para tirar o EXIF.
 */
export function planoDeImagem(mime, { largura = 0, altura = 0, ladoMaximo = LADO_MAXIMO } = {}) {
  const m = normalizarMime(mime)

  // GIF animado e o unico formato em que reencodar DESTROI informacao: vira um
  // quadro parado. Nenhuma economia de bytes paga perder a animacao.
  if (m === 'image/gif') {
    return { acao: 'preservar', porque: 'gif_animacao' }
  }

  const maior = Math.max(Number(largura) || 0, Number(altura) || 0)
  if (maior > ladoMaximo) {
    return { acao: 'reduzir', porque: 'acima_do_lado_maximo', ...dimensaoAlvo(largura, altura, ladoMaximo) }
  }

  if (podeTerExif(m)) {
    return { acao: 'reencodar', porque: 'remover_exif', largura, altura }
  }

  // PNG dentro do tamanho: reencodar para JPEG costuma AUMENTAR o arquivo
  // (captura de tela tem area chapada, que PNG comprime melhor) e nao ha EXIF
  // de camera a remover. Fica como esta.
  return { acao: 'preservar', porque: 'ja_adequada' }
}

// Reducao proporcional, nunca ampliacao.
export function dimensaoAlvo(largura, altura, ladoMaximo = LADO_MAXIMO) {
  const l = Number(largura) || 0
  const a = Number(altura) || 0
  const maior = Math.max(l, a)
  if (maior <= 0 || maior <= ladoMaximo) return { largura: l, altura: a }
  const escala = ladoMaximo / maior
  return {
    largura: Math.max(1, Math.round(l * escala)),
    altura: Math.max(1, Math.round(a * escala)),
  }
}
