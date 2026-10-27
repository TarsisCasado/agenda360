import { describe, it, expect, vi } from 'vitest'
import { prepararImagem, prepararAnexo, avisoDoPreparo, MOTIVO_PREPARO, MOTIVO_ANEXO } from './anexoImagem'
import {
  LADO_MAXIMO, MAX_BYTES, MAX_BYTES_ENTRADA_IMAGEM, MAX_PIXELS_ENTRADA, MOTIVO,
} from './anexoPolitica'

// ---------------------------------------------------------------------------
// `decodificar` e `codificar` sao injetados: e isto que permite exercitar o
// preparo inteiro sem navegador, inclusive os caminhos de FALHA, que sao
// justamente os que nunca aparecem num teste feliz.
// ---------------------------------------------------------------------------
const arquivo = (type, size) => ({ type, size })
const bitmap = (width, height) => ({ width, height })
const saida = (size) => ({ size, type: 'image/jpeg' })

const decodificaPara = (w, h) => vi.fn(async () => bitmap(w, h))
const codificaCom = (size) => vi.fn(async () => saida(size))

describe('prepararImagem — foto grande', () => {
  it('reduz ao lado máximo e devolve as dimensões finais', async () => {
    const codificar = codificaCom(400 * 1024)
    const r = await prepararImagem(arquivo('image/jpeg', 4 * 1024 * 1024), {
      decodificar: decodificaPara(4032, 3024), codificar,
    })
    expect(r.convertida).toBe(true)
    expect(r.motivo).toBe(MOTIVO_PREPARO.CONVERTIDA)
    expect(r.mime).toBe('image/jpeg')
    expect(r.largura).toBe(LADO_MAXIMO)
    expect(r.altura).toBe(1500)
    expect(r.bytesFinais).toBeLessThan(r.bytesOriginais)
    // O canvas foi desenhado NO TAMANHO ALVO, nao no original.
    //
    // TRANSIÇÃO DE CONTRATO — UX-M2.3. `codificar` ganhou um quinto argumento,
    // o mime de saída, porque reduzir um PNG grande gerando JPEG destruiria a
    // transparência sem avisar. A asserção anterior era:
    //
    //   expect(codificar).toHaveBeenCalledWith(expect.anything(), 2000, 1500, expect.any(Number))
    expect(codificar).toHaveBeenCalledWith(
      expect.anything(), 2000, 1500, expect.any(Number), 'image/jpeg',
    )
  })

  it('a redução é aceita mesmo que o resultado não encolha tanto', async () => {
    const r = await prepararImagem(arquivo('image/jpeg', 1000), {
      decodificar: decodificaPara(4000, 4000), codificar: codificaCom(1200),
    })
    expect(r.convertida).toBe(true)
    expect(r.motivo).toBe(MOTIVO_PREPARO.CONVERTIDA)
  })
})

describe('prepararImagem — EXIF', () => {
  it('reencoda foto pequena só para tirar o EXIF', async () => {
    const r = await prepararImagem(arquivo('image/jpeg', 300 * 1024), {
      decodificar: decodificaPara(800, 600), codificar: codificaCom(200 * 1024),
    })
    expect(r.convertida).toBe(true)
    expect(r.largura).toBe(800)
    expect(r.altura).toBe(600)
  })

  it('reencoda mesmo quando o resultado fica MAIOR — privacidade ganha de bytes', async () => {
    const r = await prepararImagem(arquivo('image/jpeg', 100), {
      decodificar: decodificaPara(800, 600), codificar: codificaCom(900),
    })
    expect(r.convertida).toBe(true)
    expect(r.motivo).toBe(MOTIVO_PREPARO.MAIOR_QUE_ORIGINAL)
    expect(r.bytesFinais).toBeGreaterThan(r.bytesOriginais)
  })

  it('PNG pequeno é preservado, e as dimensões ainda assim são conhecidas', async () => {
    const codificar = codificaCom(1)
    const r = await prepararImagem(arquivo('image/png', 50 * 1024), {
      decodificar: decodificaPara(800, 600), codificar,
    })
    expect(r.convertida).toBe(false)
    expect(r.motivo).toBe(MOTIVO_PREPARO.PRESERVADA)
    expect(r.largura).toBe(800)
    expect(r.altura).toBe(600)
    expect(codificar).not.toHaveBeenCalled()
  })

  it('GIF nunca passa pelo codificador', async () => {
    const codificar = codificaCom(1)
    const r = await prepararImagem(arquivo('image/gif', 2 * 1024 * 1024), {
      decodificar: decodificaPara(5000, 5000), codificar,
    })
    expect(r.convertida).toBe(false)
    expect(r.porque).toBe('gif_animacao')
    expect(codificar).not.toHaveBeenCalled()
  })
})

describe('prepararImagem — HEIC sem suporte', () => {
  it('guarda o ORIGINAL quando o navegador não decodifica', async () => {
    const entrada = arquivo('image/heic', 3 * 1024 * 1024)
    const r = await prepararImagem(entrada, {
      decodificar: vi.fn(async () => null), codificar: codificaCom(1),
    })
    // O que nao pode acontecer de jeito nenhum: perder a foto.
    expect(r.arquivo).toBe(entrada)
    expect(r.convertida).toBe(false)
    expect(r.motivo).toBe(MOTIVO_PREPARO.SEM_SUPORTE)
    expect(r.bytesFinais).toBe(r.bytesOriginais)
  })

  it('e diz isso em português, mencionando o formato do iPhone', async () => {
    const r = await prepararImagem(arquivo('image/heic', 100), {
      decodificar: vi.fn(async () => null),
    })
    const aviso = avisoDoPreparo(r)
    expect(aviso).toMatch(/HEIC/)
    expect(aviso).toMatch(/original/i)
  })

  it('converte normalmente quando o navegador DECODIFICA HEIC (Safari)', async () => {
    const r = await prepararImagem(arquivo('image/heic', 3 * 1024 * 1024), {
      decodificar: decodificaPara(4032, 3024), codificar: codificaCom(380 * 1024),
    })
    expect(r.convertida).toBe(true)
    expect(r.mime).toBe('image/jpeg')
    expect(avisoDoPreparo(r)).toBe('')
  })
})

describe('prepararImagem — falhas de conversão', () => {
  it('codificador que devolve null preserva o original', async () => {
    const entrada = arquivo('image/jpeg', 500)
    const r = await prepararImagem(entrada, {
      decodificar: decodificaPara(4000, 3000), codificar: vi.fn(async () => null),
    })
    expect(r.arquivo).toBe(entrada)
    expect(r.motivo).toBe(MOTIVO_PREPARO.FALHA_CODIFICACAO)
  })

  it('codificador que LANÇA também preserva o original — prepararImagem nunca lança', async () => {
    const entrada = arquivo('image/jpeg', 500)
    const r = await prepararImagem(entrada, {
      decodificar: decodificaPara(4000, 3000),
      codificar: vi.fn(async () => { throw new Error('canvas morreu') }),
    })
    expect(r.arquivo).toBe(entrada)
    expect(r.motivo).toBe(MOTIVO_PREPARO.FALHA_CODIFICACAO)
  })

  it('resultado acima do teto volta para o original', async () => {
    const entrada = arquivo('image/jpeg', 1024)
    const r = await prepararImagem(entrada, {
      decodificar: decodificaPara(4000, 3000), codificar: codificaCom(MAX_BYTES + 1),
    })
    expect(r.arquivo).toBe(entrada)
    expect(r.convertida).toBe(false)
  })

  it('sem APIs de navegador nenhuma, devolve o original em vez de explodir', async () => {
    const entrada = arquivo('image/jpeg', 1024)
    const r = await prepararImagem(entrada)
    expect(r.arquivo).toBe(entrada)
    expect(r.convertida).toBe(false)
    expect(r.motivo).toBe(MOTIVO_PREPARO.SEM_SUPORTE)
  })

  it('avisoDoPreparo cala quando não há nada de incomum a dizer', async () => {
    const r = await prepararImagem(arquivo('image/png', 1024), {
      decodificar: decodificaPara(100, 100),
    })
    expect(avisoDoPreparo(r)).toBe('')
    expect(avisoDoPreparo(null)).toBe('')
  })
})

// ---------------------------------------------------------------------------
// O PORTAO DE ENTRADA DO PREPARO (UX-M2.5a).
//
// A asserção que importa em todos estes testes é a mesma, e é sobre o que NÃO
// aconteceu: `decodificar` não foi chamado. É a diferença entre uma recusa que
// protege o aparelho e uma recusa que chega depois de a aba já ter travado.
// ---------------------------------------------------------------------------
describe('prepararAnexo — recusa antes de decodificar', () => {
  // Blob de verdade (node 22 tem), porque ler o cabeçalho exige `slice`.
  //
  // PNG ESTRUTURALMENTE VALIDO, e não só com o cabeçalho certo: o caminho do
  // PNG passa por `limparBlobPng`, que recusa arquivo cujos chunks não fecham.
  // Um fixture com assinatura boa e corpo de zeros seria recusado por
  // corrupção, e o teste provaria a coisa errada.
  function chunk(tipo, dados) {
    const n = dados.length
    const b = new Uint8Array(12 + n)
    b.set([n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255], 0)
    b.set([...tipo].map((c) => c.charCodeAt(0)), 4)
    b.set(dados, 8)
    // CRC fica em zero: `lerChunks` confere a moldura, não a soma — e é a
    // moldura que este fixture precisa ter certa.
    return b
  }

  function blobPng(largura, altura, bytesTotais = 1024) {
    const ihdr = new Uint8Array(13)
    ihdr.set([largura >>> 24 & 255, largura >>> 16 & 255, largura >>> 8 & 255, largura & 255], 0)
    ihdr.set([altura >>> 24 & 255, altura >>> 16 & 255, altura >>> 8 & 255, altura & 255], 4)
    ihdr.set([8, 6, 0, 0, 0], 8)                     // 8 bits, RGBA
    const partes = [
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
    ]
    const jaUsados = 8 + 25 + 12
    const recheio = Math.max(0, bytesTotais - jaUsados)
    if (recheio) partes.push(chunk('IDAT', new Uint8Array(recheio)))
    partes.push(chunk('IEND', new Uint8Array(0)))
    return new Blob(partes, { type: 'image/png' })
  }

  function blobJpeg(largura, altura, bytesTotais = 1024) {
    const cab = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0, 11, 8,
      altura >> 8 & 255, altura & 255,
      largura >> 8 & 255, largura & 255,
      1, 1, 0x11, 0,
    ])
    const resto = new Uint8Array(Math.max(0, bytesTotais - cab.length))
    return new Blob([cab, resto], { type: 'image/jpeg' })
  }

  it('imagem com pixels demais é recusada SEM ser decodificada', async () => {
    const decodificar = vi.fn()
    const lado = Math.ceil(Math.sqrt(MAX_PIXELS_ENTRADA)) + 100
    const r = await prepararAnexo(blobJpeg(lado, lado), { decodificar })

    expect(r.ok).toBe(false)
    expect(r.motivo).toBe(MOTIVO_ANEXO.ENTRADA_EXCESSIVA)
    expect(r.motivoPolitica).toBe(MOTIVO.PIXELS_DEMAIS)
    expect(r.mensagem).toMatch(/megapixels/i)
    // O ponto inteiro deste checkpoint:
    expect(decodificar).not.toHaveBeenCalled()
  })

  it('PNG com pixels demais também não chega a ser aberto — nem para limpar chunk', async () => {
    // O caminho do PNG limpa metadado antes de reduzir, e limpar não
    // decodifica. Mas o passo seguinte decodifica, então o portão vale aqui
    // também — e vale ANTES da limpeza, que leria o arquivo inteiro.
    const decodificar = vi.fn()
    const r = await prepararAnexo(blobPng(40000, 40000), { decodificar })
    expect(r.ok).toBe(false)
    expect(r.motivoPolitica).toBe(MOTIVO.PIXELS_DEMAIS)
    expect(decodificar).not.toHaveBeenCalled()
  })

  it('arquivo de imagem absurdo é recusado pelo tamanho, sem cabeçalho legível', async () => {
    const decodificar = vi.fn()
    const gigante = {
      type: 'image/jpeg',
      size: MAX_BYTES_ENTRADA_IMAGEM + 1,
      arrayBuffer: vi.fn(),
    }
    const r = await prepararAnexo(gigante, { decodificar })
    expect(r.ok).toBe(false)
    expect(r.motivoPolitica).toBe(MOTIVO.ENTRADA_GRANDE_DEMAIS)
    expect(decodificar).not.toHaveBeenCalled()
    expect(gigante.arrayBuffer).not.toHaveBeenCalled()  // nem foi aberto
  })

  it('a foto de 48 MP do iPhone PASSA pelo portão e é preparada normalmente', async () => {
    // Se este teste algum dia ficar vermelho, o limite ficou apertado demais e
    // o produto deixou de aceitar a foto que ele existe para guardar.
    const codificar = vi.fn(async () => ({ size: 600 * 1024, type: 'image/jpeg' }))
    const r = await prepararAnexo(blobJpeg(8064, 6048, 22 * 1024 * 1024), {
      decodificar: vi.fn(async () => ({ width: 8064, height: 6048 })),
      codificar,
    })
    expect(r.ok).toBe(true)
    expect(r.convertida).toBe(true)
    expect(r.largura).toBe(LADO_MAXIMO)
    expect(codificar).toHaveBeenCalled()
  })

  it('JPEG normal continua sendo re-codificado — o EXIF ainda morre', async () => {
    const codificar = vi.fn(async () => ({ size: 50 * 1024, type: 'image/jpeg' }))
    const r = await prepararAnexo(blobJpeg(1200, 900, 300 * 1024), {
      decodificar: vi.fn(async () => ({ width: 1200, height: 900 })),
      codificar,
    })
    expect(r.ok).toBe(true)
    expect(r.mime).toBe('image/jpeg')
    expect(r.convertida).toBe(true)      // re-codificou, e é assim que o EXIF sai
    expect(codificar).toHaveBeenCalled()
  })

  it('PNG válido e pequeno é preservado — transparência intacta', async () => {
    const codificar = vi.fn()
    const r = await prepararAnexo(blobPng(800, 600, 40 * 1024), {
      decodificar: vi.fn(async () => ({ width: 800, height: 600 })),
      codificar,
    })
    expect(r.ok).toBe(true)
    expect(r.mime).toBe('image/png')     // nunca virou JPEG
    expect(r.convertida).toBe(false)     // não houve re-codificação
    expect(codificar).not.toHaveBeenCalled()
  })

  it('não-imagem nem passa pelo portão: PDF gigante segue para quem manda nele', async () => {
    const decodificar = vi.fn()
    const pdf = { type: 'application/pdf', size: MAX_BYTES_ENTRADA_IMAGEM + 1 }
    const r = await prepararAnexo(pdf, { decodificar })
    expect(r.ok).toBe(true)
    expect(r.motivo).toBe(MOTIVO_ANEXO.NAO_E_IMAGEM)
    expect(r.arquivo).toBe(pdf)          // intocado, byte por byte
    expect(decodificar).not.toHaveBeenCalled()
  })

  it('imagem que não dá para medir não é recusada por isso', async () => {
    // Sem `slice` não há cabeçalho; sem cabeçalho não há dimensão. O preparo
    // segue normalmente, porque "não sei medir" não é "você não pode anexar".
    const codificar = vi.fn(async () => ({ size: 10 * 1024, type: 'image/jpeg' }))
    const r = await prepararAnexo({ type: 'image/jpeg', size: 100 * 1024 }, {
      decodificar: vi.fn(async () => ({ width: 100, height: 100 })),
      codificar,
    })
    expect(r.ok).toBe(true)
  })
})
