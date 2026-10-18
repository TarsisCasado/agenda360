import { describe, it, expect, vi } from 'vitest'
import { prepararImagem, avisoDoPreparo, MOTIVO_PREPARO } from './anexoImagem'
import { LADO_MAXIMO, MAX_BYTES } from './anexoPolitica'

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
    expect(codificar).toHaveBeenCalledWith(expect.anything(), 2000, 1500, expect.any(Number))
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
