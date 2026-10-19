/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { build } from 'vite'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// UX-M2.1 — O PREPARO DA IMAGEM, NUM NAVEGADOR DE VERDADE.
//
// `anexoImagem.test.js` exercita a LOGICA com decodificador e codificador
// injetados — o que prova as decisoes e nenhum pixel. O que nao da para provar
// assim e justamente o requisito que mais importa:
//
//   UMA FOTO COM GPS ENTRA. O QUE SAI NAO TEM GPS.
//
// Isso depende do canvas de verdade, entao e aqui. O teste monta um JPEG com
// um segmento EXIF legitimo (APP1), contendo Orientation e um IFD de GPS,
// passa pelo preparo e confere os BYTES de saida.
//
// O QUE ELE NAO PODE PROVAR, e por isso esta escrito e nao implicito: isto e
// CHROMIUM. O decodificador de HEIC do Safari no iPhone nao e reproduzido por
// ele, e o caminho "HEIC convertido com sucesso" continua sendo QA humano.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
let saida, servidor, porta, browser, ctx, page

// --- Um segmento EXIF de verdade -------------------------------------------
//
// TIFF little-endian com dois IFDs:
//   IFD0  Orientation = 6 (girar 90 graus)  +  ponteiro para o IFD de GPS
//   GPS   GPSLatitudeRef = "N"
// Pequeno de proposito: o que interessa nao e a riqueza do metadado, e que ele
// exista na entrada e desapareca na saida.
function segmentoExif() {
  const tiff = new Uint8Array(56)
  const dv = new DataView(tiff.buffer)
  const LE = true
  tiff[0] = 0x49; tiff[1] = 0x49            // "II" — little endian
  dv.setUint16(2, 0x002a, LE)               // marca do TIFF
  dv.setUint32(4, 8, LE)                    // offset do IFD0

  dv.setUint16(8, 2, LE)                    // IFD0: duas entradas
  // Orientation (0x0112), SHORT, 1, valor 6
  dv.setUint16(10, 0x0112, LE); dv.setUint16(12, 3, LE)
  dv.setUint32(14, 1, LE); dv.setUint16(18, 6, LE)
  // GPSInfoIFDPointer (0x8825), LONG, 1, offset 38
  dv.setUint16(22, 0x8825, LE); dv.setUint16(24, 4, LE)
  dv.setUint32(26, 1, LE); dv.setUint32(30, 38, LE)
  dv.setUint32(34, 0, LE)                   // nao ha IFD1

  dv.setUint16(38, 1, LE)                   // GPS IFD: uma entrada
  // GPSLatitudeRef (0x0001), ASCII, 2, "N\0"
  dv.setUint16(40, 0x0001, LE); dv.setUint16(42, 2, LE)
  dv.setUint32(44, 2, LE); tiff[48] = 0x4e; tiff[49] = 0x00
  dv.setUint32(52, 0, LE)                   // fim

  const cabecalho = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
  const tamanho = 2 + cabecalho.length + tiff.length
  return Uint8Array.from([
    0xff, 0xe1, (tamanho >> 8) & 0xff, tamanho & 0xff, ...cabecalho, ...tiff,
  ])
}

const temTexto = (bytes, texto) => {
  const alvo = [...texto].map((c) => c.charCodeAt(0))
  for (let i = 0; i <= bytes.length - alvo.length; i += 1) {
    if (alvo.every((b, j) => bytes[i + j] === b)) return true
  }
  return false
}

const temMarcadorApp1 = (bytes) => {
  for (let i = 0; i < bytes.length - 1; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1) return true
  }
  return false
}

beforeAll(async () => {
  // O modulo ainda nao e importado por nenhuma tela (o botao de anexar so
  // chega no UX-M2.4), entao ele nao esta no bundle do app. Aqui ele e
  // empacotado sozinho, para rodar no navegador exatamente como sera usado.
  saida = fs.mkdtempSync(path.join(os.tmpdir(), 'anexo-preparo-'))
  await build({
    root: ROOT,
    // Sem o vite.config do produto: `anexoImagem.js` e JS puro, sem JSX e sem
    // dependencia. Carregar os plugins do app so geraria um service worker
    // dentro de um diretorio temporario.
    configFile: false,
    logLevel: 'error',
    build: {
      outDir: saida,
      emptyOutDir: true,
      lib: { entry: path.join(ROOT, 'src/lib/anexoImagem.js'), formats: ['es'], fileName: 'anexoImagem' },
    },
  })

  servidor = http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0]
    if (url.startsWith('/anexoImagem')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      fs.createReadStream(path.join(saida, 'anexoImagem.js')).pipe(res)
      return
    }
    // Um modulo de entrada que pendura a funcao no `window`. O `import()`
    // dinamico nao pode morar dentro de `page.evaluate`: o Vitest transforma
    // o corpo da funcao antes de serializa-lo, e o import vira uma chamada
    // interna dele que nao existe no navegador.
    if (url.startsWith('/entrada')) {
      res.writeHead(200, { 'Content-Type': 'text/javascript' })
      res.end("import * as m from './anexoImagem.js';"
        + 'window.__prepararImagem = m.prepararImagem;'
        + 'window.__prepararAnexo = m.prepararAnexo;')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<!doctype html><meta charset="utf-8"><title>preparo</title>')
  })
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
  porta = servidor.address().port

  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext()
  page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
  await page.addScriptTag({ url: '/entrada.js', type: 'module' })
  await page.waitForFunction(
    () => typeof window.__prepararImagem === 'function' && typeof window.__prepararAnexo === 'function',
    null, { timeout: 15000 })
}, 180000)

afterAll(async () => {
  await browser?.close()
  await new Promise((r) => servidor?.close(r))
  if (saida) fs.rmSync(saida, { recursive: true, force: true })
})

// Monta no navegador um JPEG REAL (canvas) com o EXIF injetado, prepara e
// devolve os bytes de entrada e de saida.
async function preparar(largura, altura, { ladoMaximo } = {}) {
  return page.evaluate(async ({ exif, largura: w, altura: h, ladoMaximo: lm }) => {
    const prepararImagem = window.__prepararImagem

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx2d = canvas.getContext('2d')
    // Conteudo nao-chapado: JPEG de area lisa comprime a quase nada e as
    // comparacoes de tamanho ficariam sem sentido.
    for (let x = 0; x < w; x += 8) {
      ctx2d.fillStyle = `hsl(${(x * 7) % 360} 80% 55%)`
      ctx2d.fillRect(x, 0, 8, h)
    }
    const base = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
    const cru = new Uint8Array(await base.arrayBuffer())

    // Insere o APP1 logo apos o SOI (os dois primeiros bytes, FF D8).
    const comExif = new Uint8Array(cru.length + exif.length)
    comExif.set(cru.subarray(0, 2), 0)
    comExif.set(Uint8Array.from(exif), 2)
    comExif.set(cru.subarray(2), 2 + exif.length)

    const entrada = new Blob([comExif], { type: 'image/jpeg' })
    const r = await prepararImagem(entrada, lm ? { ladoMaximo: lm } : {})
    const saidaBytes = new Uint8Array(await r.arquivo.arrayBuffer())

    return {
      entradaBytes: [...comExif.subarray(0, 64)],
      entradaTamanho: comExif.length,
      saidaBytes: [...saidaBytes],
      convertida: r.convertida,
      motivo: r.motivo,
      mime: r.mime,
      largura: r.largura,
      altura: r.altura,
      bytesOriginais: r.bytesOriginais,
      bytesFinais: r.bytesFinais,
    }
  }, { exif: [...segmentoExif()], largura, altura, ladoMaximo })
}


// ===========================================================================
// UX-M2.3 — O PNG LIMPO AINDA E UM PNG.
//
// `anexoPng.test.js` prova que os blocos certos saem, comparando bytes. O que
// bytes nao provam e se o resultado ainda ABRE: um limpador que produz um
// arquivo estruturalmente plausivel e indecodificavel passaria naquele teste e
// quebraria na mao da pessoa.
//
// Aqui o PNG e gerado pelo proprio navegador, recebe um bloco eXIf de verdade
// (com CRC correto), passa pelo preparo e e DECODIFICADO de volta. Se a
// cirurgia tivesse estragado alguma coisa, `createImageBitmap` recusaria.
// ===========================================================================
describe('UX-M2.3 — PNG perde o metadado e continua abrindo', () => {
  async function prepararPng({ comAlfa = false, largura = 120, altura = 80 } = {}) {
    return page.evaluate(async ({ comAlfa: alfa, largura: w, altura: h }) => {
      // CRC32 do PNG, para o bloco injetado ser legitimo.
      const tabela = (() => {
        const t = new Uint32Array(256)
        for (let n = 0; n < 256; n += 1) {
          let c = n
          for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
          t[n] = c >>> 0
        }
        return t
      })()
      const crc32 = (b) => {
        let c = 0xffffffff
        for (let i = 0; i < b.length; i += 1) c = tabela[(c ^ b[i]) & 0xff] ^ (c >>> 8)
        return (c ^ 0xffffffff) >>> 0
      }

      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      for (let x = 0; x < w; x += 6) {
        ctx.fillStyle = `hsl(${(x * 9) % 360} 85% 50%)`
        ctx.fillRect(x, 0, 6, h)
      }
      if (alfa) {
        // Um quadrante totalmente transparente: se a limpeza virar JPEG, isto
        // volta preto ou branco, e o teste denuncia.
        ctx.clearRect(0, 0, Math.floor(w / 2), Math.floor(h / 2))
      }
      const base = await new Promise((r) => canvas.toBlob(r, 'image/png'))
      const cru = new Uint8Array(await base.arrayBuffer())

      // Monta um bloco eXIf com conteudo reconhecivel e CRC valido.
      const dados = [...'II*\u0000GPS-SECRETO'].map((c) => c.charCodeAt(0))
      const corpo = Uint8Array.from([...[...'eXIf'].map((c) => c.charCodeAt(0)), ...dados])
      const crc = crc32(corpo)
      const n = dados.length
      const chunk = Uint8Array.from([
        (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff,
        ...corpo,
        (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff,
      ])

      // O IHDR tem 25 bytes (4+4+13+4); o eXIf entra logo depois dele.
      const corte = 8 + 25
      const comExif = new Uint8Array(cru.length + chunk.length)
      comExif.set(cru.subarray(0, corte), 0)
      comExif.set(chunk, corte)
      comExif.set(cru.subarray(corte), corte + chunk.length)

      const entrada = new Blob([comExif], { type: 'image/png' })
      const r = await window.__prepararAnexo(entrada)
      if (!r.ok) return { ok: false, motivo: r.motivo, mensagem: r.mensagem }

      const saidaBytes = new Uint8Array(await r.arquivo.arrayBuffer())

      // DECODIFICA de volta: a prova de que a cirurgia nao estragou a imagem.
      let decodificou = null
      try {
        const bmp = await createImageBitmap(r.arquivo)
        // Le o pixel do canto para conferir a transparencia.
        const c2 = document.createElement('canvas')
        c2.width = bmp.width; c2.height = bmp.height
        const x2 = c2.getContext('2d')
        x2.drawImage(bmp, 0, 0)
        const p = x2.getImageData(1, 1, 1, 1).data
        decodificou = { largura: bmp.width, altura: bmp.height, alfaDoCanto: p[3] }
      } catch (e) {
        decodificou = { erro: String(e) }
      }

      return {
        ok: true,
        mime: r.mime,
        removidos: r.removidos,
        entradaTemExif: [...comExif].join(',').includes([...'eXIf'].map((c) => c.charCodeAt(0)).join(',')),
        saida: [...saidaBytes],
        decodificou,
      }
    }, { comAlfa, largura, altura })
  }

  it('o eXIf injetado entra e NAO sai do outro lado', async () => {
    const r = await prepararPng()
    expect(r.ok).toBe(true)
    expect(r.entradaTemExif).toBe(true)
    expect(r.removidos).toEqual(['eXIf'])
    const saida = Uint8Array.from(r.saida)
    expect(temTexto(saida, 'eXIf')).toBe(false)
    expect(temTexto(saida, 'GPS-SECRETO')).toBe(false)
  }, 60000)

  it('o resultado continua PNG e continua decodificando', async () => {
    const r = await prepararPng({ largura: 120, altura: 80 })
    expect(r.mime).toBe('image/png')
    expect(temTexto(Uint8Array.from(r.saida), 'IHDR')).toBe(true)
    expect(r.decodificou.erro).toBeUndefined()
    expect(r.decodificou.largura).toBe(120)
    expect(r.decodificou.altura).toBe(80)
  }, 60000)

  it('a TRANSPARÊNCIA sobrevive — a razão de não reencodar PNG como JPEG', async () => {
    const r = await prepararPng({ comAlfa: true })
    expect(r.mime).toBe('image/png')
    // Canto superior esquerdo foi apagado: alfa tem de continuar zero.
    expect(r.decodificou.alfaDoCanto).toBe(0)
  }, 60000)

  it('PNG corrompido é recusado com frase, não enviado assim mesmo', async () => {
    const r = await page.evaluate(async () => {
      const ruim = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xff, 0xff, 0xff])],
        { type: 'image/png' })
      const out = await window.__prepararAnexo(ruim)
      return { ok: out.ok, motivo: out.motivo, mensagem: out.mensagem }
    })
    expect(r.ok).toBe(false)
    expect(r.motivo).toBe('png_invalido')
    expect(r.mensagem).toMatch(/corrompido|incompleto/i)
  }, 60000)
})

describe('UX-M2.1 — EXIF não sobrevive ao preparo', () => {
  it('a imagem de ENTRADA realmente carrega EXIF (senão o teste não prova nada)', async () => {
    const r = await preparar(400, 200)
    expect(temTexto(r.entradaBytes, 'Exif')).toBe(true)
    expect(temMarcadorApp1(Uint8Array.from(r.entradaBytes))).toBe(true)
  }, 60000)

  it('a imagem de SAÍDA não tem EXIF, nem o segmento APP1, nem o GPS', async () => {
    const r = await preparar(400, 200)
    const saidaBytes = Uint8Array.from(r.saidaBytes)
    expect(r.convertida).toBe(true)
    expect(temTexto(saidaBytes, 'Exif')).toBe(false)
    expect(temMarcadorApp1(saidaBytes)).toBe(false)
    // E continua sendo um JPEG valido: SOI no comeco, EOI no fim.
    expect([saidaBytes[0], saidaBytes[1]]).toEqual([0xff, 0xd8])
    expect([saidaBytes[saidaBytes.length - 2], saidaBytes[saidaBytes.length - 1]])
      .toEqual([0xff, 0xd9])
  }, 60000)

  it('uma foto grande encolhe de verdade — não é só promessa de código', async () => {
    const r = await preparar(3000, 2000)
    expect(r.convertida).toBe(true)
    expect(Math.max(r.largura, r.altura)).toBeLessThanOrEqual(2000)
    expect(r.bytesFinais).toBeLessThan(r.bytesOriginais)
    expect(temTexto(Uint8Array.from(r.saidaBytes), 'Exif')).toBe(false)
  }, 60000)

  // Este teste nasceu errado e o navegador corrigiu a pergunta. Eu esperava
  // 600x300 e vieram 300x600 — porque o Chromium OBEDECEU ao Orientation=6 que
  // o proprio teste injeta, e girou a foto 90 graus ao decodificar.
  //
  // E exatamente o comportamento que se quer, e a razao de ele importar tanto:
  // a mesma EXIF que carrega o GPS carrega o "esta foto esta de lado". Como
  // ela e DESCARTADA na saida, a rotacao precisa estar aplicada nos PIXELS —
  // senao a foto, que ate entao aparecia em pe, ficaria deitada para sempre.
  it('a orientação do EXIF é aplicada aos pixels antes de o EXIF ser descartado', async () => {
    const r = await preparar(1200, 600, { ladoMaximo: 600 })
    // Entrou deitada (1200x600) com "gire 90"; sai em pe.
    expect(r.altura).toBeGreaterThan(r.largura)
    expect(r.largura).toBe(300)
    expect(r.altura).toBe(600)
    // E a proporcao 2:1 continua sendo 2:1, agora no outro eixo.
    expect(r.altura / r.largura).toBeCloseTo(2, 5)
    // ...e o metadado que mandou girar nao viajou junto.
    expect(temTexto(Uint8Array.from(r.saidaBytes), 'Exif')).toBe(false)
  }, 60000)
})
