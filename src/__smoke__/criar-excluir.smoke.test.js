/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DA CRIACAO DIRETA E DA EXCLUSAO (CP5.9.1) — no build real.
//
// Duas mudancas de ciclo de vida, e as duas so se provam com o app montado:
//
//   1. "Nova atividade" deixou de significar "fale com o Copiloto". Quem ja
//      sabe o que quer entra direto no editor; a captura continua existindo,
//      como uma das tres escolhas;
//   2. Excluir existe, e passa por UMA operacao de dominio so
//      (taskService.remove), que ja limpa os lembretes.
//
// O que se prova aqui e comportamento: o que abre, o que grava, o que some.
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

const dlg = (page) => page.locator('[role="dialog"]')
const menu = (page) => page.locator('[role="menu"]')

async function abrirMenuGlobal(page) {
  await page.getByRole('button', { name: /Nova atividade/i }).click()
  await menu(page).waitFor({ timeout: 8000 })
  await page.waitForTimeout(300)
}

async function ir(page, url) {
  await page.goto(`http://127.0.0.1:${porta}${url}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1600)
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

describe('Nova atividade — a captura deixa de ser obrigatoria', () => {
  it('1. o botao global oferece TRES escolhas, e nao abre nada sozinho', async () => {
    await ir(page, '/tarefas')
    await abrirMenuGlobal(page)
    const t = await menu(page).innerText()
    expect(t).toMatch(/Tarefa/)
    expect(t).toMatch(/Compromisso/)
    expect(t).toMatch(/Capturar com o Copiloto/)
    // nada de editor nem de captura antes de escolher
    expect(await dlg(page).count()).toBe(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }, 90_000)

  it('2. Tarefa abre o editor direto, SEM passar pelo Copiloto', async () => {
    await abrirMenuGlobal(page)
    await menu(page).getByRole('menuitem', { name: /^Tarefa/ }).click()
    await dlg(page).waitFor({ timeout: 8000 })
    const t = await dlg(page).innerText()
    expect(t).toMatch(/Nova tarefa/)
    // a captura conversacional NAO apareceu
    expect(t).not.toMatch(/O que você precisa organizar/i)
    // tarefa: data opcional, entao nasce sem dia
    expect(await dlg(page).locator('input[type="date"]').inputValue()).toBe('')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('3. Compromisso abre o editor direto, JA com um dia', async () => {
    await abrirMenuGlobal(page)
    await menu(page).getByRole('menuitem', { name: /^Compromisso/ }).click()
    await dlg(page).waitFor({ timeout: 8000 })
    expect(await dlg(page).innerText()).toMatch(/Novo compromisso/)
    // dia preenchido; horario NAO inventado (CP5.8.1)
    expect(await dlg(page).locator('input[type="date"]').inputValue()).not.toBe('')
    expect(await dlg(page).locator('input[type="time"]').first().inputValue()).toBe('')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('4. "Capturar com o Copiloto" mantem o fluxo de sempre', async () => {
    await abrirMenuGlobal(page)
    await menu(page).getByRole('menuitem', { name: /Capturar com o Copiloto/ }).click()
    await dlg(page).waitFor({ timeout: 8000 })
    expect(await dlg(page).innerText()).toMatch(/O que você precisa organizar/i)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('5. Agenda: criar numa faixa de hora abre COMPROMISSO, sem menu', async () => {
    await ir(page, '/dia')
    await page.getByRole('button', { name: 'Criar às 10:00' }).click()
    await dlg(page).waitFor({ timeout: 8000 })
    expect(await dlg(page).innerText()).toMatch(/Novo compromisso/)
    expect(await dlg(page).locator('input[type="time"]').first().inputValue()).toBe('10:00')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('6. Tarefas: "Adicionar" da coluna cria TAREFA, sem menu e sem Copiloto', async () => {
    await ir(page, '/tarefas')
    await page.getByRole('button', { name: /^Adicionar$/ }).first().click()
    await page.waitForTimeout(600)
    // criacao em linha: nem menu de escolha, nem captura conversacional
    expect(await menu(page).count()).toBe(0)
    const corpo = await page.locator('main').innerText()
    expect(corpo).not.toMatch(/O que você precisa organizar/i)
  }, 90_000)
})

describe('Excluir atividade', () => {
  it('7. o editor oferece Excluir ao EDITAR, e nao ao criar', async () => {
    await ir(page, '/tarefas')
    await abrirMenuGlobal(page)
    await menu(page).getByRole('menuitem', { name: /^Tarefa/ }).click()
    await dlg(page).waitFor({ timeout: 8000 })
    expect(await dlg(page).getByRole('button', { name: /Excluir/ }).count()).toBe(0)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await page.getByText('Treino na academia').first().click()
    await dlg(page).waitFor({ timeout: 8000 })
    expect(await dlg(page).getByRole('button', { name: /Excluir/ }).count()).toBe(1)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 90_000)

  it('8. a confirmacao mostra o TITULO, e Cancelar nao exclui', async () => {
    await ir(page, '/tarefas')
    await page.getByText('Treino na academia').first().click()
    await dlg(page).waitFor({ timeout: 8000 })
    await dlg(page).getByRole('button', { name: /Excluir/ }).click()
    await page.waitForTimeout(600)
    const confirma = dlg(page).last()
    expect(await confirma.innerText()).toMatch(/Treino na academia/)
    await confirma.getByRole('button', { name: 'Cancelar' }).click()
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    // continua existindo
    expect(await page.getByText('Treino na academia').count()).toBeGreaterThan(0)
  }, 90_000)

  it('9. excluir uma TAREFA some da lista e nao volta no reload', async () => {
    await ir(page, '/tarefas')
    const antes = await page.getByText('Ler um capitulo').count()
    expect(antes).toBeGreaterThan(0)
    await page.getByText('Ler um capitulo').first().click()
    await dlg(page).waitFor({ timeout: 8000 })
    await dlg(page).getByRole('button', { name: /Excluir/ }).click()
    await page.waitForTimeout(600)
    await dlg(page).last().getByRole('button', { name: 'Excluir' }).click()
    await page.waitForTimeout(1500)
    expect(await page.getByText('Ler um capitulo').count()).toBe(0)
    await ir(page, '/tarefas')
    expect(await page.getByText('Ler um capitulo').count()).toBe(0)
  }, 90_000)

  it('10. excluir um COMPROMISSO some da Agenda e de Hoje', async () => {
    await ir(page, '/tarefas')
    await page.getByText('Reuniao de alinhamento da equipe').first().click()
    await dlg(page).waitFor({ timeout: 8000 })
    // o editor reconhece a especie pelo horario
    expect(await dlg(page).innerText()).toMatch(/Editar compromisso/)
    await dlg(page).getByRole('button', { name: /Excluir/ }).click()
    await page.waitForTimeout(600)
    await dlg(page).last().getByRole('button', { name: 'Excluir' }).click()
    await page.waitForTimeout(1500)
    for (const rota of ['/tarefas', '/dia', '/']) {
      await ir(page, rota)
      expect(
        await page.getByText('Reuniao de alinhamento da equipe').count(),
        `sumiu de ${rota}?`,
      ).toBe(0)
    }
  }, 120_000)

  it('11. excluida a atividade, o lembrete futuro NAO fica orfao', async () => {
    // A prova e no armazenamento, nao na tela: a exclusao passa por
    // taskService.remove, que chama reminderService.onTaskDeleted.
    const orfaos = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('agenda360.db.v2') || '{}')
      const ids = new Set((db.tasks || []).map((t) => t.id))
      return (db.reminders || []).filter((r) => !ids.has(r.task_id)).length
    })
    expect(orfaos, 'reminder apontando para atividade inexistente').toBe(0)
  }, 90_000)
})

describe('mobile e tema', () => {
  it('12. no 390 o menu sobe como folha, com alvos >= 44px', async () => {
    const { ctx: c, page: p } = await abrirApp({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await p.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1600)
    await p.locator('nav').last().getByRole('button').first().click()
    await p.locator('[role="menu"]').waitFor({ timeout: 8000 })
    await p.waitForTimeout(400)
    const itens = await p.locator('[role="menu"] button').evaluateAll((els) =>
      els.map((el) => { const r = el.getBoundingClientRect(); return { h: Math.round(r.height), bottom: Math.round(r.bottom) } }))
    expect(itens.length).toBe(3)
    for (const i of itens) expect(i.h).toBeGreaterThanOrEqual(44)
    // folha: ancorada embaixo, dentro da tela
    for (const i of itens) expect(i.bottom).toBeLessThanOrEqual(844)
    await c.close()
  }, 120_000)

  it('13. no escuro o menu e a confirmacao continuam legiveis', async () => {
    const { ctx: c, page: p } = await abrirApp({ viewport: { width: 1440, height: 900 } }, 'dark')
    await p.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(1600)
    await p.getByRole('button', { name: /Nova atividade/i }).click()
    await p.locator('[role="menu"]').waitFor({ timeout: 8000 })
    const fundo = await p.locator('[role="menu"]').evaluate((el) =>
      getComputedStyle(el.parentElement).backgroundColor)
    // no escuro o painel NAO pode ser transparente nem branco
    expect(fundo).not.toBe('rgba(0, 0, 0, 0)')
    expect(fundo).not.toBe('rgb(255, 255, 255)')
    await c.close()
  }, 120_000)
})
