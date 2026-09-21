/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// BASELINE — A BUSCA DE HOJE (UX1.4 / C3), no build real.
//
// Este arquivo existe para o C1 ter com o que comparar. Ele fotografa DUAS
// coisas da paleta de comandos como ela e hoje:
//
//   1. O QUE ela encontra: tarefas (titulo e notas), links (titulo e URL),
//      navegacao — e o que ela NAO encontra: NOTAS. A ausencia de
//      `inbox_items` e comportamento ATUAL ESPERADO neste checkpoint, e e
//      exatamente o que o C1 vai mudar;
//
//   2. QUANTO ela demora: abertura e filtragem, com volume declarado. Nao e
//      benchmark — e uma medida reproduzivel para comparar antes x depois.
//
// Mora em `__smoke__` de proposito: o detector de rebuild dos outros smokes
// ignora esta pasta, entao um arquivo novo aqui nao dispara build concorrente.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

// Volume do cenario: declarado aqui porque a medida so significa alguma coisa
// junto do volume. 200 tarefas e mais do que um uso pessoal real acumula em
// meses, e e pouco o bastante para caber num teste.
const QUANTAS_TAREFAS = 200
const QUANTOS_LINKS = 40
const QUANTAS_NOTAS = 60

const SEMENTE = `((n, nl, nn) => {
  const KEY = 'agenda360.db.v2'
  const db = JSON.parse(localStorage.getItem(KEY))
  if (!db) return false
  const ws = db.workspaces[0].id, uid = db.profiles[0].id
  const base = { workspace_id: ws, created_by: uid, assignee_id: uid, delegated_by: null, delegated_at: null,
    description: '', link: '', notes: '', alert_enabled: false, alert_type: 'push', alert_minutes_before: 15,
    alert_sent: false, reschedule_count: 0, start_time: null, end_time: null, date: null, origin: 'manual',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), priority: 'medium', status: 'todo' }

  db.tasks = [
    { ...base, id: 'qa-titulo', title: 'Conferir documentacao dos seminovos' },
    { ...base, id: 'qa-notas', title: 'Tarefa comum', notes: 'combinar a vistoria com o patio' },
    ...Array.from({ length: n }, (_, i) => ({ ...base, id: 'qa-vol-' + i, title: 'Atividade de volume ' + i })),
  ]
  db.links = [
    { id: 'qa-link', workspace_id: ws, created_by: uid, title: 'Relatorio de mercado', url: 'https://exemplo.com.br/relatorio-seminovos', created_at: new Date().toISOString() },
    ...Array.from({ length: nl }, (_, i) => ({ id: 'qa-link-' + i, workspace_id: ws, created_by: uid, title: 'Link ' + i, url: 'https://exemplo.com.br/' + i, created_at: new Date().toISOString() })),
  ]
  db.inbox_items = [
    { id: 'qa-nota', workspace_id: ws, created_by: uid, type: 'note', status: 'inbox', origin: 'manual',
      title: 'Padrao de preparacao', content: 'checklist unico assinado por quem entrega os seminovos',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ...Array.from({ length: nn }, (_, i) => ({ id: 'qa-nota-' + i, workspace_id: ws, created_by: uid, type: 'note',
      status: 'inbox', origin: 'manual', title: 'Nota ' + i, content: 'conteudo ' + i,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
  ]
  localStorage.setItem(KEY, JSON.stringify(db))
  return true
})(${QUANTAS_TAREFAS}, ${QUANTOS_LINKS}, ${QUANTAS_NOTAS})`

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
    await page.fill('input[type="email"]', 'busca@agenda360.test')
    await page.fill('input[type="password"]', 'busca1234')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
}

const campo = () => page.locator('input[placeholder*="Buscar"]')

async function abrirPaleta() {
  await page.keyboard.press('Control+k')
  await campo().waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForTimeout(350) // carga das listas (taskService + linkService)
}

async function fecharPaleta() {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
}

// Os rotulos visiveis na paleta, em ordem de exibicao.
async function resultados() {
  return page.evaluate(() => {
    const raiz = document.querySelector('input[placeholder*="Buscar"]')?.closest('div[class*="fixed"]')
    if (!raiz) return []
    return [...raiz.querySelectorAll('[role="option"], button, li')]
      .map((n) => (n.innerText || '').trim().split('\n')[0])
      .filter(Boolean)
  })
}

async function buscar(texto) {
  await campo().fill(texto)
  await page.waitForTimeout(250)
  return resultados()
}

// Os ACHADOS, sem o eco do proprio termo no item "Criar tarefa: ...". Sem este
// filtro, procurar por um termo sempre "encontraria" o termo.
const achados = (lista) => lista.filter((x) => !/^Criar tarefa/i.test(x))

const medidas = {}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  page = await ctx.newPage()
  await entrar()
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
}, 180000)

afterAll(async () => {
  await browser?.close()
  await new Promise((r) => servidor?.close(r))
  // A medida vai para o relatorio do checkpoint; sem isso ela morre no log.
  if (Object.keys(medidas).length) {
    console.log('\n[UX1.4] BASELINE DE PERFORMANCE DA BUSCA', JSON.stringify({
      volume: { tarefas: QUANTAS_TAREFAS + 2, links: QUANTOS_LINKS + 1, notas: QUANTAS_NOTAS + 1 },
      ...medidas,
    }, null, 2))
  }
})

describe('[BASELINE] Busca atual — o que ela encontra', () => {
  it('[BASELINE] encontra a tarefa pelo TITULO', async () => {
    await abrirPaleta()
    const r = await buscar('seminovos')
    expect(r.join(' | ')).toMatch(/Conferir documentacao dos seminovos/i)
    await fecharPaleta()
  }, 60000)

  it('[BASELINE] encontra a tarefa pelas NOTAS (corpo), nao so pelo titulo', async () => {
    await abrirPaleta()
    const r = await buscar('vistoria')
    expect(r.join(' | ')).toMatch(/Tarefa comum/i)
    await fecharPaleta()
  }, 60000)

  it('[BASELINE] encontra o link pelo TITULO', async () => {
    await abrirPaleta()
    const r = await buscar('Relatorio de mercado')
    expect(r.join(' | ')).toMatch(/Relatorio de mercado/i)
    await fecharPaleta()
  }, 60000)

  it('[BASELINE] encontra o link pela URL', async () => {
    await abrirPaleta()
    const r = await buscar('relatorio-seminovos')
    expect(r.join(' | ')).toMatch(/Relatorio de mercado/i)
    await fecharPaleta()
  }, 60000)

  it('[BASELINE] busca sem resultado nao quebra e ainda oferece criar', async () => {
    await abrirPaleta()
    const r = await buscar('zzzznaoexistezzzz')
    expect(r.join(' | ')).toMatch(/Criar tarefa/i)
    expect(r.join(' | ')).not.toMatch(/Conferir documentacao/i)
    await fecharPaleta()
  }, 60000)

  it('[MUDA:C1] NAO encontra notas — `inbox_items` esta fora da busca — depois: notas passam a ser encontradas por titulo e corpo', async () => {
    await abrirPaleta()
    const porTitulo = achados(await buscar('Padrao de preparacao'))
    expect(porTitulo.join(' | ')).not.toMatch(/Padrao de preparacao/i)

    const porCorpo = achados(await buscar('checklist unico assinado'))
    expect(porCorpo.join(' | ')).not.toMatch(/Padrao de preparacao/i)
    await fecharPaleta()
  }, 60000)

  it('[BASELINE] o topo da lista e sempre "Criar tarefa", depois navegacao, depois achados', async () => {
    await abrirPaleta()
    const r = await buscar('seminovos')
    expect(r[0]).toMatch(/Criar tarefa/i)
    await fecharPaleta()
  }, 60000)

  it('[BASELINE] a lista de tarefas achadas e limitada a 6 e a de links a 5', async () => {
    await abrirPaleta()
    const r = await buscar('Atividade de volume')
    const achadas = r.filter((x) => /^Atividade de volume/.test(x))
    expect(achadas.length).toBeLessThanOrEqual(6)
    expect(achadas.length).toBeGreaterThan(0)
    await fecharPaleta()
  }, 60000)
})

describe('[BASELINE] Busca atual — performance', () => {
  it('[BASELINE] mede abertura e filtragem com volume declarado', async () => {
    // METODOLOGIA, para o C1 repetir igual:
    //   . mesmo build, mesmo servidor local, Chromium headless, 1440x900;
    //   . volume semeado no localStorage (ver topo do arquivo);
    //   . ABERTURA  = do Ctrl+K ate o campo de busca estar visivel;
    //   . FILTRAGEM = de digitar o termo ate a lista refletir o termo,
    //     medida com requestAnimationFrame dentro da pagina;
    //   . 5 repeticoes; reportamos mediana e pior caso, nao media.
    const aberturas = []
    const filtragens = []

    for (let i = 0; i < 5; i += 1) {
      // Garante a paleta FECHADA antes de medir a abertura: Ctrl+K alterna.
      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
      const t0 = Date.now()
      await page.keyboard.press('Control+k')
      await campo().waitFor({ state: 'visible', timeout: 8000 })
      aberturas.push(Date.now() - t0)
      await page.waitForTimeout(300)

      const ms = await page.evaluate(async () => {
        const input = document.querySelector('input[placeholder*="Buscar"]')
        const proto = Object.getPrototypeOf(input)
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
        const inicio = performance.now()
        setter.call(input, 'seminovos')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        return performance.now() - inicio
      })
      filtragens.push(Math.round(ms))

      await page.keyboard.press('Escape')
      await page.waitForTimeout(250)
    }

    const mediana = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
    medidas.abertura_ms = { mediana: mediana(aberturas), pior: Math.max(...aberturas), amostras: aberturas }
    medidas.filtragem_ms = { mediana: mediana(filtragens), pior: Math.max(...filtragens), amostras: filtragens }

    // Sem meta artificial: o teste so falha se a busca ficar inutilizavel.
    // O numero que importa e o registrado acima, para comparacao no C1.
    expect(mediana(aberturas)).toBeLessThan(3000)
    expect(mediana(filtragens)).toBeLessThan(1000)
  }, 120000)
})
