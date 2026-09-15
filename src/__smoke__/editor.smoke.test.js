/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DO EDITOR DE ATIVIDADE (CP5.9) — no build real.
//
// O checkpoint mexeu SO na forma: mesmos campos, mesmo `form`, mesmo `submit`,
// mesma regra de alerta do CP5.8.1. Um redesenho que "so mexe na forma" e
// exatamente o tipo de mudanca que quebra comportamento sem ninguem perceber —
// entao o que se prova aqui e o comportamento, nao a aparencia:
//
//   1. criar e editar continuam gravando;
//   2. atividade COM data, COM horario e SEM data continuam possiveis;
//   3. o alerta desligado nao pede nada; ligado sem horario RECUSA com a frase
//      do produto (a regra do CP5.8.1, intacta);
//   4. antecedencia 0 ("Na hora") e > 0 gravam o numero certo — a mudanca de
//      campo numerico para escolha nomeada e a parte mais arriscada do CP5.9;
//   5. Cancelar nao grava;
//   6. reabrir mostra o que foi gravado (persistencia real, nao estado de tela);
//   7. o alvo de toque das linhas continua >= 44px.
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

const dlg = (page) => page.locator('[role="dialog"]')

async function irParaTarefas(page) {
  await page.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

// O editor completo abre ao tocar numa atividade existente.
async function abrirEditor(page, titulo) {
  await page.getByText(titulo, { exact: false }).first().click()
  await dlg(page).waitFor({ timeout: 8000 })
  await page.waitForTimeout(500)
}

const campoTitulo = (page) => dlg(page).locator('[aria-label="Título da atividade"]')
const linha = (page, rotulo) => dlg(page).locator('.prop-row').filter({ hasText: rotulo })

async function salvar(page) {
  await dlg(page).getByRole('button', { name: /^Salvar$|^Criar$/ }).click()
  await page.waitForTimeout(1200)
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
  await irParaTarefas(page)
}, 240_000)

afterAll(async () => {
  await ctx?.close()
  await browser?.close()
  servidor?.close()
})

describe('editor de atividade — o que nao pode mudar', () => {
  it('1. editar um titulo grava e persiste ao reabrir', async () => {
    await abrirEditor(page, 'Revisar proposta comercial')
    await campoTitulo(page).fill('Revisar proposta comercial v2')
    await salvar(page)
    // Reabrir e o unico jeito de provar persistencia — o estado de tela mente.
    await abrirEditor(page, 'Revisar proposta comercial v2')
    expect(await campoTitulo(page).inputValue()).toBe('Revisar proposta comercial v2')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('2. Cancelar NAO grava', async () => {
    await abrirEditor(page, 'Revisar proposta comercial v2')
    await campoTitulo(page).fill('LIXO QUE NAO PODE SER GRAVADO')
    await dlg(page).getByRole('button', { name: 'Cancelar' }).click()
    await page.waitForTimeout(800)
    expect(await page.getByText('LIXO QUE NAO PODE SER GRAVADO').count()).toBe(0)
    expect(await page.getByText('Revisar proposta comercial v2').count()).toBeGreaterThan(0)
  }, 90_000)

  it('3. atividade COM data e COM horario mantem os tres campos do grupo Quando', async () => {
    await abrirEditor(page, 'Reuniao de alinhamento da equipe')
    const grupo = dlg(page).locator('.slot-cell')
    expect(await grupo.count()).toBe(3)
    expect(await dlg(page).locator('input[type="date"]').inputValue()).not.toBe('')
    expect(await dlg(page).locator('input[type="time"]').first().inputValue()).not.toBe('')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('4. "Atividade sem data" limpa data e horarios juntos', async () => {
    await abrirEditor(page, 'Reuniao de alinhamento da equipe')
    await dlg(page).getByText('Atividade sem data').click()
    await page.waitForTimeout(300)
    expect(await dlg(page).locator('input[type="date"]').inputValue()).toBe('')
    expect(await dlg(page).locator('input[type="time"]').first().inputValue()).toBe('')
    expect(await dlg(page).locator('input[type="time"]').nth(1).inputValue()).toBe('')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('5. alerta DESLIGADO mostra so a linha principal — sem canal nem antecedencia', async () => {
    await abrirEditor(page, 'Reuniao de alinhamento da equipe')
    expect(await linha(page, 'Avisar antes').count()).toBe(1)
    expect(await linha(page, 'Canal').count()).toBe(0)
    expect(await linha(page, 'Antecedência').count()).toBe(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('6. alerta LIGADO revela Canal e Antecedencia no MESMO bloco', async () => {
    await abrirEditor(page, 'Reuniao de alinhamento da equipe')
    await dlg(page).getByText('Avisar antes').click()
    await page.waitForTimeout(400)
    expect(await linha(page, 'Canal').count()).toBe(1)
    expect(await linha(page, 'Antecedência').count()).toBe(1)
    // "no MESMO bloco": as tres linhas sao irmas dentro de um unico .group-box.
    const irmas = await dlg(page).evaluate(() => {
      const sw = [...document.querySelectorAll('[role="dialog"] .prop-row')]
        .find((el) => el.textContent.includes('Avisar antes'))
      return sw?.parentElement?.querySelectorAll('.prop-row').length
    })
    expect(irmas).toBe(3)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('7. alerta ligado SEM horario recusa com a frase do produto (CP5.8.1)', async () => {
    await abrirEditor(page, 'Revisar proposta comercial v2') // esta sem horario
    await dlg(page).getByText('Avisar antes').click()
    await page.waitForTimeout(400)
    // Dito ANTES de tentar salvar.
    expect(await dlg(page).getByText(/preciso saber o horário/i).count()).toBeGreaterThan(0)
    await salvar(page)
    // E o modal continua aberto: nada foi gravado.
    expect(await dlg(page).count()).toBe(1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('8. antecedencia "Na hora" (0) e "> 0" gravam e persistem', async () => {
    for (const [rotulo, esperado] of [['Na hora', '0'], ['30 minutos antes', '30']]) {
      await abrirEditor(page, 'Reuniao de alinhamento da equipe')
      const ligado = await linha(page, 'Antecedência').count()
      if (!ligado) { await dlg(page).getByText('Avisar antes').click(); await page.waitForTimeout(400) }
      await linha(page, 'Antecedência').locator('select').selectOption({ label: rotulo })
      await page.waitForTimeout(200)
      await salvar(page)
      await abrirEditor(page, 'Reuniao de alinhamento da equipe')
      expect(await linha(page, 'Antecedência').locator('select').inputValue()).toBe(esperado)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(400)
    }
  }, 90_000)

  it('9. criar uma atividade nova pelo editor grava', async () => {
    // ONDE se cria pelo editor completo: em /tarefas o TaskModal so EDITA (o
    // "+ Adicionar" da coluna e a criacao rapida em linha). O editor abre em
    // modo criacao ao tocar numa faixa de hora vazia da Agenda do dia — e
    // esse o caminho exercitado aqui.
    await page.goto(`http://127.0.0.1:${porta}/dia`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1600)
    await page.getByRole('button', { name: 'Criar às 10:00' }).click()
    await dlg(page).waitFor({ timeout: 8000 })
    await page.waitForTimeout(400)
    await campoTitulo(page).fill('Atividade criada no smoke CP5.9')
    await salvar(page)
    await page.getByText('Atividade criada no smoke CP5.9').first().waitFor({ timeout: 8000 })
  }, 90_000)
})

describe('editor de atividade — toque e densidade', () => {
  it('10. toda linha de propriedade tem alvo >= 44px', async () => {
    const ctxM = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    const p = await ctxM.newPage()
    await p.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
    await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1500)
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
    await p.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1500)
    await p.getByText('Reuniao de alinhamento da equipe').first().click()
    await p.locator('[role="dialog"]').waitFor({ timeout: 8000 })
    await p.waitForTimeout(500)
    const alturas = await p.locator('[role="dialog"] .prop-row').evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)))
    expect(alturas.length).toBeGreaterThan(0)
    for (const h of alturas) expect(h).toBeGreaterThanOrEqual(44)
    await ctxM.close()
  }, 90_000)
})
