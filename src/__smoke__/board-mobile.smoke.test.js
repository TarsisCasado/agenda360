/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DO QUADRO NO TOQUE (CP5.4) — iPhone de verdade, build de verdade.
//
// O quadro mobile nao e o desktop estreito: e um PAGER de uma coluna em foco.
// Isso troca as garantias que importam. No desktop a pergunta era "o arrasto
// grava?"; aqui e:
//   - so a AREA DO QUADRO anda na horizontal, e o body nunca;
//   - deslizar e tocar na etapa levam ao mesmo lugar;
//   - mover funciona SEM arrastar (no Safari do iOS, HTML5 drag nao existe);
//   - os alvos de toque tem 44px.
//
// Roda num contexto com `hasTouch` e viewport de iPhone 13, nao num desktop
// redimensionado: `hasTouch` muda o que o navegador entrega ao produto.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

const ETAPAS = ['Sem data', 'A fazer', 'Em andamento', 'Concluído']

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
    { ...base, id: 'm-sem-data', title: 'M sem data', status: 'todo', date: null },
    { ...base, id: 'm-sem-data-2', title: 'M sem data dois', status: 'todo', date: null },
    { ...base, id: 'm-a-fazer', title: 'M a fazer', status: 'todo', date: iso(2) },
    { ...base, id: 'm-andamento', title: 'M em andamento', status: 'in_progress', date: iso(0) },
    { ...base, id: 'm-concluida', title: 'M concluida', status: 'done', date: iso(-1) },
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
    await page.fill('input[type="email"]', 'mob@agenda360.test')
    await page.fill('input[type="password"]', 'mob12345')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
}

async function irParaOQuadro() {
  await page.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="board-pager"]', { timeout: 15000 })
  await page.waitForTimeout(600)
}

const tabs = () => page.locator('[data-testid="board-stages"] [role="tab"]')

// Qual etapa a barra diz estar ativa.
async function etapaAtiva() {
  return page.evaluate(() => {
    const t = document.querySelector('[data-testid="board-stages"] [role="tab"][aria-selected="true"]')
    return t ? t.textContent.replace(/\d+$/, '').trim() : null
  })
}

async function colunaDe(taskId) {
  return page.evaluate((id) => {
    const card = document.querySelector(`[data-task-id="${id}"]`)
    if (!card) return null
    const col = card.closest('[data-testid^="board-column-"]')
    return col ? col.dataset.testid.replace('board-column-', '') : null
  }, taskId)
}

// Mover pelo caminho do toque: `•••` abre a folha, o destino move. Dois toques.
async function moverPelaFolha(taskId, destino) {
  await page.locator(`[data-task-id="${taskId}"]`).getByRole('button', { name: /^Mover/ }).click()
  await page.waitForTimeout(500)
  await page.getByRole('dialog').getByRole('button', { name: destino, exact: true }).click()
  await page.waitForTimeout(800)
}

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
  await irParaOQuadro()
})

describe('quadro no toque — o pager', () => {
  it('as quatro etapas existem e são tocáveis', async () => {
    expect(await tabs().count()).toBe(4)
    for (let i = 0; i < 4; i += 1) {
      expect((await tabs().nth(i).innerText()).replace(/\s+/g, ' ')).toContain(ETAPAS[i])
    }
  }, 40_000)

  it('SOMENTE a área do quadro anda na horizontal — o body nunca', async () => {
    const m = await page.evaluate(() => {
      const pager = document.querySelector('[data-testid="board-pager"]')
      return {
        pagerRola: pager.scrollWidth > pager.clientWidth + 1,
        body: document.body.scrollWidth > document.body.clientWidth + 1,
        doc: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      }
    })
    expect(m.pagerRola, 'o pager precisa ter para onde rolar').toBe(true)
    expect(m.body, 'o body não pode ter scroll horizontal').toBe(false)
    expect(m.doc, 'o documento não pode ter scroll horizontal').toBe(false)
  }, 40_000)

  it('uma coluna por vez ocupa 85–92% da largura útil, com fresta do vizinho', async () => {
    const pct = await page.evaluate(() => {
      const pager = document.querySelector('[data-testid="board-pager"]')
      const col = pager.querySelector('[data-testid="board-column-sem_data"]').parentElement
      const cs = getComputedStyle(pager)
      const util = pager.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      return Math.round((col.getBoundingClientRect().width / util) * 100)
    })
    expect(pct).toBeGreaterThanOrEqual(85)
    expect(pct).toBeLessThanOrEqual(92)
  }, 40_000)

  it('deslizar troca a etapa em foco', async () => {
    expect(await etapaAtiva()).toBe('Sem data')
    // O deslize produz scroll no pager; é isso que o produto observa. A inércia
    // e o encaixe são do navegador — o que este teste trava é o vínculo entre
    // a posição do quadro e a etapa acesa na barra.
    const caixa = await page.locator('[data-testid="board-pager"]').boundingBox()
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await page.mouse.wheel(caixa.width, 0)
    await page.waitForTimeout(900)
    expect(await etapaAtiva()).toBe('A fazer')
  }, 40_000)

  it('tocar na etapa leva à coluna — deslizar não é a única forma', async () => {
    await tabs().nth(2).click()
    await page.waitForTimeout(900)
    expect(await etapaAtiva()).toBe('Em andamento')
    const visivel = await page.evaluate(() => {
      const pager = document.querySelector('[data-testid="board-pager"]')
      const col = pager.querySelector('[data-testid="board-column-em_andamento"]')
      const a = pager.getBoundingClientRect()
      const b = col.getBoundingClientRect()
      return b.left >= a.left - 8 && b.right <= a.right + 8
    })
    expect(visivel, 'a coluna tocada precisa estar inteira na viewport').toBe(true)
  }, 40_000)

  it('todo alvo de toque do quadro tem pelo menos 44px', async () => {
    const pequenos = await page.evaluate(() => {
      const raiz = document.querySelector('[data-testid="board-pager"]').parentElement
      return [...raiz.querySelectorAll('button')]
        .filter((b) => b.offsetParent !== null)
        .map((b) => ({ t: (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 40), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
        .filter((b) => b.h < 44 || b.w < 44)
    })
    expect(pequenos, `alvos abaixo de 44px: ${JSON.stringify(pequenos)}`).toEqual([])
  }, 40_000)
})

describe('quadro no toque — mover sem arrastar', () => {
  it('a folha "Mover para" move de verdade e persiste', async () => {
    await moverPelaFolha('m-a-fazer', 'Em andamento')
    expect(await colunaDe('m-a-fazer')).toBe('em_andamento')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="board-pager"]', { timeout: 15000 })
    await page.waitForTimeout(600)
    expect(await colunaDe('m-a-fazer')).toBe('em_andamento')
  }, 60_000)

  it('mover atualiza as contagens das duas etapas', async () => {
    const ler = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="board-stages"] [role="tab"]')].map((t) =>
          Number(t.textContent.match(/(\d+)\s*$/)?.[1]),
        ),
      )
    const antes = await ler()
    await moverPelaFolha('m-andamento', 'Concluído')
    const depois = await ler()
    expect(depois[2]).toBe(antes[2] - 1)
    expect(depois[3]).toBe(antes[3] + 1)
  }, 60_000)

  it('Sem data -> A fazer PERGUNTA a data, e cancelar não move', async () => {
    await page.locator('[data-task-id="m-sem-data"]').getByRole('button', { name: /^Mover/ }).click()
    await page.waitForTimeout(500)
    await page.getByRole('dialog').getByRole('button', { name: 'A fazer', exact: true }).click()
    await page.waitForTimeout(700)

    expect(await page.getByRole('dialog').innerText()).toMatch(/Para quando/i)
    expect(await colunaDe('m-sem-data')).toBe('sem_data')

    await page.getByRole('button', { name: /^Cancelar$/ }).click()
    await page.waitForTimeout(600)
    expect(await colunaDe('m-sem-data'), 'cancelar não pode mover nada').toBe('sem_data')

    // E confirmando, move.
    await page.locator('[data-task-id="m-sem-data"]').getByRole('button', { name: /^Mover/ }).click()
    await page.waitForTimeout(500)
    await page.getByRole('dialog').getByRole('button', { name: 'A fazer', exact: true }).click()
    await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Hoje', exact: true }).click()
    await page.getByRole('button', { name: /Mover para A fazer/i }).click()
    await page.waitForTimeout(900)
    expect(await colunaDe('m-sem-data')).toBe('a_fazer')
  }, 60_000)

  it('erro de gravação faz ROLLBACK também no toque', async () => {
    await page.evaluate(() => {
      const real = Storage.prototype.setItem
      Storage.prototype.setItem = function (k, v) {
        if (k === 'agenda360.db.v2') throw new Error('falha simulada de gravação')
        return real.call(this, k, v)
      }
    })
    await moverPelaFolha('m-a-fazer', 'Concluído')
    await page.waitForTimeout(700)
    expect(await colunaDe('m-a-fazer')).toBe('a_fazer')
    expect(await page.locator('body').innerText()).toMatch(/Não foi possível mover/i)
  }, 60_000)
})

describe('quadro no toque — o resto da tela continua de pé', () => {
  it('a barra inferior continua fixa e funcional durante o pager', async () => {
    await tabs().nth(3).click()
    await page.waitForTimeout(900)
    const nav = await page.evaluate(() => {
      // `document.querySelector('nav')` casa PRIMEIRO com a barra lateral, que
      // tambem e um <nav>: e preciso pegar a que esta encostada no rodape.
      const n = [...document.querySelectorAll('nav')].find(
        (x) => getComputedStyle(x).position === 'fixed' && x.getBoundingClientRect().bottom >= window.innerHeight - 2,
      )
      if (!n) return null
      const r = n.getBoundingClientRect()
      return { fixa: true, dentro: r.bottom <= window.innerHeight + 1, alvos: [...n.querySelectorAll('a,button')].every((b) => b.getBoundingClientRect().height >= 44) }
    })
    expect(nav?.fixa, 'a barra inferior precisa continuar fixa no rodapé').toBe(true)
    expect(nav?.dentro).toBe(true)
    expect(nav?.alvos, 'os destinos da barra inferior precisam manter 44px').toBe(true)

    // Pelo mesmo motivo, o link tem de vir da barra INFERIOR: "Hoje" tambem
    // existe na barra lateral, que segue no DOM mesmo escondida.
    await page.locator('nav.fixed').getByRole('link', { name: /^Hoje$/i }).click()
    await page.waitForTimeout(1200)
    expect(await page.locator('body').innerText()).toMatch(/Bom dia|Boa tarde|Boa noite/i)
  }, 60_000)

  it('criar em "A fazer" pergunta a data em vez de assumir hoje', async () => {
    await tabs().nth(1).click()
    await page.waitForTimeout(800)
    await page
      .locator('[data-testid="board-column-a_fazer"]')
      .getByRole('button', { name: /Adicionar/ })
      .click()
    await page.waitForTimeout(400)
    await page.locator('[data-testid="board-column-a_fazer"] textarea').fill('Tarefa criada pelo QA')
    await page.locator('[data-testid="board-column-a_fazer"]').getByRole('button', { name: 'Adicionar', exact: true }).click()
    await page.waitForTimeout(700)
    expect(await page.getByRole('dialog').innerText()).toMatch(/Para quando/i)
  }, 60_000)
})
