/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DA CAPTURA (CP5.6) — no build real, nas duas portas.
//
// lib/capture.js prova a REGRA DO TIPO e lib/captureVault.js prova o cofre.
// Aqui prova-se o que so existe com o app montado:
//
//   1. UMA PORTA SO — o `+` do mobile e o "Nova atividade" do desktop abrem a
//      mesma superficie. Era esta a incoerencia que o checkpoint atacou;
//   2. A PROPOSTA E UM OBJETO — com TIPO visivel, e Compromisso e Tarefa nao
//      se confundem;
//   3. A IA NAO ESCREVE SOZINHA — nada entra no sistema antes do Confirmar;
//   4. NUNCA PERDER UMA CAPTURA — fechar a folha no meio nao apaga o texto;
//      ele volta ao reabrir, dito com clareza. E some so quando virou artefato
//      ou quando o usuario descartou.
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

async function abrirApp(device) {
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
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
  return { ctx, page }
}

const folha = (page) => page.locator('[role="dialog"]')

// Abre a captura pela porta daquele tamanho de tela.
async function abrirCaptura(page, porta_ = 'mobile') {
  if (porta_ === 'desktop') await page.getByRole('button', { name: /Nova atividade/i }).click()
  else await page.locator('nav').last().getByRole('button').first().click()
  await folha(page).waitFor({ timeout: 8000 })
  await page.waitForTimeout(400)
}

async function escrever(page, texto) {
  await folha(page).locator('textarea').fill(texto)
  await page.getByRole('button', { name: 'Interpretar' }).click()
  await page.waitForTimeout(2200)
}

// Uma captura curta abre uma PERGUNTA (slot faltando). Responder no mesmo
// campo e o caminho normal — e tambem o multi-turno do CP5.1, aqui exercitado
// de novo para provar que nao regrediu.
async function capturarTarefaSemData(page, titulo) {
  await escrever(page, titulo)
  await escrever(page, 'sem data')
  await folha(page).locator('[data-testid="captura-proposta"]').waitFor({ timeout: 15000 })
}

async function fecharFolha(page) {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
}

async function contarTarefas(page, titulo) {
  return page.evaluate((t) => {
    const db = JSON.parse(localStorage.getItem('agenda360.db.v2') || '{}')
    return (db.tasks || []).filter((x) => (x.title || '').includes(t)).length
  }, titulo)
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
}, 240_000)

afterAll(async () => {
  await browser?.close().catch(() => {})
  servidor?.close()
})

describe('uma porta só — as duas entradas abrem a MESMA superfície', () => {
  it('o + do mobile abre a captura conversacional', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page, 'mobile')
    await expect(folha(page).innerText()).resolves.toMatch(/O que você precisa organizar\?/i)
    await expect(folha(page).locator('textarea').count()).resolves.toBe(1)
    await ctx.close()
  }, 90_000)

  it('"Nova atividade" do desktop abre a MESMA coisa — não o formulário completo', async () => {
    const { ctx, page } = await abrirApp({ viewport: { width: 1440, height: 900 } })
    await abrirCaptura(page, 'desktop')
    const t = await folha(page).innerText()
    expect(t).toMatch(/O que você precisa organizar\?/i)
    // O formulario completo se identifica pelos campos rotulados; a captura,
    // por um campo livre. Se o desktop voltasse ao formulario, isto quebra.
    expect(await folha(page).locator('input[type="date"]').count()).toBe(0)
    expect(await folha(page).locator('textarea').count()).toBe(1)
    await ctx.close()
  }, 90_000)

  it('no desktop a folha não é nem modal minúsculo nem página inteira', async () => {
    const { ctx, page } = await abrirApp({ viewport: { width: 1440, height: 900 } })
    await abrirCaptura(page, 'desktop')
    const box = await folha(page).boundingBox()
    expect(box.width).toBeGreaterThan(520)
    expect(box.width).toBeLessThan(1440 * 0.62)
    expect(box.height).toBeLessThan(900 * 0.9)
    await ctx.close()
  }, 90_000)
})

describe('a proposta é um objeto — com TIPO visível', () => {
  it('hora marcada vira COMPROMISSO', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await escrever(page, 'Reuniao com gerentes amanha as 8:30')
    await folha(page).locator('[data-testid="captura-proposta"]').waitFor({ timeout: 15000 })
    await expect(folha(page).locator('[data-testid="captura-tipo"]').innerText()).resolves.toMatch(/COMPROMISSO/i)
    await ctx.close()
  }, 90_000)

  it('sem hora vira TAREFA — e "Sem data" aparece como informação', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await capturarTarefaSemData(page, 'Marcar dentista')
    const cartao = folha(page).locator('[data-testid="captura-proposta"]')
    expect(await cartao.locator('[data-testid="captura-tipo"]').innerText()).toMatch(/TAREFA/i)
    expect(await cartao.innerText()).toMatch(/Sem data/i)
    await ctx.close()
  }, 90_000)
})

describe('a IA não escreve sozinha', () => {
  it('com a proposta na tela, NADA foi gravado ainda', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await capturarTarefaSemData(page, 'Marcar dentista')
    expect(await contarTarefas(page, 'entista')).toBe(0)
    await ctx.close()
  }, 90_000)

  it('confirmar grava UMA vez e diz para onde foi', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await capturarTarefaSemData(page, 'Marcar dentista')
    await page.getByRole('button', { name: /^Confirmar/i }).click()
    await page.waitForTimeout(1800)
    expect(await contarTarefas(page, 'entista')).toBe(1)
    // O retorno curto: nao basta salvar, precisa dizer onde caiu.
    await expect(page.locator('body').innerText()).resolves.toMatch(/Criado em Tarefas|Criado na Agenda/i)
    await ctx.close()
  }, 90_000)
})

describe('NUNCA PERDER UMA CAPTURA', () => {
  it('fechar a folha no meio não apaga o texto — ele volta ao reabrir, dito com clareza', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await escrever(page, 'Falar com o contador sobre o imposto')
    await fecharFolha(page)
    await abrirCaptura(page)
    expect(await folha(page).locator('textarea').inputValue()).toMatch(/contador sobre o imposto/i)
    await expect(folha(page).locator('[data-testid="captura-recuperada"]').count()).resolves.toBe(1)
    await ctx.close()
  }, 90_000)

  it('a captura sobrevive até a um refresh — o cofre não é memória de tela', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await escrever(page, 'Renovar o seguro do carro')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1600)
    await abrirCaptura(page)
    expect(await folha(page).locator('textarea').inputValue()).toMatch(/Renovar o seguro/i)
    await ctx.close()
  }, 90_000)

  it('depois de confirmar, o cofre está limpo — a captura virou artefato', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await capturarTarefaSemData(page, 'Marcar dentista')
    await page.getByRole('button', { name: /^Confirmar/i }).click()
    await page.waitForTimeout(1800)
    await abrirCaptura(page)
    expect(await folha(page).locator('textarea').inputValue()).toBe('')
    await ctx.close()
  }, 90_000)

  it('descartar é explícito — e só ele limpa o cofre sem criar nada', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await capturarTarefaSemData(page, 'Marcar dentista')
    await page.getByRole('button', { name: /^Descartar/i }).click()
    await page.waitForTimeout(600)
    await fecharFolha(page)
    await abrirCaptura(page)
    expect(await folha(page).locator('textarea').inputValue()).toBe('')
    expect(await contarTarefas(page, 'entista')).toBe(0)
    await ctx.close()
  }, 90_000)
})

describe('quando o sistema NÃO entende — o texto continua recuperável', () => {
  it('devolve o texto ao campo e oferece a Caixa, sem inventar atividade', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await escrever(page, 'Levar o carro na revisao')
    // O agente nao entendeu: nao ha rascunho, nao ha pergunta a responder.
    expect(await folha(page).locator('[data-testid="captura-proposta"]').count()).toBe(0)
    expect(await folha(page).locator('textarea').inputValue()).toMatch(/carro na revisao/i)
    await folha(page).locator('[data-testid="captura-para-caixa"]').waitFor({ timeout: 8000 })
    await ctx.close()
  }, 90_000)

  it('guardar na Caixa salva o texto exato — e aí sim o cofre se esvazia', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    await escrever(page, 'Levar o carro na revisao')
    await folha(page).locator('[data-testid="captura-para-caixa"]').click()
    await page.waitForTimeout(1800)
    const notas = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('agenda360.db.v2') || '{}')
      return (db.inbox_items || []).map((n) => n.content)
    })
    expect(notas.some((c) => /carro na revisao/i.test(c || ''))).toBe(true)
    await abrirCaptura(page)
    expect(await folha(page).locator('textarea').inputValue()).toBe('')
    await ctx.close()
  }, 90_000)
})

describe('a folha continua utilizável no iPhone', () => {
  it('não cria rolagem lateral e o campo cabe na tela', async () => {
    const { ctx, page } = await abrirApp({ ...devices['iPhone 13'] })
    await abrirCaptura(page)
    const m = await page.evaluate(() => ({
      w: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      vh: window.innerHeight,
    }))
    expect(m.w).toBeLessThanOrEqual(m.vw + 1)
    const campo = await folha(page).locator('textarea').boundingBox()
    expect(campo.y + campo.height).toBeLessThanOrEqual(m.vh)
    // O botao de enviar e alvo de toque de verdade.
    const enviar = await page.getByRole('button', { name: 'Interpretar' }).boundingBox()
    expect(Math.min(enviar.width, enviar.height)).toBeGreaterThanOrEqual(40)
    await ctx.close()
  }, 90_000)
})
