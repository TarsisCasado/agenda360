/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// UX-M2.4 — A EXPERIENCIA DE ANEXAR, NUM NAVEGADOR DE VERDADE.
//
// Tudo aqui roda em MODO DEMO: o build nao tem variaveis de Supabase, entao
// `isSupabaseConfigured` e false e cada byte vai para o localStorage deste
// Chromium. Nenhuma linha toca Preview ou Production — e o primeiro teste
// abaixo PROVA isso antes de qualquer outro rodar, em vez de confiar no
// comentario.
//
// O QUE ELE NAO PODE PROVAR: isto e Chromium. O seletor nativo do iOS (com
// Fototeca, Tirar Foto e Arquivos), a conversao de HEIC pelo Safari e o
// comportamento do download no iPhone continuam sendo QA humano.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const FIX = path.join(ROOT, 'src/__smoke__/fixtures')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

const SEMENTE = `(() => {
  const KEY = 'agenda360.db.v2'
  const db = JSON.parse(localStorage.getItem(KEY))
  if (!db) return false
  const ws = db.workspaces[0].id, uid = db.profiles[0].id
  const agora = new Date().toISOString()
  db.inbox_items = [{
    id: 'qa-alvo', workspace_id: ws, created_by: uid, type: 'note', status: 'inbox',
    origin: 'manual', title: 'Proposta do consorcio',
    content: 'o cliente trouxe impressa, conferir os valores',
    seen: false, created_at: agora, updated_at: agora,
  }]
  db.links = []
  db.inbox_attachments = []
  db.capture_asset_blobs = []
  db.inbox_task_links = []
  localStorage.setItem(KEY, JSON.stringify(db))
  return true
})()`

let servidor, porta, browser, ctx, page

function servir() {
  return new Promise((resolve) => {
    servidor = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      let arquivo = path.join(DIST, url)
      if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) arquivo = path.join(DIST, 'index.html')
      res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' })
      fs.createReadStream(arquivo).pipe(res)
    })
    servidor.listen(0, '127.0.0.1', () => { porta = servidor.address().port; resolve() })
  })
}

function precisaBuildar() {
  const index = path.join(DIST, 'index.html')
  if (!fs.existsSync(index)) return true
  const distTime = fs.statSync(index).mtimeMs
  let maisNovo = 0
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === '__smoke__' || e.name === '__baseline__') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) varrer(full)
      else maisNovo = Math.max(maisNovo, fs.statSync(full).mtimeMs)
    }
  }
  varrer(path.join(ROOT, 'src'))
  return maisNovo > distTime
}

async function entrar() {
  await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', 'anexo@agenda360.test')
    await page.fill('input[type="password"]', 'anexo12345')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 5; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
}

// A folha do telefone. SEMPRE escopar por ela: o detalhe e renderizado duas
// vezes (painel de desktop e folha), e sem escopo um seletor acha a copia com
// `display:none` e o clique nunca acontece.
const NA_FOLHA = (sel) => `[data-testid="memoria-folha"] ${sel}`

async function abrirNota() {
  await page.goto(`http://127.0.0.1:${porta}/memoria`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1300)
  await page.locator('[data-testid="memoria-item"]:visible').first().click()
  await page.waitForSelector(NA_FOLHA('[data-testid="memoria-anexos"]'), { timeout: 10000 })
}

const anexar = async (arquivo) => {
  await page.setInputFiles(NA_FOLHA('[data-testid="memoria-anexo-entrada"]'), path.join(FIX, arquivo))
}

const quantosAnexos = () => page.locator(NA_FOLHA('[data-testid="memoria-anexo"]')).count()

const banco = () => page.evaluate(() => JSON.parse(localStorage.getItem('agenda360.db.v2')))

async function resemear() {
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true })
  page = await ctx.newPage()
  await entrar()
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
}, 180000)

afterAll(async () => {
  await browser?.close()
  await new Promise((r) => servidor?.close(r))
})

// ===========================================================================
// A GARANTIA QUE VEM ANTES DE TODAS: nada disto fala com o Supabase.
// ===========================================================================
describe('nenhuma escrita real', () => {
  it('o build roda em modo demo — os bytes ficam no localStorage, não na rede', async () => {
    await abrirNota()
    await anexar('recibo-com-gps.png')
    await page.waitForTimeout(900)

    const db = await banco()
    // O binario esta AQUI, no navegador. Se houvesse Supabase configurado,
    // `capture_asset_blobs` estaria vazio e o arquivo teria viajado.
    expect(db.capture_asset_blobs.length).toBeGreaterThan(0)
    expect(db.capture_asset_blobs[0].dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(db.inbox_attachments.length).toBeGreaterThan(0)
  }, 60000)

  it('nenhuma requisição sai para o Supabase durante um anexo inteiro', async () => {
    const forasteiras = []
    const espiao = (req) => {
      const u = req.url()
      if (!u.startsWith(`http://127.0.0.1:${porta}`) && !u.startsWith('data:') && !u.startsWith('blob:')) {
        forasteiras.push(u)
      }
    }
    page.on('request', espiao)
    await resemear()
    await abrirNota()
    await anexar('recibo-com-gps.png')
    await page.waitForTimeout(1200)
    page.off('request', espiao)

    // NADA para o Supabase — nem storage, nem banco, nem auth.
    expect(forasteiras.filter((u) => /supabase/i.test(u))).toEqual([])

    // E, para o teste nao virar uma rede frouxa que aprova qualquer coisa: o
    // UNICO destino externo que o app alcanca e a folha de fontes. Se um dia
    // aparecer outro, este teste cai e alguem precisa explicar o porque.
    const hosts = [...new Set(forasteiras.map((u) => new URL(u).host))]
    expect(hosts).toEqual(['fonts.googleapis.com'])
  }, 60000)
})

// ===========================================================================
// ESCOLHER E ANEXAR
// ===========================================================================
describe('UX-M2.4 — anexar', () => {
  it('o convite existe na nota, e some quando não cabe', async () => {
    await resemear()
    await abrirNota()
    expect(await page.locator(NA_FOLHA('[data-testid="memoria-anexar"]')).isVisible()).toBe(true)
    // O seletor e o NATIVO: um <input type=file>, que no iOS abre Fototeca,
    // Tirar Foto e Arquivos sem precisarmos de menu proprio.
    const entrada = page.locator(NA_FOLHA('[data-testid="memoria-anexo-entrada"]'))
    expect(await entrada.getAttribute('type')).toBe('file')
    const accept = await entrada.getAttribute('accept')
    expect(accept).toContain('image/jpeg')
    expect(accept).toContain('application/pdf')
  }, 60000)

  it('escolher um arquivo anexa, e a nota continua a mesma', async () => {
    await resemear()
    await abrirNota()
    expect(await quantosAnexos()).toBe(0)

    await anexar('recibo-com-gps.png')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="memoria-folha"] [data-testid="memoria-anexo"]').length === 1,
      null, { timeout: 15000 })

    const db = await banco()
    const nota = db.inbox_items.find((n) => n.id === 'qa-alvo')
    expect(nota.title).toBe('Proposta do consorcio')
    expect(nota.content).toBe('o cliente trouxe impressa, conferir os valores')
    expect(nota.status).toBe('inbox')
  }, 60000)

  it('o PNG é guardado SEM o GPS e SEM o texto que vinha nele', async () => {
    await resemear()
    await abrirNota()
    await anexar('recibo-com-gps.png')
    await page.waitForTimeout(1000)

    const db = await banco()
    const dataUrl = db.capture_asset_blobs[0].dataUrl
    const guardado = await page.evaluate((u) => atob(u.split(',')[1]), dataUrl)
    expect(guardado.includes('GPS-DO-TESTE-UXM24')).toBe(false)
    expect(guardado.includes('eXIf')).toBe(false)
    expect(guardado.includes('escrito por alguem')).toBe(false)
    // E continua PNG.
    expect(guardado.includes('IHDR')).toBe(true)
  }, 60000)

  it('a TRANSPARÊNCIA do PNG sobrevive ao caminho inteiro', async () => {
    await resemear()
    await abrirNota()
    await anexar('recibo-com-gps.png')
    await page.waitForTimeout(1000)

    const alfa = await page.evaluate(async () => {
      const db = JSON.parse(localStorage.getItem('agenda360.db.v2'))
      const img = new Image()
      img.src = db.capture_asset_blobs[0].dataUrl
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const x = c.getContext('2d')
      x.drawImage(img, 0, 0)
      return {
        esquerda: x.getImageData(2, 2, 1, 1).data[3],
        direita: x.getImageData(img.width - 2, 2, 1, 1).data[3],
      }
    })
    expect(alfa.esquerda).toBe(0)     // metade transparente continua transparente
    expect(alfa.direita).toBe(255)
  }, 60000)

  it('PDF entra e aparece como PDF, não como imagem quebrada', async () => {
    await resemear()
    await abrirNota()
    await anexar('contrato.pdf')
    await page.waitForTimeout(1000)
    const kind = await page.locator(NA_FOLHA('[data-testid="memoria-anexo"]')).first().getAttribute('data-anexo-kind')
    expect(kind).toBe('pdf')
  }, 60000)
})

// ===========================================================================
// O QUE E RECUSADO — com frase, nunca com silencio
// ===========================================================================
describe('UX-M2.4 — recusas', () => {
  it('SVG é recusado e a razão aparece na tela', async () => {
    await resemear()
    await abrirNota()
    await anexar('planilha.svg')
    const erro = page.locator(NA_FOLHA('[data-testid="memoria-anexo-erro"]'))
    await erro.waitFor({ state: 'visible', timeout: 10000 })
    expect(await erro.innerText()).toMatch(/não pode ser anexado/i)
    expect(await quantosAnexos()).toBe(0)
    const db = await banco()
    expect(db.capture_asset_blobs).toHaveLength(0)
  }, 60000)

  it('HEIC que este navegador não converte é recusado com saída sugerida', async () => {
    await resemear()
    await abrirNota()
    await anexar('foto.heic')
    const erro = page.locator(NA_FOLHA('[data-testid="memoria-anexo-erro"]'))
    await erro.waitFor({ state: 'visible', timeout: 10000 })
    const texto = await erro.innerText()
    expect(texto).toMatch(/HEIC/)
    expect(texto).toMatch(/Safari|JPEG/)
    expect(await quantosAnexos()).toBe(0)
  }, 60000)

  it('depois de uma recusa a nota continua intacta e dá para tentar de novo', async () => {
    await resemear()
    await abrirNota()
    await anexar('planilha.svg')
    await page.waitForSelector(NA_FOLHA('[data-testid="memoria-anexo-erro"]'), { timeout: 10000 })

    await anexar('recibo-com-gps.png')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="memoria-folha"] [data-testid="memoria-anexo"]').length === 1,
      null, { timeout: 15000 })

    const db = await banco()
    expect(db.inbox_items.find((n) => n.id === 'qa-alvo').content)
      .toBe('o cliente trouxe impressa, conferir os valores')
  }, 60000)

  it('cancelar o seletor nativo não faz nada — nem anexa, nem reclama', async () => {
    await resemear()
    await abrirNota()
    // Cancelar o seletor do sistema = nenhum arquivo escolhido.
    await page.setInputFiles(NA_FOLHA('[data-testid="memoria-anexo-entrada"]'), [])
    await page.waitForTimeout(600)
    expect(await quantosAnexos()).toBe(0)
    expect(await page.locator(NA_FOLHA('[data-testid="memoria-anexo-erro"]')).count()).toBe(0)
  }, 60000)
})

// ===========================================================================
// ABRIR, BAIXAR E REMOVER
// ===========================================================================
describe('UX-M2.4 — usar o que foi anexado', () => {
  async function comUmAnexo() {
    await resemear()
    await abrirNota()
    await anexar('recibo-com-gps.png')
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="memoria-folha"] [data-testid="memoria-anexo"]').length === 1,
      null, { timeout: 15000 })
  }

  it('a imagem é EXIBIDA, não só listada', async () => {
    await comUmAnexo()
    // Esperar o DECODE, e nao so a presenca do <img>: `naturalWidth` e 0 ate a
    // imagem carregar, e medir antes disso testaria o tempo, nao a tela.
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="memoria-folha"] [data-testid="memoria-anexo"] img')
      return img && img.complete && img.naturalWidth > 0
    }, null, { timeout: 15000 })

    const medida = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="memoria-folha"] [data-testid="memoria-anexo"] img')
      return img ? { natural: img.naturalWidth, visivel: img.getBoundingClientRect().width } : null
    })
    expect(medida).not.toBeNull()
    expect(medida.natural).toBeGreaterThan(0)   // decodificou de verdade
    expect(medida.visivel).toBeGreaterThan(100)
  }, 60000)

  it('baixar dispara um download de verdade', async () => {
    await comUmAnexo()
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      page.locator(NA_FOLHA('[data-testid="memoria-anexo-baixar"]')).first().click(),
    ])
    expect(download).toBeTruthy()
  }, 60000)

  it('remover PEDE confirmação — e cancelar não remove nada', async () => {
    await comUmAnexo()
    let perguntou = ''
    page.once('dialog', async (d) => { perguntou = d.message(); await d.dismiss() })
    await page.locator(NA_FOLHA('[data-testid="memoria-anexo-remover"]')).first().click()
    await page.waitForTimeout(800)

    expect(perguntou).toMatch(/remover este anexo/i)
    // A frase diz o que NAO acontece, que e o medo real de quem clica.
    expect(perguntou).toMatch(/nota continua/i)
    expect(await quantosAnexos()).toBe(1)
    const db = await banco()
    expect(db.inbox_attachments).toHaveLength(1)
  }, 60000)

  it('confirmar remove o anexo — e a NOTA continua, com o texto inteiro', async () => {
    await comUmAnexo()
    page.once('dialog', async (d) => { await d.accept() })
    await page.locator(NA_FOLHA('[data-testid="memoria-anexo-remover"]')).first().click()
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="memoria-folha"] [data-testid="memoria-anexo"]').length === 0,
      null, { timeout: 15000 })

    const db = await banco()
    expect(db.inbox_attachments).toHaveLength(0)
    expect(db.capture_asset_blobs).toHaveLength(0)   // o binario foi junto
    const nota = db.inbox_items.find((n) => n.id === 'qa-alvo')
    expect(nota).toBeTruthy()                        // a nota NAO foi apagada
    expect(nota.title).toBe('Proposta do consorcio')
    expect(nota.content).toBe('o cliente trouxe impressa, conferir os valores')
  }, 60000)
})

// ===========================================================================
// O QUE NAO PODE TER MUDADO
// ===========================================================================
describe('UX-M2.4 — nao-regressao', () => {
  it('a barra inferior continua única e com os quatro destinos', async () => {
    await resemear()
    await page.goto(`http://127.0.0.1:${porta}/memoria`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const barras = page.locator('nav.fixed.inset-x-0.bottom-0')
    expect(await barras.count()).toBe(1)
    const texto = await barras.first().innerText()
    for (const destino of ['Hoje', 'Agenda', 'Tarefas', 'Memória']) {
      expect(texto).toMatch(new RegExp(destino))
    }
  }, 60000)

  it('um LINK não oferece anexar: a tabela referencia inbox_item_id', async () => {
    await page.evaluate(() => {
      const KEY = 'agenda360.db.v2'
      const db = JSON.parse(localStorage.getItem(KEY))
      const ws = db.workspaces[0].id, uid = db.profiles[0].id
      db.links = [{
        id: 'qa-link', workspace_id: ws, created_by: uid, title: 'Tabela FIPE',
        url: 'https://veiculos.fipe.org.br', note: '', task_id: null,
        created_at: new Date().toISOString(),
      }]
      db.inbox_items = []
      localStorage.setItem(KEY, JSON.stringify(db))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    await page.locator('[data-testid="memoria-item"]:visible').first().click()
    await page.waitForTimeout(700)
    expect(await page.locator(NA_FOLHA('[data-testid="memoria-anexar"]')).count()).toBe(0)
  }, 60000)

  it('a Memória sem anexo nenhum continua abrindo e lendo normalmente', async () => {
    await resemear()
    await abrirNota()
    const detalhe = page.locator('[data-testid="memoria-detalhe"]:visible')
    expect(await detalhe.innerText()).toMatch(/conferir os valores/)
    expect(await quantosAnexos()).toBe(0)
  }, 60000)
})
