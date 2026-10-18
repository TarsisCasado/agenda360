import {
  LADO_MAXIMO, QUALIDADE_JPEG, MAX_BYTES,
  planoDeImagem, ehHeic, normalizarMime,
} from './anexoPolitica'

// ---------------------------------------------------------------------------
// PREPARO DE IMAGEM — a unica parte deste checkpoint que toca APIs do
// navegador. A decisao mora em `anexoPolitica.js`; aqui so se executa.
//
// -------------------- O QUE O REDESENHO RESOLVE DE UMA VEZ -----------------
//
// Decodificar a foto e redesenha-la num canvas resolve tres problemas que, de
// outro modo, pediriam tres bibliotecas:
//
//   TAMANHO     uma foto de 12 MP vira 2000px de lado maior: ~4 MB viram
//               ~400 kB. Isso e dado movel de quem envia, e egresso pago toda
//               vez que alguem abre.
//   EXIF        o canvas conhece PIXEL, nao metadado. O que sai do
//               `toBlob` tem exatamente os pixels e mais nada: sem GPS, sem
//               modelo do aparelho, sem horario. A remocao nao e um passo
//               extra que alguem pode esquecer — e consequencia de redesenhar.
//   ORIENTACAO  a mesma EXIF que carrega o GPS carrega o "esta foto esta de
//               lado". Como ela e descartada, a rotacao precisa ser APLICADA
//               antes, ou a foto sai deitada. Dai `imageOrientation:
//               'from-image'`, e o caminho de <img> como reserva, que os
//               navegadores modernos ja orientam sozinhos ao desenhar.
//
// -------------------- HEIC, E POR QUE ISTO E BEST-EFFORT -------------------
//
// HEIC e o formato nativo da camera do iPhone. Quem decodifica depende do
// SISTEMA, nao do nosso codigo: Safari no iOS e no macOS normalmente abre;
// Chrome e Firefox no desktop normalmente NAO. Nao da para prometer conversao.
//
// Entao a regra e: TENTA converter; se nao der, GUARDA O ORIGINAL e diz isso
// em voz alta. O que nao se faz, em hipotese nenhuma, e recusar a foto — a
// pessoa tirou uma foto de um documento e quer guarda-la; perde-la por detalhe
// de codec seria o produto falhando na unica coisa que foi pedida.
//
// (Na pratica o caso mais comum nem chega aqui: ao escolher da fototeca com
// `accept="image/*"`, o proprio iOS costuma entregar JPEG ja convertido. Este
// caminho cobre o resto — Arquivos, compartilhamento, AirDrop.)
// ---------------------------------------------------------------------------

export const MOTIVO_PREPARO = {
  CONVERTIDA: 'convertida',
  PRESERVADA: 'preservada',
  SEM_SUPORTE: 'sem_suporte_decodificacao',
  FALHA_CODIFICACAO: 'falha_codificacao',
  MAIOR_QUE_ORIGINAL: 'resultado_maior_que_original',
}

// Frase para a pessoa. Vazia quando nao ha nada de incomum a dizer — nem toda
// decisao interna merece virar aviso na tela.
export function avisoDoPreparo(resultado) {
  if (!resultado) return ''
  if (resultado.motivo === MOTIVO_PREPARO.SEM_SUPORTE) {
    return ehHeic(resultado.mime)
      ? 'Guardei a foto no formato original do iPhone (HEIC). Este navegador não consegue convertê-la, então ela pode não abrir em outros aparelhos.'
      : 'Guardei o arquivo original: este navegador não conseguiu processar a imagem.'
  }
  if (resultado.motivo === MOTIVO_PREPARO.FALHA_CODIFICACAO) {
    return 'Guardei a imagem original: a conversão falhou neste navegador.'
  }
  return ''
}

// --- Decodificacao ----------------------------------------------------------

async function decodificarComBitmap(blob) {
  if (typeof createImageBitmap !== 'function') return null
  try {
    // A opcao de orientacao e recente; onde nao existe, o navegador pode
    // lancar ou simplesmente ignora-la. Os dois casos caem para a tentativa
    // seguinte em vez de derrubar o preparo.
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    try {
      return await createImageBitmap(blob)
    } catch {
      return null
    }
  }
}

function decodificarComImg(blob) {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    const encerrar = (valor) => { URL.revokeObjectURL(url); resolve(valor) }
    img.onload = () => encerrar(img)
    img.onerror = () => encerrar(null)
    img.src = url
  })
}

async function decodificarPadrao(blob) {
  return (await decodificarComBitmap(blob)) || (await decodificarComImg(blob))
}

const dimensoesDe = (fonte) => ({
  largura: fonte?.width || fonte?.naturalWidth || 0,
  altura: fonte?.height || fonte?.naturalHeight || 0,
})

// --- Codificacao ------------------------------------------------------------

async function codificarPadrao(fonte, largura, altura, qualidade) {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(largura, altura)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(fonte, 0, 0, largura, altura)
    return canvas.convertToBlob({ type: 'image/jpeg', quality: qualidade })
  }
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(fonte, 0, 0, largura, altura)
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', qualidade)
  })
}

// --- O preparo --------------------------------------------------------------

/**
 * Prepara uma imagem para envio. NUNCA lanca e NUNCA devolve menos do que
 * recebeu: no pior caso, entrega o arquivo original de volta com o motivo.
 *
 * `decodificar` e `codificar` sao injetaveis para teste — e so por isso que
 * esta funcao pode ser exercitada sem navegador.
 */
export async function prepararImagem(arquivo, {
  ladoMaximo = LADO_MAXIMO,
  qualidade = QUALIDADE_JPEG,
  decodificar = decodificarPadrao,
  codificar = codificarPadrao,
} = {}) {
  const mime = normalizarMime(arquivo?.type)
  const bytesOriginais = Number(arquivo?.size) || 0
  const original = (motivo, extra = {}) => ({
    arquivo, mime, convertida: false, motivo,
    bytesOriginais, bytesFinais: bytesOriginais,
    largura: 0, altura: 0, ...extra,
  })

  const fonte = await decodificar(arquivo)
  if (!fonte) return original(MOTIVO_PREPARO.SEM_SUPORTE)

  const { largura, altura } = dimensoesDe(fonte)
  const plano = planoDeImagem(mime, { largura, altura, ladoMaximo })

  if (plano.acao === 'preservar') {
    // Sabemos as dimensoes mesmo sem converter — e elas vao para o descritor,
    // que e imutavel e so aceita o que for dito no insert.
    return original(MOTIVO_PREPARO.PRESERVADA, { largura, altura, porque: plano.porque })
  }

  const alvoL = plano.largura || largura
  const alvoA = plano.altura || altura

  let convertido = null
  try {
    convertido = await codificar(fonte, alvoL, alvoA, qualidade)
  } catch {
    convertido = null
  }
  if (!convertido) {
    return original(MOTIVO_PREPARO.FALHA_CODIFICACAO, { largura, altura })
  }

  const bytesFinais = Number(convertido.size) || 0

  // Estouro do teto apos converter: so pode acontecer com imagem enorme e
  // pouco compressivel. Volta para o original, que ja passou pela validacao.
  if (bytesFinais > MAX_BYTES) {
    return original(MOTIVO_PREPARO.FALHA_CODIFICACAO, { largura, altura })
  }

  // Resultado MAIOR que o original, sem precisar reduzir: o unico ganho seria
  // tirar o EXIF. Esse ganho e de privacidade, nao de bytes — e privacidade
  // ganha. Quando houve reducao, o resultado e aceito sempre.
  if (plano.acao === 'reencodar' && bytesFinais >= bytesOriginais) {
    return {
      arquivo: convertido, mime: 'image/jpeg', convertida: true,
      motivo: MOTIVO_PREPARO.MAIOR_QUE_ORIGINAL,
      bytesOriginais, bytesFinais, largura: alvoL, altura: alvoA,
    }
  }

  return {
    arquivo: convertido, mime: 'image/jpeg', convertida: true,
    motivo: MOTIVO_PREPARO.CONVERTIDA,
    bytesOriginais, bytesFinais, largura: alvoL, altura: alvoA,
  }
}
