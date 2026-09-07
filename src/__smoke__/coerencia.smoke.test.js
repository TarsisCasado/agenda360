/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DA COERENCIA VISUAL (CP5.7) — a prova de que e UM produto.
//
// O que este arquivo mede nao e beleza: e o que faz uma tela parecer de outra
// geracao quando se navega. Tudo aqui foi medido ANTES e estava errado:
//
//   - o titulo de cada tela comecava numa coluna diferente (264, 320, 448 e
//     505 px na mesma janela de 1440);
//   - os titulos tinham tamanhos diferentes (24px em Links/Configuracoes/
//     Relatorios, 26px no resto);
//   - havia <select> com a moldura do sistema operacional no meio de telas
//     desenhadas;
//   - e caixas de marcacao nativas ao lado de campos do DS.
//
// Sao quatro coisas objetivas. Se qualquer uma voltar, este teste cai.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

// As telas com cabecalho de pagina. Tarefas fica de fora do alinhamento por
// ser `workspace`: ela usa a largura toda de proposito (quatro colunas), e o
// titulo dela acompanha a borda da area util.
const ROTAS = [
  ['hoje', '/'],
  ['agenda', '/dia'],
  ['ideias', '/ideias'],
  ['copiloto', '/assistente'],
  ['inbox', '/caixa'],
  ['links', '/links'],
  ['relatorios', '/relatorios'],
  ['config', '/config'],
]

let servidor
let porta
let browser
let ctx
let page

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
      if (e.name === '__smoke__') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) varrer(full)
      else maisNovo = Math.max(maisNovo, fs.statSync(full).mtimeMs)
    }
  }
  varrer(path.join(ROOT, 'src'))
  return maisNovo > distTime
}

async function ir(url) {
  await page.goto(`http://127.0.0.1:${porta}${url}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1300)
}

// Geometria e tipografia do titulo da pagina.
async function tituloDe(url) {
  await ir(url)
  return page.evaluate(() => {
    const h1 = document.querySelector('main h1')
    if (!h1) return null
    const r = h1.getBoundingClientRect()
    const s = getComputedStyle(h1)
    return { x: Math.round(r.x), size: s.fontSize, weight: s.fontWeight }
  })
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  page = await ctx.newPage()
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', 'ag@agenda360.test')
    await page.fill('input[type="password"]', 'ag123456')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
}, 240_000)

afterAll(async () => {
  await browser?.close().catch(() => {})
  servidor?.close()
})

describe('o produto tem UM cabeçalho', () => {
  it('todas as telas começam o título na MESMA coluna', async () => {
    const medidas = {}
    for (const [nome, url] of ROTAS) medidas[nome] = await tituloDe(url)
    for (const [nome, m] of Object.entries(medidas)) expect(m, nome).not.toBeNull()
    const xs = Object.values(medidas).map((m) => m.x)
    // Tolerancia de 1px para arredondamento; nada de "quase alinhado".
    expect(Math.max(...xs) - Math.min(...xs), JSON.stringify(medidas)).toBeLessThanOrEqual(1)
  }, 120_000)

  it('todas usam o MESMO tamanho e peso de título', async () => {
    const medidas = {}
    for (const [nome, url] of ROTAS) medidas[nome] = await tituloDe(url)
    const tamanhos = new Set(Object.values(medidas).map((m) => `${m.size}/${m.weight}`))
    expect([...tamanhos], JSON.stringify(medidas)).toHaveLength(1)
  }, 120_000)
})

describe('os controles são os do produto, não os do sistema', () => {
  it('nenhum <select> aparece com a moldura nativa', async () => {
    for (const url of ['/links', '/config']) {
      await ir(url)
      const cru = await page.evaluate(() =>
        [...document.querySelectorAll('select')].filter(
          (s) => getComputedStyle(s).appearance !== 'none',
        ).length,
      )
      expect(cru, url).toBe(0)
    }
  }, 90_000)

  it('nenhuma caixa de marcação aparece com o desenho do navegador', async () => {
    await ir('/links')
    const nativas = await page.evaluate(() =>
      [...document.querySelectorAll('input[type="checkbox"]')].filter((c) => {
        const r = c.getBoundingClientRect()
        // A nossa fica invisivel (`sr-only`) e a marca e desenhada ao lado.
        return r.width > 2 && r.height > 2
      }).length,
    )
    expect(nativas).toBe(0)
  }, 90_000)

  it('o campo e o rótulo estão ligados de verdade (não é placeholder fazendo de rótulo)', async () => {
    await ir('/links')
    const semRotulo = await page.evaluate(() =>
      [...document.querySelectorAll('main input:not([type="checkbox"]), main textarea, main select')].filter(
        (el) => !el.labels?.length && !el.getAttribute('aria-label'),
      ).length,
    )
    expect(semRotulo).toBe(0)
  }, 90_000)
})

describe('a mesma tela cabe no telefone', () => {
  it('nenhuma rota cria rolagem lateral no iPhone', async () => {
    const mobile = await browser.newContext({ ...devices['iPhone 13'] })
    const p = await mobile.newPage()
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
    await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1400)
    if (await p.locator('input[type="email"]').count()) {
      await p.fill('input[type="email"]', 'ag@agenda360.test')
      await p.fill('input[type="password"]', 'ag123456')
      await p.getByRole('button', { name: /Entrar/i }).click()
      await p.waitForTimeout(1800)
    }
    for (let i = 0; i < 4; i += 1) {
      const pular = p.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
      if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await p.waitForTimeout(400) } else break
    }
    for (const [nome, url] of ROTAS) {
      await p.goto(`http://127.0.0.1:${porta}${url}`, { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(1200)
      const m = await p.evaluate(() => ({ w: document.documentElement.scrollWidth, vw: window.innerWidth }))
      expect(m.w, nome).toBeLessThanOrEqual(m.vw + 1)
    }
    await mobile.close()
  }, 180_000)
})
