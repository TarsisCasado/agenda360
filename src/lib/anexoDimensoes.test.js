import { describe, it, expect } from 'vitest'
import {
  dimensoesDeGif, dimensoesDeJpeg, dimensoesDePng, dimensoesDeWebp,
  dimensoesDoCabecalho,
} from './anexoDimensoes'

// ---------------------------------------------------------------------------
// Cabecalhos montados BYTE A BYTE, e nao fixtures binarias, por um motivo:
// um teste que le um arquivo pronto prova que aquele arquivo funciona; um que
// monta o cabecalho prova que o LEITOR entende o formato. E a diferenca
// aparece justamente nos casos que importam aqui — o JPEG cujo SOF vem depois
// de um EXIF gordo, e o 0xC4 que nao e SOF.
// ---------------------------------------------------------------------------

function png(largura, altura) {
  const b = new Uint8Array(24)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  b.set([0, 0, 0, 13], 8)                       // tamanho do IHDR
  b.set([0x49, 0x48, 0x44, 0x52], 12)           // 'IHDR'
  b.set([largura >>> 24 & 255, largura >>> 16 & 255, largura >>> 8 & 255, largura & 255], 16)
  b.set([altura >>> 24 & 255, altura >>> 16 & 255, altura >>> 8 & 255, altura & 255], 20)
  return b
}

// `segmentosAntes` entra antes do SOF, para simular EXIF/ICC no caminho.
function jpeg(largura, altura, { marcadorSof = 0xc0, segmentosAntes = [] } = {}) {
  const partes = [[0xff, 0xd8]]
  for (const { marcador, tamanhoCorpo } of segmentosAntes) {
    const tam = tamanhoCorpo + 2
    partes.push([0xff, marcador, tam >> 8 & 255, tam & 255, ...new Array(tamanhoCorpo).fill(0)])
  }
  partes.push([
    0xff, marcadorSof,
    0, 11,                                       // tamanho do segmento
    8,                                           // precisao
    altura >> 8 & 255, altura & 255,
    largura >> 8 & 255, largura & 255,
    1, 1, 0x11, 0,
  ])
  return new Uint8Array(partes.flat())
}

function gif(largura, altura) {
  const b = new Uint8Array(13)
  b.set([...'GIF89a'].map((c) => c.charCodeAt(0)), 0)
  b.set([largura & 255, largura >> 8 & 255], 6)
  b.set([altura & 255, altura >> 8 & 255], 8)
  return b
}

function webpVp8x(largura, altura) {
  const b = new Uint8Array(30)
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0)
  b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8)
  b.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12)
  const l = largura - 1; const a = altura - 1
  b.set([l & 255, l >> 8 & 255, l >> 16 & 255], 24)
  b.set([a & 255, a >> 8 & 255, a >> 16 & 255], 27)
  return b
}

describe('dimensoesDePng', () => {
  it('lê largura e altura do IHDR', () => {
    expect(dimensoesDePng(png(1920, 1080))).toEqual({ largura: 1920, altura: 1080 })
  })

  it('lê dimensões gigantes sem estourar o sinal do inteiro', () => {
    // 50000x50000 = 2,5 bilhões de pixels. É precisamente o caso que a política
    // tem de recusar, então ler errado aqui seria ler 0 e deixar passar.
    expect(dimensoesDePng(png(50000, 50000))).toEqual({ largura: 50000, altura: 50000 })
    // E um uint32 inteiro, lido sem sinal: 4 bilhões não vira negativo.
    expect(dimensoesDePng(png(0xffffffff, 1))).toEqual({ largura: 4294967295, altura: 1 })
  })

  it('não é PNG, está truncado ou não tem IHDR: devolve null', () => {
    expect(dimensoesDePng(null)).toBe(null)
    expect(dimensoesDePng(new Uint8Array(10))).toBe(null)
    expect(dimensoesDePng(png(1, 1).slice(0, 20))).toBe(null)
    const semIhdr = png(10, 10); semIhdr[12] = 0x58
    expect(dimensoesDePng(semIhdr)).toBe(null)
  })
})

describe('dimensoesDeJpeg', () => {
  it('lê o SOF0 — e devolve largura e altura na ordem certa', () => {
    // O JPEG guarda ALTURA antes de LARGURA. Trocar as duas passaria por quase
    // todo teste, menos este: 4032x3024 é retrato virado, não paisagem.
    expect(dimensoesDeJpeg(jpeg(4032, 3024))).toEqual({ largura: 4032, altura: 3024 })
  })

  it('acha o SOF mesmo depois de um EXIF gordo', () => {
    const comExif = jpeg(8064, 6048, {
      segmentosAntes: [
        { marcador: 0xe1, tamanhoCorpo: 20000 },  // APP1/EXIF com miniatura
        { marcador: 0xe2, tamanhoCorpo: 3000 },   // APP2/ICC
      ],
    })
    expect(dimensoesDeJpeg(comExif)).toEqual({ largura: 8064, altura: 6048 })
  })

  it('aceita os outros SOF reais (progressivo, sem perdas)', () => {
    for (const m of [0xc1, 0xc2, 0xc3, 0xc9, 0xca, 0xcd, 0xce, 0xcf]) {
      expect(dimensoesDeJpeg(jpeg(640, 480, { marcadorSof: m })))
        .toEqual({ largura: 640, altura: 480 })
    }
  })

  it('NÃO confunde 0xC4, 0xC8 e 0xCC com SOF', () => {
    // Estes três caem na faixa 0xC0..0xCF e não são SOF: C4 é tabela de
    // Huffman, C8 é extensão, CC é codificação aritmética. Lê-los como SOF
    // devolveria lixo — e lixo aqui vira "imagem de 60000 pixels, recusada".
    for (const m of [0xc4, 0xc8, 0xcc]) {
      const b = jpeg(800, 600, { segmentosAntes: [{ marcador: m, tamanhoCorpo: 40 }] })
      expect(dimensoesDeJpeg(b)).toEqual({ largura: 800, altura: 600 })
    }
  })

  it('pula os marcadores sem corpo em vez de tentar ler tamanho neles', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0xff, 0xd0, ...jpeg(100, 50).slice(2)])
    expect(dimensoesDeJpeg(b)).toEqual({ largura: 100, altura: 50 })
  })

  it('sem SOF, truncado, ou não-JPEG: devolve null em vez de inventar', () => {
    expect(dimensoesDeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBe(null)
    expect(dimensoesDeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(null)
    expect(dimensoesDeJpeg(png(10, 10))).toBe(null)
    expect(dimensoesDeJpeg(jpeg(10, 10).slice(0, 6))).toBe(null)
    expect(dimensoesDeJpeg(null)).toBe(null)
  })

  it('não entra em laço infinito com segmento de tamanho inválido', () => {
    const b = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0])
    expect(dimensoesDeJpeg(b)).toBe(null)
  })
})

describe('dimensoesDeGif e dimensoesDeWebp', () => {
  it('GIF: little-endian no Logical Screen Descriptor', () => {
    expect(dimensoesDeGif(gif(500, 300))).toEqual({ largura: 500, altura: 300 })
    expect(dimensoesDeGif(png(10, 10))).toBe(null)
  })

  it('WebP estendido: o canvas é guardado como valor menos um', () => {
    expect(dimensoesDeWebp(webpVp8x(1000, 800))).toEqual({ largura: 1000, altura: 800 })
  })

  it('WebP sem perdas (VP8L) devolve null — e isso é deliberado', () => {
    // As dimensões do VP8L estão em bits não alinhados. Preferimos não medir a
    // medir errado: sem medida, a política simplesmente não aplica essa camada.
    const b = webpVp8x(10, 10)
    b.set([...'VP8L'].map((c) => c.charCodeAt(0)), 12)
    expect(dimensoesDeWebp(b)).toBe(null)
  })
})

describe('dimensoesDoCabecalho', () => {
  it('escolhe o leitor pelo mime declarado', () => {
    expect(dimensoesDoCabecalho(png(3, 4), 'image/png')).toEqual({ largura: 3, altura: 4 })
    expect(dimensoesDoCabecalho(jpeg(3, 4), 'image/jpeg')).toEqual({ largura: 3, altura: 4 })
    expect(dimensoesDoCabecalho(gif(3, 4), 'image/gif')).toEqual({ largura: 3, altura: 4 })
    expect(dimensoesDoCabecalho(webpVp8x(3, 4), 'image/webp')).toEqual({ largura: 3, altura: 4 })
  })

  it('mime com charset e maiúscula ainda encontra o leitor', () => {
    expect(dimensoesDoCabecalho(png(3, 4), 'IMAGE/PNG')).toEqual({ largura: 3, altura: 4 })
  })

  it('HEIC, PDF e áudio não são medidos — e isso não é falha', () => {
    expect(dimensoesDoCabecalho(png(3, 4), 'image/heic')).toBe(null)
    expect(dimensoesDoCabecalho(png(3, 4), 'application/pdf')).toBe(null)
    expect(dimensoesDoCabecalho(null, 'image/png')).toBe(null)
  })
})
