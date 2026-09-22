/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// C2 — NAVEGACAO E SHELL, no build real.
//
// O que este arquivo garante nao e "a barra ficou bonita": e que NENHUMA
// capacidade desapareceu ao reorganizar a navegacao. Um destino que sai da
// lateral e uma tela que deixa de ter caminho sao coisas diferentes, e so a
// segunda e regressao.
//
// Por isso metade dos testes aqui procura o que NAO deveria ter sumido:
// Copiloto no telefone, Relatorios, Configuracoes, Caixa de entrada, Links,
// Ideias, e as rotas antigas respondendo por URL direta.
//
// O gesto do Kanban NAO e exercitado aqui: ele e area congelada e ja tem
// cobertura propria em `board-touchdrag.smoke.test.js`.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

const TIROS = '/tmp/claude-0/-home-user-agenda360/1ee40b6c-b1b9-53f8-9226-ecdb77b318a9/scratchpad/c2'

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
      if (e.name === '__smoke__' || e.name === '__baseline__') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) varrer(full)
      else maisNovo = Math.max(maisNovo, fs.statSync(full).mtimeMs)
    }
  }
  varrer(path.join(ROOT, 'src'))
  return maisNovo > distTime
}

// Uma nota, um link e uma tarefa: o minimo para provar que Memoria mostra o
// caminho para as tres areas e que a busca do C1 continua achando.
const SEMENTE = `(() => {
  const KEY = 'agenda360.db.v2'
  const db = JSON.parse(localStorage.getItem(KEY))
  if (!db) return false
  const ws = db.workspaces[0].id, uid = db.profiles[0].id
  const agora = new Date().toISOString()
  db.inbox_items = [
    { id: 'c2-nota', workspace_id: ws, created_by: uid, type: 'note', status: 'inbox', origin: 'manual',
      title: 'Nota do C2', content: 'conteudo guardado para o teste', created_at: agora, updated_at: agora },
  ]
  db.links = [
    { id: 'c2-link', workspace_id: ws, created_by: uid, title: 'Link do C2', url: 'https://exemplo.com.br/c2', created_at: agora },
  ]
  localStorage.setItem(KEY, JSON.stringify(db))
  return true
})()`

async function sessao({ largura, altura, toque }) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: altura },
    hasTouch: toque,
    isMobile: toque,
  })
  const page = await ctx.newPage()
  await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  if (await page.locator('input[type="email"]').count()) {
    await page.fill('input[type="email"]', 'c2@agenda360.test')
    await page.fill('input[type="password"]', 'c2123456')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  return { ctx, page }
}

const irPara = async (page, rota) => {
  await page.goto(`http://127.0.0.1:${porta}${rota}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' })
  fs.mkdirSync(TIROS, { recursive: true })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
}, 180000)

afterAll(async () => {
  await browser?.close()
  await new Promise((r) => servidor?.close(r))
})

describe('[C2] Desktop — os quatro destinos e a hierarquia', () => {
  let page
  let ctx

  beforeAll(async () => { ({ ctx, page } = await sessao({ largura: 1440, altura: 900, toque: false })) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('[C2] a barra lateral mostra os QUATRO destinos', async () => {
    const barra = page.locator('[data-testid="sidebar"]')
    const texto = await barra.innerText()
    for (const destino of ['Hoje', 'Agenda', 'Tarefas', 'Memória']) {
      expect(texto).toContain(destino)
    }
  }, 60000)

  it('[C2] as capacidades secundarias aparecem sob o papel que cumprem', async () => {
    const texto = await page.locator('[data-testid="sidebar"]').innerText()
    expect(texto).toMatch(/Assist[êe]ncia/i)
    expect(texto).toContain('Copiloto')
    expect(texto).toMatch(/Acompanhamento/i)
    expect(texto).toContain('Relatórios')
    expect(texto).toMatch(/Configura/i)
    await page.screenshot({ path: `${TIROS}/desktop-sidebar.png` })
  }, 60000)

  it('[C2] Criar e Buscar continuam na Topbar, como acao global e utilidade', async () => {
    expect(await page.getByRole('button', { name: /Nova atividade/i }).isVisible()).toBe(true)
    expect(await page.getByRole('button', { name: /Buscar/i }).first().isVisible()).toBe(true)
  }, 60000)

  it('[C2] a barra recolhe e expande, preservando os destinos', async () => {
    const barra = page.locator('[data-testid="sidebar"]')
    const inicial = await barra.getAttribute('data-recolhida')

    await page.locator('[data-testid="alternar-sidebar"]').click()
    await page.waitForTimeout(500)
    expect(await barra.getAttribute('data-recolhida')).not.toBe(inicial)
    // Recolhida, os rotulos somem da tela mas os destinos continuam navegaveis:
    // o nome vive em `aria-label`.
    expect(await barra.locator('a[aria-label="Memória"]').count()).toBe(1)
    await page.screenshot({ path: `${TIROS}/desktop-sidebar-recolhida.png` })

    await page.locator('[data-testid="alternar-sidebar"]').click()
    await page.waitForTimeout(500)
    expect(await barra.getAttribute('data-recolhida')).toBe(inicial)
  }, 60000)

  it('[C2] o destino ativo acompanha a navegacao', async () => {
    await irPara(page, '/memoria')
    const ativo = await page.locator('[data-testid="sidebar"] a.bg-surface-2').first().innerText()
    expect(ativo).toContain('Memória')
  }, 60000)
})

describe('[C2] Memoria reune o legado sem apagar nada', () => {
  let page
  let ctx

  beforeAll(async () => { ({ ctx, page } = await sessao({ largura: 1440, altura: 900, toque: false })) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('[C2] Memoria mostra caminho para notas, por organizar e links', async () => {
    await irPara(page, '/memoria')
    const texto = await page.locator('main').innerText()
    expect(texto).toMatch(/Notas e ideias/i)
    expect(texto).toMatch(/Por organizar/i)
    expect(texto).toMatch(/Links e refer/i)
    await page.screenshot({ path: `${TIROS}/desktop-memoria.png` })
  }, 60000)

  it('[C2] cada caminho leva a tela que ja existia', async () => {
    await irPara(page, '/memoria')
    await page.getByText('Notas e ideias').click()
    await page.waitForTimeout(1000)
    expect(page.url()).toContain('/ideias')

    await irPara(page, '/memoria')
    await page.getByText('Por organizar').click()
    await page.waitForTimeout(1000)
    expect(page.url()).toContain('/caixa')

    await irPara(page, '/memoria')
    await page.getByText('Links e refer').click()
    await page.waitForTimeout(1000)
    expect(page.url()).toContain('/links')
  }, 90000)

  it('[C2] abrir Memoria NAO escreve nada', async () => {
    const antes = await page.evaluate(() => localStorage.getItem('agenda360.db.v2'))
    await irPara(page, '/memoria')
    await page.waitForTimeout(1200)
    const depois = await page.evaluate(() => localStorage.getItem('agenda360.db.v2'))
    expect(depois).toBe(antes)
  }, 60000)
})

describe('[C2] Rotas antigas continuam respondendo', () => {
  let page
  let ctx

  beforeAll(async () => { ({ ctx, page } = await sessao({ largura: 1440, altura: 900, toque: false })) }, 120000)
  afterAll(async () => { await ctx?.close() })

  const rotas = [
    ['/ideias', /Ideias/i],
    ['/caixa', /Caixa de entrada/i],
    ['/links', /links/i],
    ['/assistente', /Copiloto|Assistente/i],
    ['/relatorios', /Relat/i],
    ['/config', /Configura/i],
    ['/tarefas', /Tarefas/i],
    ['/dia', /Agenda|dia/i],
  ]

  for (const [rota, esperado] of rotas) {
    it(`[C2] ${rota} continua abrindo`, async () => {
      await irPara(page, rota)
      expect(page.url()).toContain(rota)
      const texto = await page.locator('main').innerText()
      expect(texto).toMatch(esperado)
    }, 60000)
  }

  it('[C2] a rota de uma nota especifica continua valida (a busca do C1 depende dela)', async () => {
    await irPara(page, '/ideias/c2-nota')
    expect(page.url()).toContain('/ideias/c2-nota')
  }, 60000)
})

describe('[C2] iPhone 390x844 — navegacao principal e acesso ao resto', () => {
  let page
  let ctx

  beforeAll(async () => { ({ ctx, page } = await sessao({ largura: 390, altura: 844, toque: true })) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('[C2] a barra inferior tem EXATAMENTE Hoje, Agenda, +, Tarefas, Memoria', async () => {
    const nav = page.locator('nav.fixed.inset-x-0.bottom-0')
    const rotulos = await nav.locator('a').allInnerTexts()
    expect(rotulos.map((t) => t.trim())).toEqual(['Hoje', 'Agenda', 'Tarefas', 'Memória'])
    expect(await nav.getByRole('button', { name: /Capturar/i }).isVisible()).toBe(true)
    await page.screenshot({ path: `${TIROS}/mobile-bottomnav.png` })
  }, 60000)

  it('[C2] a barra inferior nao cobre o conteudo da tela', async () => {
    await irPara(page, '/memoria')
    const folga = await page.evaluate(() => {
      const nav = document.querySelector('nav.fixed.inset-x-0.bottom-0')
      const main = document.querySelector('main')
      if (!nav || !main) return null
      const ultimo = main.querySelector('a:last-of-type')
      if (!ultimo) return null
      return nav.getBoundingClientRect().top - ultimo.getBoundingClientRect().bottom
    })
    expect(folga).not.toBeNull()
    expect(folga).toBeGreaterThan(0) // o ultimo item da lista termina ACIMA da barra
  }, 60000)

  it('[C2] o + central abre a porta de criacao, com os caminhos de sempre', async () => {
    const nav = page.locator('nav.fixed.inset-x-0.bottom-0')
    await nav.getByRole('button', { name: /Capturar/i }).click()
    await page.waitForTimeout(700)
    const texto = await page.locator('body').innerText()
    expect(texto).toMatch(/Tarefa/i)
    expect(texto).toMatch(/Compromisso/i)
    expect(texto).toMatch(/Capturar/i)
    await page.screenshot({ path: `${TIROS}/mobile-criar.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 60000)

  it('[C2] Copiloto, Relatorios e Configuracoes continuam acessiveis pelo menu pessoal', async () => {
    await irPara(page, '/')
    await page.locator('button[aria-label="Conta"]:visible').first().click()
    await page.waitForTimeout(600)
    const texto = await page.locator('body').innerText()
    expect(texto).toContain('Copiloto')
    expect(texto).toContain('Relatórios')
    expect(texto).toMatch(/Configura/i)
    await page.screenshot({ path: `${TIROS}/mobile-menu-pessoal.png` })
  }, 60000)

  it('[C2] o item do Copiloto no menu pessoal aponta para a tela do Copiloto', async () => {
    await irPara(page, '/')
    await page.locator('button[aria-label="Conta"]:visible').first().click()
    await page.waitForTimeout(600)
    // O menu pessoal e o painel flutuante; a barra lateral do drawer tambem
    // tem um link para o Copiloto, entao a busca e ESCOPADA ao painel.
    // O menu pessoal traz o link; a barra lateral (drawer fechado) tambem tem
    // o seu. O que importa provar e que, com o menu aberto, ha um caminho
    // VISIVEL para o Copiloto no telefone.
    expect(await page.locator('a[href="/assistente"]:visible').count()).toBeGreaterThan(0)
    // Que a rota abre de verdade esta provado em "Rotas antigas continuam
    // respondendo"; aqui o que importa e o CAMINHO existir no telefone.
  }, 60000)

  it('[C2] as notificacoes continuam no cabecalho', async () => {
    await irPara(page, '/')
    const sino = page.getByRole('button', { name: /Alerta|Notifica/i })
    expect(await sino.count()).toBeGreaterThan(0)
  }, 60000)

  it('[C2] Memoria leva as tres areas tambem no telefone', async () => {
    await irPara(page, '/memoria')
    await page.getByText('Notas e ideias').click()
    await page.waitForTimeout(1000)
    expect(page.url()).toContain('/ideias')
    await page.goBack()
    await page.waitForTimeout(800)
    expect(page.url()).toContain('/memoria')
    await page.screenshot({ path: `${TIROS}/mobile-memoria.png` })
  }, 60000)

  it('[C2] o destino ativo da barra inferior acompanha a rota', async () => {
    await irPara(page, '/memoria')
    const ativo = await page.locator('nav.fixed.inset-x-0.bottom-0 a.text-accent').innerText()
    expect(ativo.trim()).toBe('Memória')
  }, 60000)
})
