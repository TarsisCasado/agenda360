/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// PERSISTENCIA DO COPILOTO (CP5.7.1) — a regressao do QA real.
//
// O relato: conversa visivel no Copiloto -> F5 -> tudo sumiu.
//
// Este arquivo reproduz o caminho inteiro do briefing, um refresh de cada vez:
// pergunta multi-turno -> proposta -> revisao da proposta -> confirmacao. E,
// antes de olhar a tela, ele olha o ARMAZENAMENTO: e assim que se distingue
// "o dado se perdeu" de "o dado esta la e a tela nao o encontra". Sao doencas
// diferentes e o remedio de uma nao serve a outra.
//
// Roda em MODO DEMO — sem Supabase, exatamente como o Preview. Nada de mock
// que devolva persistencia que o Preview real nao tem.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

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

async function entrar() {
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
}

async function irAoCopiloto() {
  await page.goto(`http://127.0.0.1:${porta}/assistente`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

async function dizer(texto) {
  const campo = page.getByLabel('Mensagem para o copiloto')
  await campo.fill(texto)
  await campo.press('Enter')
  await page.waitForTimeout(2600)
}

async function recarregar() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
}

const conversa = () => page.locator('main').innerText()

// O que existe no armazenamento local (o "banco" do modo demo).
function armazenamento() {
  return page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('agenda360.db.v2') || '{}')
    return {
      conversas: (db.ai_conversations || []).length,
      mensagens: (db.ai_messages || []).length,
      pendentes: (db.ai_conversations || []).filter((c) => c.context?.pending).length,
      tarefas: (db.tasks || []).map((t) => t.title),
    }
  })
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await ctx.newPage()
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await entrar()
}, 240_000)

afterAll(async () => {
  await browser?.close().catch(() => {})
  servidor?.close()
})

// Cada cenario comeca de uma conversa limpa (sem herdar rascunho do anterior).
beforeEach(async () => {
  await irAoCopiloto()
  await page.evaluate(() => {
    const KEY = 'agenda360.db.v2'
    const db = JSON.parse(localStorage.getItem(KEY) || '{}')
    db.ai_conversations = []
    db.ai_messages = []
    localStorage.setItem(KEY, JSON.stringify(db))
    localStorage.removeItem('agenda360.copiloto.conversa')
  })
  await recarregar()
})

describe('o que o refresh não pode apagar', () => {
  it('a conversa e a pergunta em aberto continuam depois do F5', async () => {
    await dizer('Marcar dentista')
    const antes = await conversa()
    expect(antes).toMatch(/Marcar dentista/i)
    expect(antes).toMatch(/Para quando/i)

    // O DADO existe no armazenamento — isto separa "perdeu" de "não achou".
    const guardado = await armazenamento()
    expect(guardado.mensagens).toBeGreaterThan(0)
    expect(guardado.pendentes).toBe(1)

    await recarregar()
    const depois = await conversa()
    expect(depois, 'a fala do usuário sumiu no refresh').toMatch(/Marcar dentista/i)
    expect(depois, 'a pergunta em aberto sumiu no refresh').toMatch(/Para quando/i)
  }, 120_000)

  it('a conversa continua de onde parou: responder depois do F5 leva à proposta', async () => {
    await dizer('Marcar dentista')
    await recarregar()
    await dizer('sem data')
    const t = await conversa()
    expect(t).toMatch(/Dentista/i)
    expect(t).toMatch(/Confirmar/i)
  }, 120_000)

  it('a proposta aguardando confirmação continua depois do F5', async () => {
    await dizer('Marcar dentista')
    await dizer('sem data')
    expect(await conversa()).toMatch(/Confirmar/i)

    await recarregar()
    const depois = await conversa()
    expect(depois, 'a proposta sumiu no refresh').toMatch(/Confirmar/i)
    expect(depois).toMatch(/Dentista/i)
  }, 120_000)

  it('a proposta REVISADA continua depois do F5 — e é a versão nova', async () => {
    await dizer('Marcar dentista')
    await dizer('sem data')
    // A leitura tem de ser DENTRO do cartao: a frase do usuario tambem fica na
    // conversa, e procurar no texto da pagina daria o teste por passado mesmo
    // se o cartao ainda mostrasse a versao velha.
    const cartao = () => page.locator('[data-testid="copiloto-proposta"]').innerText()
    expect(await cartao()).toMatch(/Sem data/i)

    await dizer('muda para sexta')
    const revisado = await cartao()
    expect(revisado).not.toMatch(/Sem data/i)

    await recarregar()
    const depois = await cartao()
    expect(depois, 'o cartão voltou na versão anterior à revisão').toBe(revisado)
  }, 120_000)

  it('o artefato confirmado sobrevive — e a proposta não volta como fantasma', async () => {
    await dizer('Marcar dentista')
    await dizer('sem data')
    await page.getByRole('button', { name: /^Confirmar/ }).click()
    await page.waitForTimeout(2000)

    await recarregar()
    const guardado = await armazenamento()
    expect(guardado.tarefas.some((t) => /Dentista/i.test(t))).toBe(true)
    // Confirmado = rascunho encerrado. Se a proposta reaparecesse, o usuário
    // criaria a mesma atividade duas vezes.
    expect(await page.getByRole('button', { name: /^Confirmar/ }).count()).toBe(0)
  }, 120_000)

  it('conversa vazia continua vazia — nada de ressuscitar histórico de ontem sem contexto', async () => {
    await recarregar()
    expect(await conversa()).toMatch(/Olá|O que você precisa/i)
  }, 120_000)
})
