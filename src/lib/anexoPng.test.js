import { describe, it, expect } from 'vitest'
import {
  limparPng, limparBlobPng, lerChunks,
  CHUNKS_DE_METADADO, ASSINATURA_PNG, MOTIVO_PNG,
} from './anexoPng'

// ---------------------------------------------------------------------------
// Construtor de PNG de verdade, com CRC correto em cada bloco. Testar um
// limpador de PNG com bytes inventados provaria que o limpador aceita lixo,
// nao que ele preserva imagem.
// ---------------------------------------------------------------------------
const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tipo, dados = []) {
  const corpo = Uint8Array.from([...[...tipo].map((ch) => ch.charCodeAt(0)), ...dados])
  const crc = crc32(corpo)
  const n = dados.length
  return [
    (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff,
    ...corpo,
    (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff,
  ]
}

// IHDR de um PNG 1x1, 8 bits, RGB.
const IHDR = chunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])
const IDAT = chunk('IDAT', [0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01])
const IEND = chunk('IEND')
const texto = (t) => [...t].map((c) => c.charCodeAt(0))

const montar = (...blocos) => Uint8Array.from([...ASSINATURA_PNG, ...blocos.flat()])

const tipos = (bytes) => {
  const r = lerChunks(bytes)
  return r.ok ? r.chunks.map((c) => c.tipo) : null
}

describe('anexoPng — leitura', () => {
  it('lê os blocos de um PNG íntegro, na ordem', () => {
    expect(tipos(montar(IHDR, IDAT, IEND))).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('recusa o que não é PNG', () => {
    const r = lerChunks(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]))
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe(MOTIVO_PNG.NAO_E_PNG)
    expect(lerChunks(null).ok).toBe(false)
    expect(lerChunks(Uint8Array.from([1, 2])).ok).toBe(false)
  })

  it('recusa PNG truncado em vez de ler fora dos limites', () => {
    const inteiro = montar(IHDR, IDAT, IEND)
    const cortado = inteiro.subarray(0, inteiro.length - 6)
    const r = lerChunks(cortado)
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe(MOTIVO_PNG.TRUNCADO)
  })

  it('recusa tamanho de bloco absurdo, que é como se lê memória alheia', () => {
    // Assinatura + um bloco que diz ter 4 GB.
    const mentiroso = Uint8Array.from([
      ...ASSINATURA_PNG, 0xff, 0xff, 0xff, 0xff, ...texto('IHDR'), 0, 0, 0, 0,
    ])
    expect(lerChunks(mentiroso).motivo).toBe(MOTIVO_PNG.TRUNCADO)
  })

  it('exige IHDR no começo e IEND no fim', () => {
    expect(lerChunks(montar(IDAT, IEND)).motivo).toBe(MOTIVO_PNG.SEM_IHDR)
    expect(lerChunks(montar(IHDR, IDAT)).motivo).toBe(MOTIVO_PNG.SEM_IEND)
  })
})

describe('anexoPng — limpeza', () => {
  it('remove eXIf, que é onde mora o GPS', () => {
    const comGps = montar(IHDR, chunk('eXIf', texto('II*\u0000...GPS...')), IDAT, IEND)
    expect(tipos(comGps)).toContain('eXIf')

    const r = limparPng(comGps)
    expect(r.ok).toBe(true)
    expect(r.mudou).toBe(true)
    expect(r.removidos).toEqual(['eXIf'])
    expect(tipos(r.bytes)).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('remove todos os blocos de texto e o carimbo de hora', () => {
    const sujo = montar(
      IHDR,
      chunk('tEXt', texto('Comment\u0000feito em casa')),
      chunk('iTXt', texto('Author\u0000\u0000\u0000\u0000\u0000Tarsis')),
      chunk('zTXt', texto('Software\u0000\u0000xx')),
      chunk('tIME', [0x07, 0xea, 1, 1, 0, 0, 0]),
      chunk('eXIf', texto('II*\u0000')),
      IDAT,
      IEND,
    )
    const r = limparPng(sujo)
    expect(r.removidos.sort()).toEqual([...CHUNKS_DE_METADADO].sort())
    expect(tipos(r.bytes)).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('PRESERVA cor e escala — iCCP, gAMA, sRGB e pHYs não são metadado', () => {
    // Jogar o perfil de cor fora mudaria como a foto aparece. O risco esta no
    // texto e no EXIF, nao aqui.
    const comCor = montar(
      IHDR,
      chunk('gAMA', [0, 1, 0x86, 0xa0]),
      chunk('sRGB', [0]),
      chunk('pHYs', [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]),
      chunk('tEXt', texto('a\u0000b')),
      IDAT,
      IEND,
    )
    const r = limparPng(comCor)
    expect(r.removidos).toEqual(['tEXt'])
    expect(tipos(r.bytes)).toEqual(['IHDR', 'gAMA', 'sRGB', 'pHYs', 'IDAT', 'IEND'])
  })

  it('os blocos mantidos saem BYTE A BYTE iguais — nenhum pixel é recalculado', () => {
    const limpo = montar(IHDR, IDAT, IEND)
    const sujo = montar(IHDR, chunk('tEXt', texto('x\u0000y')), IDAT, IEND)
    const r = limparPng(sujo)
    // O resultado da limpeza e identico ao PNG que nunca teve metadado.
    expect(Array.from(r.bytes)).toEqual(Array.from(limpo))
  })

  it('PNG sem metadado nenhum volta como veio, sem cópia', () => {
    const limpo = montar(IHDR, IDAT, IEND)
    const r = limparPng(limpo)
    expect(r.ok).toBe(true)
    expect(r.mudou).toBe(false)
    expect(r.removidos).toEqual([])
    expect(r.bytes).toBe(limpo)
  })

  it('PNG corrompido é RECUSADO com motivo e frase — nunca enviado assim mesmo', () => {
    const r = limparPng(Uint8Array.from([1, 2, 3]))
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe(MOTIVO_PNG.NAO_E_PNG)
    expect(r.mensagem).toMatch(/não é um PNG válido/i)
  })

  it('o resultado continua sendo um PNG legível pelo próprio leitor', () => {
    const sujo = montar(IHDR, chunk('eXIf', texto('II*\u0000')), IDAT, IEND)
    const r = limparPng(sujo)
    const relido = lerChunks(r.bytes)
    expect(relido.ok).toBe(true)
    expect(relido.chunks.at(-1).tipo).toBe('IEND')
    expect(Array.from(r.bytes.subarray(0, 8))).toEqual(ASSINATURA_PNG)
  })
})

describe('anexoPng — a ponta com Blob', () => {
  const blobDe = (bytes) => new Blob([bytes], { type: 'image/png' })

  it('devolve um Blob novo, menor, ainda image/png', async () => {
    const sujo = montar(IHDR, chunk('eXIf', texto('II*\u0000GPSGPSGPSGPS')), IDAT, IEND)
    const r = await limparBlobPng(blobDe(sujo))
    expect(r.ok).toBe(true)
    expect(r.mudou).toBe(true)
    expect(r.blob.type).toBe('image/png')
    expect(r.blob.size).toBeLessThan(sujo.length)
    expect(tipos(new Uint8Array(await r.blob.arrayBuffer()))).toEqual(['IHDR', 'IDAT', 'IEND'])
  })

  it('sem metadado, devolve o MESMO Blob — nada é reescrito à toa', async () => {
    const b = blobDe(montar(IHDR, IDAT, IEND))
    const r = await limparBlobPng(b)
    expect(r.mudou).toBe(false)
    expect(r.blob).toBe(b)
  })

  it('Blob que não é PNG vira recusa, não exceção', async () => {
    const r = await limparBlobPng(new Blob([Uint8Array.from([0xff, 0xd8])], { type: 'image/png' }))
    expect(r.ok).toBe(false)
    expect(r.mensagem.length).toBeGreaterThan(10)
  })
})
