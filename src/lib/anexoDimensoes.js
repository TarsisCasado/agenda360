import { normalizarMime } from './anexoPolitica'

// ---------------------------------------------------------------------------
// AS DIMENSOES LIDAS DO CABECALHO — ANTES DE DECODIFICAR.
//
// O PROBLEMA QUE ISTO RESOLVE.
//
// O preparo de uma imagem comeca decodificando-a, e decodificar e o passo
// caro: um bitmap ocupa 4 bytes por pixel, independentemente de quanto o
// arquivo comprimido pesa. Uma foto de 48 MP do iPhone sao 195 MB de memoria;
// um panorama de 200 MP sao 800 MB. No Safari do iPhone isso nao e lentidao,
// e a aba recarregando sozinha no meio do envio.
//
// E o tamanho do ARQUIVO nao avisa: PNG de area chapada comprime a taxas
// absurdas, entao 2 MB de arquivo podem virar 1 GB de bitmap. Esse descompasso
// tem nome na literatura de seguranca — bomba de descompressao — e a defesa
// contra ele e sempre a mesma: saber as dimensoes ANTES de alocar.
//
// Felizmente todo formato que aceitamos declara largura e altura nos primeiros
// bytes, em campo de tamanho fixo. Ler isso custa um `slice` de 64 KB e zero
// alocacao de imagem.
//
// SILENCIO QUANDO NAO HA PROVA. Formato que nao sabemos ler (WebP sem perdas,
// cabecalho truncado) devolve `null`, e a politica entao NAO recusa — do mesmo
// jeito que `assinaturaConfere` nao recusa quando nao recebeu bytes. Recusar
// por falta de prova transformaria "nao sei medir" em "voce nao pode anexar".
// ---------------------------------------------------------------------------

// Quanto do inicio do arquivo basta. O SOF do JPEG vem depois dos segmentos de
// metadado, e um EXIF com miniatura embutida passa folgado de 20 KB.
export const BYTES_DE_CABECALHO = 64 * 1024

const u16 = (b, i) => (b[i] << 8) | b[i + 1]
const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const u16le = (b, i) => b[i] | (b[i + 1] << 8)

// ---------------------------------------------------------------------------
// PNG — o IHDR e obrigatoriamente o PRIMEIRO chunk, logo depois da assinatura
// de 8 bytes. Largura e altura sao dois uint32 big-endian em posicao fixa.
// ---------------------------------------------------------------------------
export function dimensoesDePng(bytes) {
  if (!bytes || bytes.length < 24) return null
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null
  // bytes 8..12 = tamanho do chunk, 12..16 = 'IHDR'
  if (!(bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52)) return null
  const largura = u32(bytes, 16)
  const altura = u32(bytes, 20)
  if (!largura || !altura) return null
  return { largura, altura }
}

// ---------------------------------------------------------------------------
// JPEG — nao ha posicao fixa: e preciso caminhar pelos marcadores ate achar um
// SOF (Start Of Frame), que e quem declara as dimensoes.
//
// Dos marcadores 0xC0..0xCF, tres NAO sao SOF e precisam ser pulados como
// segmento comum: C4 (tabela de Huffman), C8 (extensao JPG) e CC (codificacao
// aritmetica). Confundi-los com SOF leria lixo como se fosse largura.
// ---------------------------------------------------------------------------
export function dimensoesDeJpeg(bytes) {
  if (!bytes || bytes.length < 4) return null
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

  let i = 2
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) { i += 1; continue }        // ressincroniza no padding
    const marcador = bytes[i + 1]
    if (marcador === 0xff) { i += 1; continue }         // 0xFF de preenchimento
    // Marcadores sem payload.
    if (marcador === 0xd8 || marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      i += 2
      continue
    }
    if (marcador === 0xd9 || marcador === 0xda) return null  // fim, ou dados: sem SOF
    if (i + 3 >= bytes.length) return null
    const tamanho = u16(bytes, i + 2)
    if (tamanho < 2) return null
    const ehSof = marcador >= 0xc0 && marcador <= 0xcf
      && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc
    if (ehSof) {
      // [len:2][precisao:1][altura:2][largura:2]
      if (i + 9 >= bytes.length) return null
      const altura = u16(bytes, i + 5)
      const largura = u16(bytes, i + 7)
      if (!largura || !altura) return null
      return { largura, altura }
    }
    i += 2 + tamanho
  }
  return null
}

// ---------------------------------------------------------------------------
// GIF — largura e altura no Logical Screen Descriptor, little-endian.
// ---------------------------------------------------------------------------
export function dimensoesDeGif(bytes) {
  if (!bytes || bytes.length < 10) return null
  const cabeca = String.fromCharCode(bytes[0], bytes[1], bytes[2])
  if (cabeca !== 'GIF') return null
  const largura = u16le(bytes, 6)
  const altura = u16le(bytes, 8)
  if (!largura || !altura) return null
  return { largura, altura }
}

// ---------------------------------------------------------------------------
// WEBP — tres sub-formatos. Lemos os dois com campo direto:
//   VP8X (estendido): canvas em 3 bytes little-endian, guardado como valor-1.
//   VP8  (com perdas): 14 bits de cada dimensao depois do start code.
// VP8L (sem perdas) empacota as dimensoes em bits nao alinhados; devolve null,
// e a politica entao nao recusa. Preferimos nao medir a medir errado.
// ---------------------------------------------------------------------------
export function dimensoesDeWebp(bytes) {
  if (!bytes || bytes.length < 30) return null
  const marca = (i, s) => s.split('').every((c, k) => bytes[i + k] === c.charCodeAt(0))
  if (!marca(0, 'RIFF') || !marca(8, 'WEBP')) return null
  if (marca(12, 'VP8X')) {
    const largura = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1
    const altura = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1
    return { largura, altura }
  }
  if (marca(12, 'VP8 ')) {
    // [tag:3][start code 9D 01 2A:3][largura:2][altura:2] a partir de 20
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    const largura = u16le(bytes, 26) & 0x3fff
    const altura = u16le(bytes, 28) & 0x3fff
    if (!largura || !altura) return null
    return { largura, altura }
  }
  return null
}

// ---------------------------------------------------------------------------
// A PORTA UNICA. Escolhe o leitor pelo mime DECLARADO — e nao pela assinatura,
// porque quem confere assinatura e `assinaturaConfere`, que ja rodou antes.
// ---------------------------------------------------------------------------
export function dimensoesDoCabecalho(bytes, mime) {
  const m = normalizarMime(mime)
  if (m === 'image/png') return dimensoesDePng(bytes)
  if (m === 'image/jpeg') return dimensoesDeJpeg(bytes)
  if (m === 'image/gif') return dimensoesDeGif(bytes)
  if (m === 'image/webp') return dimensoesDeWebp(bytes)
  // HEIC/HEIF: as dimensoes vivem dentro de caixas ISO-BMFF aninhadas, e nem o
  // navegador que nao decodifica HEIC saberia usa-las. Fica sem medida — o
  // teto de bytes continua valendo, e HEIC nem chega ao bucket.
  return null
}

// Primeiros bytes de um Blob/File, com o mesmo contrato tolerante de
// `primeirosBytes` do captureAssetService: null quando nao da para fatiar.
export async function cabecalhoDe(arquivo, n = BYTES_DE_CABECALHO) {
  if (!arquivo || typeof arquivo.slice !== 'function') return null
  try {
    return new Uint8Array(await arquivo.slice(0, n).arrayBuffer())
  } catch {
    return null
  }
}
