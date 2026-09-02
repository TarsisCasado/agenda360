/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DO QUADRO DE FLUXO (CP5.3) — comportamento REAL, no build real.
//
// board.test.js prova as REGRAS: em que coluna cada status cai, o que um
// movimento significa, que nada some. Isso e necessario e nao e suficiente —
// a regra pode estar certa e o quadro continuar quebrado, porque o que o
// usuario faz e ARRASTAR, e arrastar passa por dataTransfer, por estado
// otimista, por gravacao e por rollback. Nenhuma dessas quatro coisas aparece
// num teste de funcao pura.
//
// Foi exatamente esse buraco que deixou o CP5.1.1 chegar ao Preview quebrado
// com 621 testes verdes. Aqui o navegador arrasta de verdade e a asserção e
// sobre a tela depois de RECARREGAR — se so o estado local mudou e nada foi
// gravado, o teste cai.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

// Carga determinística: uma tarefa por situação que o quadro precisa tratar.
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
    { ...base, id: 'qa-sem-data', title: 'QA sem data', status: 'todo', date: null },
    { ...base, id: 'qa-a-fazer', title: 'QA a fazer', status: 'todo', date: iso(2) },
    { ...base, id: 'qa-andamento', title: 'QA em andamento', status: 'in_progress', date: iso(0) },
    { ...base, id: 'qa-concluida', title: 'QA concluida', status: 'done', date: iso(-1) },
    { ...base, id: 'qa-furada', title: 'QA furada', status: 'missed', date: iso(-3) },
    ...Array.from({ length: 24 }, (_, i) => ({ ...base, id: 'qa-lote-' + i, title: 'QA lote ' + i, status: 'todo', date: iso(3) })),
  ]
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
    await page.fill('input[type="email"]', 'board@agenda360.test')
    await page.fill('input[type="password"]', 'board1234')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
}

async function irParaOQuadro() {
  // Navega ANTES de semear: a navegacao devolve um contexto de JS limpo, o que
  // desfaz qualquer monkey-patch deixado por um teste anterior (o de rollback
  // quebra o localStorage de proposito).
  await page.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="board-column-a_fazer"]', { timeout: 15000 })
  await page.waitForTimeout(500)
}

// Colunas de uma tarefa, lidas da TELA (não do estado interno).
async function colunaDe(taskId) {
  return page.evaluate((id) => {
    const card = document.querySelector(`[data-task-id="${id}"]`)
    if (!card) return null
    const col = card.closest('[data-testid^="board-column-"]')
    return col ? col.dataset.testid.replace('board-column-', '') : null
  }, taskId)
}

// Arrasto HTML5 real: o Playwright não sintetiza dragstart/drop nativos de
// forma confiável, então disparamos os mesmos eventos que o navegador dispara,
// com um DataTransfer de verdade compartilhado entre eles.
async function arrastar(taskId, colunaDestino) {
  await page.evaluate(
    ({ id, destino }) => {
      const card = document.querySelector(`[data-task-id="${id}"]`)
      const alvo = document.querySelector(`[data-testid="board-column-${destino}"]`)
      const dt = new DataTransfer()
      card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      alvo.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }))
      alvo.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
      card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }))
    },
    { id: taskId, destino: colunaDestino },
  )
  await page.waitForTimeout(700)
}

async function moverPeloMenu(taskId, rotulo) {
  const card = page.locator(`[data-task-id="${taskId}"]`)
  await card.getByRole('button', { name: /^Mover/ }).click()
  await page.getByRole('menuitem', { name: rotulo, exact: true }).click()
  await page.waitForTimeout(700)
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  page = await ctx.newPage()
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort())
  await entrar()
}, 240_000)

afterAll(async () => {
  await browser?.close().catch(() => {})
  servidor?.close()
})

beforeEach(async () => {
  await irParaOQuadro()
})

describe('quadro de fluxo — as quatro colunas na tela', () => {
  it('as quatro colunas existem e cada tarefa está na sua', async () => {
    for (const k of ['sem_data', 'a_fazer', 'em_andamento', 'concluido']) {
      expect(await page.locator(`[data-testid="board-column-${k}"]`).count(), k).toBe(1)
    }
    expect(await colunaDe('qa-sem-data')).toBe('sem_data')
    expect(await colunaDe('qa-a-fazer')).toBe('a_fazer')
    expect(await colunaDe('qa-andamento')).toBe('em_andamento')
    expect(await colunaDe('qa-concluida')).toBe('concluido')
  }, 40_000)

  it('nenhuma tarefa aparece duas vezes no quadro', async () => {
    const dup = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[data-testid="board-card"]')].map((n) => n.dataset.taskId)
      return ids.length - new Set(ids).size
    })
    expect(dup).toBe(0)
  }, 40_000)

  it('arquivada não vira coluna, mas continua alcançável', async () => {
    expect(await colunaDe('qa-furada')).toBeNull()
    await page.getByRole('button', { name: /Arquivadas/ }).click()
    await page.waitForTimeout(400)
    expect(await page.locator('[data-task-id="qa-furada"]').count()).toBe(1)
  }, 40_000)

  it('a coluna cheia rola sozinha, sem empurrar as outras nem a página', async () => {
    const m = await page.evaluate(() => {
      const col = document.querySelector('[data-testid="board-column-a_fazer"]')
      const lista = col.querySelector('.overflow-y-auto')
      return {
        rola: lista.scrollHeight > lista.clientHeight + 4,
        alturas: [...document.querySelectorAll('[data-testid^="board-column-"]')].map((c) => Math.round(c.getBoundingClientRect().height)),
        scrollLateral: document.body.scrollWidth > document.body.clientWidth,
      }
    })
    expect(m.rola, 'a coluna com 25 cartões precisa rolar internamente').toBe(true)
    expect(new Set(m.alturas).size, `colunas com alturas diferentes: ${m.alturas}`).toBe(1)
    expect(m.scrollLateral).toBe(false)
  }, 40_000)
})

describe('quadro de fluxo — movimentação', () => {
  it('arrastar A fazer -> Em andamento muda de coluna E persiste', async () => {
    await arrastar('qa-a-fazer', 'em_andamento')
    expect(await colunaDe('qa-a-fazer')).toBe('em_andamento')
    // O que importa: sobreviver ao reload. Estado otimista sozinho passaria
    // na linha de cima e mentiria.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="board-column-a_fazer"]', { timeout: 15000 })
    await page.waitForTimeout(600)
    expect(await colunaDe('qa-a-fazer')).toBe('em_andamento')
  }, 60_000)

  it('arrastar Em andamento -> Concluído persiste', async () => {
    await arrastar('qa-andamento', 'concluido')
    expect(await colunaDe('qa-andamento')).toBe('concluido')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="board-column-a_fazer"]', { timeout: 15000 })
    await page.waitForTimeout(600)
    expect(await colunaDe('qa-andamento')).toBe('concluido')
  }, 60_000)

  it('reabrir uma concluída com data volta para A fazer', async () => {
    await arrastar('qa-concluida', 'a_fazer')
    expect(await colunaDe('qa-concluida')).toBe('a_fazer')
  }, 60_000)

  it('Sem data -> A fazer PERGUNTA a data em vez de inventar uma', async () => {
    await arrastar('qa-sem-data', 'a_fazer')
    // Nada se moveu ainda: o diálogo é a condição do movimento.
    expect(await page.getByRole('dialog').innerText()).toMatch(/Para quando/i)
    expect(await colunaDe('qa-sem-data')).toBe('sem_data')

    await page.getByRole('button', { name: 'Hoje', exact: true }).click()
    await page.getByRole('button', { name: /Mover para A fazer/i }).click()
    await page.waitForTimeout(800)
    expect(await colunaDe('qa-sem-data')).toBe('a_fazer')
  }, 60_000)

  it('cancelar o diálogo de data deixa a tarefa exatamente onde estava', async () => {
    await arrastar('qa-sem-data', 'a_fazer')
    await page.getByRole('button', { name: /^Cancelar$/ }).click()
    await page.waitForTimeout(500)
    expect(await colunaDe('qa-sem-data')).toBe('sem_data')
  }, 60_000)

  it('o menu "Mover para" faz o mesmo que o arrasto (via teclado/leitor)', async () => {
    await moverPeloMenu('qa-a-fazer', 'Em andamento')
    expect(await colunaDe('qa-a-fazer')).toBe('em_andamento')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="board-column-a_fazer"]', { timeout: 15000 })
    await page.waitForTimeout(600)
    expect(await colunaDe('qa-a-fazer')).toBe('em_andamento')
  }, 60_000)

  it('erro de gravação faz ROLLBACK: a tela não pode mentir', async () => {
    // Quebra a persistência por dentro, como uma falha de rede/banco faria.
    await page.evaluate(() => {
      const real = Storage.prototype.setItem
      Storage.prototype.setItem = function (k, v) {
        if (k === 'agenda360.db.v2') throw new Error('falha simulada de gravação')
        return real.call(this, k, v)
      }
    })
    await arrastar('qa-a-fazer', 'concluido')
    await page.waitForTimeout(900)
    expect(await colunaDe('qa-a-fazer'), 'o cartão tinha de voltar para A fazer').toBe('a_fazer')
    expect(await page.locator('body').innerText()).toMatch(/Não foi possível mover/i)
  }, 60_000)
})

describe('quadro de fluxo — filtro é leitura, não domínio', () => {
  it('filtrar esconde cartões e limpar o filtro devolve todos', async () => {
    const total = await page.locator('[data-testid="board-card"]').count()
    await page.getByRole('button', { name: 'Prioridade alta', exact: true }).click()
    await page.waitForTimeout(400)
    const filtrado = await page.locator('[data-testid="board-card"]').count()
    expect(filtrado).toBeLessThan(total)

    await page.getByRole('button', { name: 'Todas', exact: true }).click()
    await page.waitForTimeout(400)
    expect(await page.locator('[data-testid="board-card"]').count()).toBe(total)

    // E o mais importante: nenhuma tarefa mudou de status por causa do filtro.
    const status = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('agenda360.db.v2')).tasks
        .filter((t) => t.id.startsWith('qa-'))
        .map((t) => `${t.id}:${t.status}`)
        .sort(),
    )
    expect(status).toEqual([
      'qa-a-fazer:todo',
      'qa-andamento:in_progress',
      'qa-concluida:done',
      'qa-furada:missed',
      'qa-sem-data:todo',
      ...Array.from({ length: 24 }, (_, i) => `qa-lote-${i}:todo`),
    ].sort())
  }, 60_000)
})
