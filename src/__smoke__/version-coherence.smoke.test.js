/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// COERENCIA DE VERSAO (CP5.5.1) — uma sessao, um build.
//
// O QUE ACONTECEU
//   Depois do CP5.5 o produto continuou mostrando a tela "Hoje" ANTIGA: no Mac
//   sempre, e no iPhone a versao nova aparecia no reload e a antiga voltava ao
//   navegar. O smoke de rotas nao pegou porque ele so perguntava "a rota
//   renderiza sem cair no ErrorBoundary?" — e a tela ANTIGA tambem renderiza
//   sem cair. Um build velho servido inteiro passa nesse teste.
//
// A CAUSA (reproduzida antes de corrigir, nao deduzida)
//   `precacheAndRoute` tambem responde NAVEGACAO: "/" resolve para o
//   `index.html` do precache. Sem `skipWaiting` — removido de proposito no
//   CP5.1.1 — o SW novo fica em `waiting` enquanto houver uma aba aberta. Logo
//   o SW velho seguia entregando o index.html velho, e com ele o bundle
//   principal velho. Como "Hoje" e importado ESTATICAMENTE, e esse bundle que
//   decide a versao de Hoje. Medido na reproducao: `deliveryType` da navegacao
//   era "cache-storage", e ate uma ABA NOVA vinha antiga.
//
// O QUE ESTE TESTE TRAVA
//   Nao "a tela abre", e sim QUAL BUILD esta na tela — lido do carimbo
//   `document.documentElement.dataset.build`, nao da aparencia. E trava a regra
//   de coerencia: uma sessao pode ficar em A ate recarregar, ou passar para B,
//   mas NUNCA voltar de B para A ao navegar.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

let servidor
let porta
let raiz // trocavel: e o "deploy" que o servidor entrega agora
let browser
let ctx
let page
let tmp
let BUILD_A
let BUILD_B

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

function lerBuildId(dir) {
  const assets = path.join(dir, 'assets')
  for (const nome of fs.readdirSync(assets)) {
    if (!nome.startsWith('index-') || !nome.endsWith('.js')) continue
    const m = fs.readFileSync(path.join(assets, nome), 'utf8').match(/__AGENDA360_BUILD__="([^"]+)"/)
    if (m) return m[1]
  }
  return null
}

// "Deploy novo": copia o build trocando o nome de TODO asset (e as referencias)
// e o carimbo. E o que a Vercel entrega a cada push — hashes novos ate em
// arquivo que ninguem editou — e faz o navegador ver um sw.js diferente.
function publicarNovoDeploy(origem, destino, idAntigo, idNovo) {
  fs.cpSync(origem, destino, { recursive: true })
  const assets = path.join(destino, 'assets')
  const renomes = new Map()
  for (const nome of fs.readdirSync(assets)) {
    const novo = `v2-${nome}`
    fs.renameSync(path.join(assets, nome), path.join(assets, novo))
    renomes.set(nome, novo)
  }
  const reescrever = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { reescrever(full); continue }
      if (!/\.(js|mjs|css|html|webmanifest|json)$/.test(e.name)) continue
      let txt = fs.readFileSync(full, 'utf8')
      let mudou = false
      for (const [antigo, novo] of renomes) {
        if (txt.includes(antigo)) { txt = txt.split(antigo).join(novo); mudou = true }
      }
      if (txt.includes(idAntigo)) { txt = txt.split(idAntigo).join(idNovo); mudou = true }
      if (mudou) fs.writeFileSync(full, txt)
    }
  }
  reescrever(destino)
}

function servir() {
  return new Promise((resolve) => {
    servidor = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      let arquivo = path.join(raiz, url)
      if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        if (path.extname(url)) { res.writeHead(404); res.end('not found'); return }
        arquivo = path.join(raiz, 'index.html')
      }
      // Cabecalhos como os da Vercel: asset com hash e imutavel, HTML revalida.
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream',
        'Cache-Control': /\/assets\//.test(url)
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
      })
      fs.createReadStream(arquivo).pipe(res)
    })
    servidor.listen(0, '127.0.0.1', () => { porta = servidor.address().port; resolve() })
  })
}

// A pergunta que importa: QUAL build esta executando nesta aba?
const buildDaTela = (alvo = page) =>
  alvo.evaluate(() => document.documentElement.dataset.build || null)

// E, independente do carimbo, a tela e mesmo a do CP5.5?
const marcadores = (alvo = page) =>
  alvo.evaluate(() => {
    const t = document.querySelector('main')?.innerText || ''
    return {
      novo: Boolean(document.querySelector('[data-testid^="hoje-entrada-"]')) ||
        /Seu dia está livre/.test(t),
      antigo: /Dia em branco|Ideias recentes|Precisa de você|Também hoje/.test(t),
      boundary: /Não foi possível abrir esta tela/i.test(t),
    }
  })

async function entrar() {
  await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', 'ver@agenda360.test')
    await page.fill('input[type="password"]', 'ver12345')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
  // Espera o Service Worker assumir: e ele o personagem principal deste teste.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 20000 })
  await page.waitForTimeout(800)
}

async function irPor(nome) {
  const link = page.locator('a').filter({ hasText: new RegExp(`^${nome}$`, 'i') })
  if (await link.count()) await link.first().click({ timeout: 8000 })
  await page.waitForTimeout(1300)
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  BUILD_A = lerBuildId(DIST)
  BUILD_B = 'zz9deploy2'
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda360-versao-'))
  raiz = path.join(tmp, 'deploy-a')
  fs.cpSync(DIST, raiz, { recursive: true })
  publicarNovoDeploy(DIST, path.join(tmp, 'deploy-b'), BUILD_A, BUILD_B)

  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await ctx.newPage()
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await entrar()
}, 300_000)

afterAll(async () => {
  await browser?.close().catch(() => {})
  servidor?.close()
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true })
})

describe('coerência de versão — uma sessão, um build', () => {
  it('o build que está na tela é legível, e não deduzido da aparência', async () => {
    expect(BUILD_A, 'o build precisa carimbar a versão no documento').toBeTruthy()
    expect(await buildDaTela()).toBe(BUILD_A)
    const m = await marcadores()
    expect(m.novo, 'a sessão começa no CP5.5').toBe(true)
    expect(m.antigo, 'nenhum resquício da tela antiga').toBe(false)
  }, 60_000)

  it('depois de um deploy novo, o RELOAD entrega o build novo', async () => {
    // Este é o caso que falhava: com o documento vindo do precache, o reload
    // devolvia o build antigo indefinidamente — inclusive em aba nova.
    raiz = path.join(tmp, 'deploy-b')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    expect(await buildDaTela(), 'o reload tem de trazer o build publicado').toBe(BUILD_B)
    expect((await marcadores()).boundary).toBe(false)
  }, 60_000)

  it('A REGRA: navegar não pode voltar do build novo para o antigo', async () => {
    const antes = await buildDaTela()
    expect(antes).toBe(BUILD_B)
    for (let volta = 0; volta < 3; volta += 1) {
      await irPor('Tarefas')
      expect(await buildDaTela(), `volta ${volta}: em Tarefas`).toBe(BUILD_B)
      await irPor('Agenda')
      expect(await buildDaTela(), `volta ${volta}: em Agenda`).toBe(BUILD_B)
      await irPor('Hoje')
      expect(await buildDaTela(), `volta ${volta}: de volta em Hoje`).toBe(BUILD_B)
      const m = await marcadores()
      expect(m.antigo, `volta ${volta}: a tela antiga reapareceu`).toBe(false)
      expect(m.novo, `volta ${volta}: Hoje precisa ser o do CP5.5`).toBe(true)
      expect(m.boundary, `volta ${volta}: caiu no ErrorBoundary`).toBe(false)
    }
  }, 120_000)

  it('reload no meio da navegação continua coerente', async () => {
    await irPor('Tarefas')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1800)
    expect(await buildDaTela()).toBe(BUILD_B)
    await irPor('Hoje')
    expect(await buildDaTela()).toBe(BUILD_B)
    expect((await marcadores()).novo).toBe(true)
  }, 90_000)

  it('back/forward do navegador não ressuscita o build antigo', async () => {
    await irPor('Tarefas')
    await irPor('Hoje')
    await page.goBack(); await page.waitForTimeout(1200)
    expect(await buildDaTela(), 'voltando').toBe(BUILD_B)
    await page.goForward(); await page.waitForTimeout(1200)
    expect(await buildDaTela(), 'avançando').toBe(BUILD_B)
    expect((await marcadores()).boundary).toBe(false)
  }, 90_000)

  it('aba nova na mesma origem também abre no build publicado', async () => {
    const aba = await ctx.newPage()
    await aba.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
    await aba.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
    await aba.waitForTimeout(2000)
    expect(await buildDaTela(aba)).toBe(BUILD_B)
    expect((await marcadores(aba)).antigo).toBe(false)
    await aba.close()
  }, 60_000)

  it('entrar direto em cada rota entrega o build publicado e nada quebra', async () => {
    for (const rota of ['/', '/tarefas', '/dia', '/ideias', '/caixa', '/links', '/relatorios', '/config']) {
      await page.goto(`http://127.0.0.1:${porta}${rota}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1400)
      expect(await buildDaTela(), `entrada direta em ${rota}`).toBe(BUILD_B)
      expect((await marcadores()).boundary, `${rota} caiu no ErrorBoundary`).toBe(false)
    }
  }, 150_000)

  it('o Service Worker continua SEM assumir abas antigas (garantia do CP5.1.1)', async () => {
    const sw = await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      return regs.map((r) => ({ waiting: Boolean(r.waiting), active: Boolean(r.active) }))
    })
    // Um worker novo pode estar esperando; o que nao pode e ter assumido a
    // aba no meio da sessao — e por isso `skipWaiting` continua fora do sw.js.
    // A CHAMADA não pode existir. A PALAVRA pode: o sw.js explica em comentário
    // por que ela ficou de fora — e essa explicação é justamente o que impede
    // alguém de reintroduzi-la sem pensar.
    const codigo = fs
      .readFileSync(path.join(ROOT, 'src/sw.js'), 'utf8')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')
    expect(codigo, 'skipWaiting não pode voltar como solução fácil').not.toMatch(/skipWaiting\s*\(/)
    expect(sw.some((r) => r.active), 'algum worker precisa estar ativo').toBe(true)
  }, 60_000)
})
