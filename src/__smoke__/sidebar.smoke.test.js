/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DA BARRA LATERAL RECOLHIVEL (CP5.10) — no build real.
//
// O risco de um "recolher" nao e o recolher: e tudo o que costuma vir junto —
// o estado que nao sobrevive ao reload, o destino ativo que se perde, o rotulo
// que vira reticencia, o espaco liberado que vira margem em vez de conteudo, e
// o mobile que herda um rail que ninguem pediu.
//
// Entao o que se prova aqui:
//   1. recolhe, expande, e o controle continua alcancavel nos dois estados;
//   2. a preferencia sobrevive a navegar E a recarregar;
//   3. os NOVE destinos continuam clicaveis recolhida, e o ativo se ve;
//   4. o rotulo aparece por mouse E por teclado — sem `title` do navegador;
//   5. o conteudo RECEBE o espaco (medido), e o Kanban em especial;
//   6. o mobile nao muda: sem rail, com barra inferior.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

let servidor
let porta
let browser

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

async function abrirApp(device, scheme = 'light') {
  const ctx = await browser.newContext({ ...device, colorScheme: scheme })
  const page = await ctx.newPage()
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
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
  return { ctx, page }
}

const barra = (p) => p.locator('[data-testid="sidebar"]')
const controle = (p) => p.locator('[data-testid="alternar-sidebar"]')
const largura = async (p) => Math.round((await barra(p).boundingBox()).width)
const larguraMain = async (p) => Math.round((await p.locator('main').boundingBox()).width)

async function recolher(p) {
  await controle(p).click()
  await p.waitForTimeout(500)
}

async function ir(p, url) {
  await p.goto(`http://127.0.0.1:${porta}${url}`, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(1500)
}

let page
let ctx

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  const app = await abrirApp({ viewport: { width: 1440, height: 900 } })
  page = app.page
  ctx = app.ctx
}, 240_000)

afterAll(async () => {
  await ctx?.close()
  await browser?.close()
  servidor?.close()
})

describe('recolher e expandir', () => {
  it('1. recolhe, e o conteudo RECEBE o espaco liberado', async () => {
    await ir(page, '/tarefas')
    const antes = { barra: await largura(page), main: await larguraMain(page) }
    expect(antes.barra).toBeGreaterThan(200)

    await recolher(page)
    const depois = { barra: await largura(page), main: await larguraMain(page) }

    expect(depois.barra).toBeLessThan(90)
    // O que a barra perde, o conteudo ganha — nao vira margem.
    const perdido = antes.barra - depois.barra
    const ganho = depois.main - antes.main
    expect(ganho, `barra perdeu ${perdido}px, main ganhou ${ganho}px`).toBe(perdido)
  }, 90_000)

  it('2. o controle continua alcancavel recolhida, e expande de volta', async () => {
    expect(await controle(page).count()).toBe(1)
    expect(await controle(page).getAttribute('aria-label')).toBe('Expandir menu')
    expect(await controle(page).getAttribute('aria-expanded')).toBe('false')
    await recolher(page)
    expect(await largura(page)).toBeGreaterThan(200)
    expect(await controle(page).getAttribute('aria-label')).toBe('Recolher menu')
    expect(await controle(page).getAttribute('aria-expanded')).toBe('true')
  }, 90_000)

  it('3. o alvo do controle e confortavel', async () => {
    const box = await controle(page).boundingBox()
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(40)
  }, 90_000)
})

describe('a preferencia sobrevive', () => {
  it('4. navegar entre destinos NAO reexpande', async () => {
    await recolher(page) // recolhe
    for (const rota of ['/dia', '/ideias', '/tarefas']) {
      await ir(page, rota)
      expect(await largura(page), `reexpandiu em ${rota}`).toBeLessThan(90)
    }
  }, 90_000)

  it('5. recarregar mantem recolhida — e sem flash de expandida', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' })
    // Medido CEDO: se o estado viesse de um efeito, aqui ainda estaria larga.
    await page.locator('[data-testid="sidebar"]').waitFor({ timeout: 8000 })
    const logo = await largura(page)
    expect(logo, 'flash de barra expandida no primeiro quadro').toBeLessThan(90)
    await page.waitForTimeout(1200)
    expect(await largura(page)).toBeLessThan(90)
  }, 90_000)

  it('6. expandir tambem persiste', async () => {
    await recolher(page) // expande
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    expect(await largura(page)).toBeGreaterThan(200)
    await recolher(page) // volta a recolher para os proximos
  }, 90_000)
})

describe('navegar com a barra recolhida', () => {
  it('7. os NOVE destinos continuam la, e nenhum rotulo ficou pela metade', async () => {
    const links = barra(page).locator('a')
    expect(await links.count()).toBe(9)
    // Recolhida, nao ha texto visivel dentro da barra alem dos baloes ocultos.
    const visivel = await barra(page).evaluate((el) => {
      const t = []
      for (const a of el.querySelectorAll('a')) {
        for (const n of a.childNodes) {
          if (n.nodeType === 3 && n.textContent.trim()) t.push(n.textContent.trim())
        }
      }
      return t
    })
    expect(visivel, 'sobrou rotulo cru dentro do rail').toEqual([])
  }, 90_000)

  it('8. o destino ativo continua percebivel', async () => {
    await ir(page, '/ideias')
    const ativos = await barra(page).locator('a.bg-surface-2').count()
    expect(ativos, 'exatamente um destino ativo').toBe(1)
    const rotulo = await barra(page).locator('a.bg-surface-2').getAttribute('aria-label')
    expect(rotulo).toBe('Ideias')
  }, 90_000)

  it('9. todo destino continua clicavel e leva ao lugar certo', async () => {
    for (const [rotulo, esperado] of [['Agenda', '/dia'], ['Tarefas', '/tarefas'], ['Copiloto', '/assistente'], ['Hoje', '/']]) {
      await barra(page).getByRole('link', { name: rotulo, exact: true }).click()
      await page.waitForTimeout(900)
      expect(new URL(page.url()).pathname, `${rotulo} nao levou a ${esperado}`).toBe(esperado)
      expect(await largura(page), `${rotulo} reexpandiu a barra`).toBeLessThan(90)
    }
  }, 120_000)

  it('10. o rotulo aparece por MOUSE e por TECLADO — nao e title do navegador', async () => {
    await ir(page, '/tarefas')
    const link = barra(page).getByRole('link', { name: 'Ideias', exact: true })
    // nao delegamos ao navegador: `title` nunca chega ao teclado
    expect(await link.getAttribute('title')).toBeNull()
    const balao = link.locator('.rail-tip')
    expect(await balao.innerText()).toBe('Ideias')

    const opacidade = () => balao.evaluate((el) => getComputedStyle(el).opacity)
    expect(await opacidade(), 'balão visível sem interação').toBe('0')
    await link.hover()
    await page.waitForTimeout(350)
    expect(await opacidade(), 'não apareceu no hover').toBe('1')
    // teclado: foco visivel revela igual
    await page.mouse.move(0, 0)
    await page.waitForTimeout(350)
    await link.focus()
    await page.waitForTimeout(350)
    expect(await opacidade(), 'não apareceu no foco por teclado').toBe('1')

    // Opacidade 1 NAO e o mesmo que visivel: com `overflow-y-auto` no <nav> o
    // balao existia, tinha opacidade 1 e era recortado pela caixa. Visto no QA
    // visual, invisivel para a assertiva anterior. Entao mede-se a posicao.
    await link.hover()
    await page.waitForTimeout(350)
    const cabe = await balao.evaluate((el) => {
      const b = el.getBoundingClientRect()
      const nav = el.closest('nav').getBoundingClientRect()
      return { largura: Math.round(b.width), passaDoNav: b.right > nav.right, naTela: b.right <= window.innerWidth }
    })
    expect(cabe.largura, 'balão sem largura — foi recortado').toBeGreaterThan(30)
    expect(cabe.passaDoNav, 'o balão precisa sair do nav para ser lido').toBe(true)
    expect(cabe.naTela, 'balão fora da viewport').toBe(true)
  }, 90_000)
})

describe('o que NAO pode ter mudado', () => {
  it('11. "Nova atividade" e o menu das tres opcoes continuam funcionando', async () => {
    await ir(page, '/tarefas')
    await page.getByRole('button', { name: /Nova atividade/i }).click()
    await page.locator('[role="menu"]').waitFor({ timeout: 8000 })
    const t = await page.locator('[role="menu"]').innerText()
    expect(t).toMatch(/Tarefa/)
    expect(t).toMatch(/Compromisso/)
    expect(t).toMatch(/Capturar com o Copiloto/)
    await page.locator('[role="menu"]').getByRole('menuitem', { name: /^Compromisso/ }).click()
    await page.locator('[role="dialog"]').waitFor({ timeout: 8000 })
    expect(await page.locator('[role="dialog"]').innerText()).toMatch(/Novo compromisso/)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('12. o Kanban recebe a largura liberada', async () => {
    // Estado conhecido primeiro: os testes anteriores deixam a barra recolhida,
    // e medir sem fixar isso mede o inverso do que se quer afirmar.
    await ir(page, '/tarefas?visao=semana')
    if ((await largura(page)) < 90) await recolher(page)
    expect(await largura(page)).toBeGreaterThan(200)

    // A largura da FAIXA de conteudo do Kanban, medida no proprio main: se ela
    // nao crescer, recolher a barra so criou margem.
    const faixa = () => page.locator('main > div, main > section').first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width))

    const expandido = await faixa()
    await recolher(page)
    const recolhido = await faixa()
    expect(recolhido, `expandida ${expandido}px -> recolhida ${recolhido}px`).toBeGreaterThan(expandido)
  }, 90_000)

  it('13. em 1280 o rail nao causa rolagem lateral', async () => {
    const { ctx: c, page: p } = await abrirApp({ viewport: { width: 1280, height: 800 } })
    await p.goto(`http://127.0.0.1:${porta}/tarefas?visao=semana`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1600)
    await recolher(p)
    const vazou = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(vazou, 'a página passou a rolar de lado').toBe(false)
    await c.close()
  }, 120_000)

  it('14. o mobile continua sem rail e com a barra inferior', async () => {
    const { ctx: c, page: p } = await abrirApp({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await p.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1600)
    // o controle de recolher e desktop: nao existe para o polegar
    expect(await p.locator('[data-testid="alternar-sidebar"]:visible').count()).toBe(0)
    // a barra inferior continua com as suas entradas
    expect(await p.locator('nav').last().getByRole('button').count()).toBeGreaterThan(0)
    await c.close()
  }, 120_000)
})
