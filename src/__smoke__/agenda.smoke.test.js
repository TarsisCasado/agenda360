/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import { getWeekDays, toISODate, addDays } from '../lib/date'

// ---------------------------------------------------------------------------
// SMOKE DE HOJE + AGENDA (CP5.5) — no build real.
//
// lib/today.js prova a REGRA (em que balde cada tarefa cai, que nada duplica).
// Aqui prova-se o que so aparece na tela montada:
//   - a informacao util cabe antes da primeira rolagem no iPhone;
//   - COMPROMISSO e TAREFA nao parecem a mesma entidade em nenhuma das visoes;
//   - e a invariante que atravessa a Agenda inteira: NADA some entre Dia,
//     Semana e Mes. Tres recortes do mesmo tempo que discordassem entre si
//     seriam pior que ter um so.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

// Uma carga com um caso de cada coisa que as tres visoes tem de tratar.
const SEMENTE = `(() => {
  const KEY = 'agenda360.db.v2'
  const db = JSON.parse(localStorage.getItem(KEY))
  if (!db) return false
  const ws = db.workspaces[0].id, uid = db.profiles[0].id
  const iso = (o) => { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10) }
  const base = { workspace_id: ws, created_by: uid, assignee_id: uid, delegated_by: null, delegated_at: null,
    description: '', link: '', notes: '', alert_enabled: false, alert_type: 'in_app', alert_minutes_before: 15,
    alert_sent: false, reschedule_count: 0, start_time: null, end_time: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), priority: 'medium' }
  db.tasks = [
    { ...base, id: 'a-compromisso', title: 'Reuniao com Joao', status: 'todo', date: iso(0), start_time: '23:30', end_time: '23:59' },
    { ...base, id: 'a-tarefa-hoje', title: 'Enviar o relatorio', status: 'todo', date: iso(0) },
    { ...base, id: 'a-atrasada', title: 'Pendencia antiga', status: 'todo', date: iso(-4) },
    { ...base, id: 'a-andamento', title: 'Escopo do BI', status: 'in_progress', date: null },
    { ...base, id: 'a-sem-data', title: 'Ideia solta', status: 'todo', date: null },
    { ...base, id: 'a-amanha', title: 'Compromisso de amanha', status: 'todo', date: iso(1), start_time: '10:00' },
    { ...base, id: 'a-futura', title: 'Tarefa de sexta', status: 'todo', date: iso(2) },
  ]
  db.inbox_items = []
  localStorage.setItem(KEY, JSON.stringify(db))
  return true
})()`

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

async function ir(url, espera) {
  await page.goto(`http://127.0.0.1:${porta}${url}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  if (espera) await page.waitForSelector(espera, { timeout: 15000 })
  await page.waitForTimeout(500)
}

const texto = () => page.locator('main').innerText()

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ ...devices['iPhone 13'] })
  page = await ctx.newPage()
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await entrar()
}, 240_000)

afterAll(async () => {
  await browser?.close().catch(() => {})
  servidor?.close()
})

beforeEach(async () => {
  await ir('/')
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
})

describe('Hoje — o que merece atenção agora', () => {
  it('as quatro entradas de foco aparecem e somam o que dizem somar', async () => {
    const n = await page.evaluate(() =>
      Object.fromEntries(
        ['atrasada', 'hoje', 'em_andamento', 'sem_data'].map((k) => [
          k,
          Number(document.querySelector(`[data-testid="hoje-entrada-${k}"]`)?.textContent.match(/^\d+/)?.[0]),
        ]),
      ),
    )
    expect(n).toEqual({ atrasada: 1, hoje: 2, em_andamento: 1, sem_data: 1 })
  }, 40_000)

  it('tarefa FUTURA com data não polui Hoje — ela já tem lugar, e é a Agenda', async () => {
    const t = await texto()
    expect(t).not.toMatch(/Tarefa de sexta/)
    expect(t).not.toMatch(/Compromisso de amanha/)
  }, 40_000)

  it('nenhum item aparece duas vezes na tela', async () => {
    const dup = await page.evaluate(() => {
      const titulos = [...document.querySelectorAll('main [data-testid^="hoje-"], main .list > *')]
        .map((n) => n.textContent.trim())
        .filter(Boolean)
      const so = titulos.filter((x) => x.includes('Enviar o relatorio'))
      return so.length
    })
    expect(dup).toBeLessThanOrEqual(1)
  }, 40_000)

  it('a informação útil cabe antes da primeira rolagem no iPhone', async () => {
    const m = await page.evaluate(() => {
      const h = window.innerHeight
      const entradas = document.querySelector('[data-testid="hoje-entradas"]')
      const primeiraLinha = document.querySelector('main .list > *')
      return {
        entradas: entradas ? entradas.getBoundingClientRect().bottom < h : false,
        primeiraLinha: primeiraLinha ? primeiraLinha.getBoundingClientRect().top < h : false,
      }
    })
    expect(m.entradas, 'as quatro entradas precisam caber acima da dobra').toBe(true)
    expect(m.primeiraLinha, 'a primeira tarefa precisa começar acima da dobra').toBe(true)
  }, 40_000)

  it('dia livre é uma boa notícia, não um erro', async () => {
    await page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('agenda360.db.v2'))
      d.tasks = []
      localStorage.setItem('agenda360.db.v2', JSON.stringify(d))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    const t = await texto()
    expect(t).toMatch(/Seu dia está livre/i)
    expect(t).not.toMatch(/erro|falha/i)
    // e a estrutura nao vira quatro caixas vazias
    expect(await page.locator('[data-testid="hoje-entradas"]').count()).toBe(0)
  }, 40_000)
})

describe('Agenda — o que ACONTECE numa hora vs. o que PRECISA ser feito', () => {
  it('Dia separa compromisso de tarefa, e não inventa horário', async () => {
    await ir('/dia', '[data-testid="dia-timeline"]')
    const t = await texto()
    // `.text-section` aplica text-transform: uppercase, e innerText devolve o
    // texto RENDERIZADO — por isso a comparação é indiferente a maiúsculas.
    expect(t).toMatch(/compromissos/i)
    expect(t).toMatch(/tarefas do dia/i)
    // o compromisso vive na régua; a tarefa, na lista de baixo
    const onde = await page.evaluate(() => ({
      compromissoNaRegua: Boolean(
        [...document.querySelectorAll('[data-testid="dia-timeline"] *')].find((n) =>
          n.textContent?.trim().startsWith('Reuniao com Joao'),
        ),
      ),
      tarefaNaRegua: Boolean(
        [...document.querySelectorAll('[data-testid="dia-timeline"] *')].find((n) =>
          n.textContent?.trim().startsWith('Enviar o relatorio'),
        ),
      ),
      tarefaNaLista: Boolean(
        document.querySelector('[data-testid="dia-tarefas"]')?.textContent.includes('Enviar o relatorio'),
      ),
    }))
    expect(onde.compromissoNaRegua, 'compromisso pertence à régua').toBe(true)
    expect(onde.tarefaNaRegua, 'tarefa sem hora NUNCA entra na régua').toBe(false)
    expect(onde.tarefaNaLista, 'tarefa do dia fica na lista abaixo').toBe(true)
  }, 60_000)

  it('o cabeçalho do Dia sobrevive à rolagem automática até o "agora"', async () => {
    await ir('/dia', '[data-testid="dia-timeline"]')
    const visivel = await page.evaluate(() => {
      const h = [...document.querySelectorAll('main h1')].find((x) => x.textContent.trim())
      if (!h) return false
      const r = h.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= window.innerHeight
    })
    expect(visivel, 'você precisa saber que dia está vendo').toBe(true)
  }, 60_000)

  it('Semana lista os sete dias e diz "Dia livre" nos vazios', async () => {
    await ir('/dia?visao=semana')
    const m = await page.evaluate(() => ({
      dias: document.querySelectorAll('[data-testid^="semana-dia-"]').length,
      livres: (document.querySelector('main').innerText.match(/Dia livre/g) || []).length,
    }))
    expect(m.dias).toBe(7)
    expect(m.livres).toBeGreaterThan(0)
  }, 60_000)

  it('Mês marca os dias com atividade e o dia de hoje', async () => {
    await ir('/dia?visao=mes')
    const m = await page.evaluate(() => {
      const celulas = [...document.querySelectorAll('[data-testid^="mes-dia-"]')]
      return {
        total: celulas.length,
        comAtividade: celulas.filter((c) => c.className.includes('bg-surface-2/60')).length,
        hoje: celulas.filter((c) => c.className.includes('ring-accent/45')).length,
      }
    })
    expect(m.total).toBeGreaterThanOrEqual(28)
    expect(m.comAtividade, 'dias com atividade precisam se distinguir').toBeGreaterThan(0)
    expect(m.hoje, 'hoje é exatamente um dia').toBe(1)
  }, 60_000)

  it('A INVARIANTE: nada some entre Dia, Semana e Mês', async () => {
    // A tarefa de hoje e o compromisso de hoje têm de aparecer nos três
    // recortes. Três leituras do mesmo tempo que discordassem entre si seriam
    // pior que ter uma só.
    await ir('/dia', '[data-testid="dia-timeline"]')
    const dia = await texto()
    expect(dia).toMatch(/Reuniao com Joao/)
    expect(dia).toMatch(/Enviar o relatorio/)

    await ir('/dia?visao=semana')
    const semana = await texto()
    expect(semana).toMatch(/Reuniao com Joao/)
    expect(semana).toMatch(/Enviar o relatorio/)
    // "Amanha" so pertence a esta semana se hoje NAO for o ultimo dia dela.
    // A afirmacao antiga ("a semana inclui amanha") era verdadeira de segunda a
    // sabado e FALSA aos domingos — a suite quebrava um dia por semana por uma
    // premissa do teste, nao do produto. A regra de semana nao muda: a
    // expectativa e derivada da MESMA funcao que a Agenda usa para montar a
    // faixa (getWeekDays, weekStartsOn: 1), entao teste e produto nao podem
    // discordar sobre onde a semana termina.
    //
    // E o caso do ultimo dia deixa de ser um buraco: vira a afirmacao oposta e
    // igualmente verdadeira — a semana mostra os SEUS sete dias, e nao o de
    // depois.
    const semanaAtual = getWeekDays(new Date()).map(toISODate)
    const amanhaISO = toISODate(addDays(new Date(), 1))
    if (semanaAtual.includes(amanhaISO)) {
      expect(semana, 'amanhã cai nesta semana, então tem de aparecer').toMatch(/Compromisso de amanha/)
    } else {
      expect(semana, 'amanhã cai na semana seguinte: NÃO pode vazar para esta').not.toMatch(/Compromisso de amanha/)
    }

    // No Mês em 390px a célula mostra PONTOS, não títulos — cabe o mês inteiro
    // na tela, e o conteúdo do dia se lê tocando nele. Então a verificação aqui
    // é pelo painel do dia, que é também como se usa de verdade.
    await ir('/dia?visao=mes')
    const hojeISO = new Date().toISOString().slice(0, 10)
    await page.locator(`[data-testid="mes-dia-${hojeISO}"]`).click()
    await page.waitForTimeout(900)
    const painel = await page.getByRole('dialog').innerText()
    expect(painel).toMatch(/Reuniao com Joao/)
    expect(painel).toMatch(/Enviar o relatorio/)
    // e o painel também separa as duas naturezas
    expect(painel).toMatch(/compromissos/i)
    expect(painel).toMatch(/tarefas do dia/i)
  }, 90_000)

  it('navegação temporal anda e volta sem perder o eixo', async () => {
    await ir('/dia', '[data-testid="dia-timeline"]')
    const hoje = await page.locator('main h1').first().innerText()
    expect(hoje).toMatch(/Hoje/i)
    await page.getByRole('button', { name: /Próximo dia/i }).click()
    await page.waitForTimeout(900)
    expect(await page.locator('main h1').first().innerText()).not.toMatch(/^Hoje$/i)
    await page.getByRole('button', { name: /^Hoje$/ }).click()
    await page.waitForTimeout(900)
    expect(await page.locator('main h1').first().innerText()).toMatch(/Hoje/i)
  }, 60_000)

  it('nenhuma das três visões causa scroll horizontal no body', async () => {
    for (const url of ['/dia', '/dia?visao=semana', '/dia?visao=mes']) {
      await ir(url)
      const x = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth + 1)
      expect(x, `${url} não pode empurrar o body`).toBe(false)
    }
  }, 90_000)
})
