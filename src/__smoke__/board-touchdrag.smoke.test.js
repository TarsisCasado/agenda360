/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DO ARRASTO NO TOQUE (CP5.4.1) — toques REAIS, com tempo real.
//
// Este gesto e todo temporizado: 380ms parado ativa, 10px de movimento antes
// disso cancela. Nada disso aparece se o teste "clicar"; e preciso emitir
// touchStart / touchMove / touchEnd de verdade e ESPERAR entre eles. Por isso
// aqui se usa CDP (`Input.dispatchTouchEvent`) em vez dos atalhos do Playwright.
//
// O criterio que o product owner colocou como o mais importante nao e "o
// arrasto funciona", e "adicionar o arrasto nao estragou os outros quatro
// gestos". Por isso metade destes testes prova que o arrasto NAO acontece.
// ---------------------------------------------------------------------------
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

const SEGURAR = 380

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
    { ...base, id: 'd-sem-data', title: 'D sem data', status: 'todo', date: null },
    { ...base, id: 'd-sem-data-2', title: 'D sem data dois', status: 'todo', date: null },
    ...Array.from({ length: 8 }, (_, i) => ({ ...base, id: 'd-lote-' + i, title: 'D lote ' + i, status: 'todo', date: null })),
    { ...base, id: 'd-a-fazer', title: 'D a fazer', status: 'todo', date: iso(2) },
    { ...base, id: 'd-andamento', title: 'D em andamento', status: 'in_progress', date: iso(0) },
  ]
  localStorage.setItem(KEY, JSON.stringify(db))
  return true
})()`

let servidor
let porta
let browser
let ctx
let page
let cdp

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
    await page.fill('input[type="email"]', 'drag@agenda360.test')
    await page.fill('input[type="password"]', 'drag1234')
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

// -- toque bruto -------------------------------------------------------------
const toque = (type, pontos) =>
  cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pontos.map((p, i) => ({ x: p.x, y: p.y, id: i, radiusX: 12, radiusY: 12, force: 1 })),
  })

// No pager so a etapa EM FOCO esta sob o dedo: as vizinhas ficam na fresta ou
// fora da viewport. Tocar num cartao delas sem focar antes e tocar no vazio —
// foi o que derrubou a primeira versao destes testes.
async function focarEtapa(i) {
  await page.locator('[data-testid="board-stages"] [role="tab"]').nth(i).click()
  await page.waitForTimeout(900)
}

async function centroDe(sel) {
  const b = await page.locator(sel).first().boundingBox()
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
}

async function bordaDireitaDoPager() {
  const b = await page.locator('[data-testid="board-pager"]').boundingBox()
  return Math.round(b.x + b.width - 20)
}

// Gesto completo, com o tempo real de espera entre os passos.
async function gesto({ de, para = [], segurar = SEGURAR + 140, soltar = true, cancelar = false, passos = 6 }) {
  await toque('touchStart', [de])
  if (segurar) await page.waitForTimeout(segurar)
  let atual = de
  for (const destino of para) {
    for (let i = 1; i <= passos; i += 1) {
      const p = {
        x: Math.round(atual.x + ((destino.x - atual.x) * i) / passos),
        y: Math.round(atual.y + ((destino.y - atual.y) * i) / passos),
      }
      await toque('touchMove', [p])
      await page.waitForTimeout(28)
    }
    atual = destino
  }
  if (cancelar) await toque('touchCancel', [])
  else if (soltar) await toque('touchEnd', [])
  await page.waitForTimeout(700)
  return atual
}

async function colunaDe(taskId) {
  return page.evaluate((id) => {
    const card = document.querySelector(`[data-task-id="${id}"]`)
    if (!card) return null
    const col = card.closest('[data-testid^="board-column-"]')
    return col ? col.dataset.testid.replace('board-column-', '') : null
  }, taskId)
}

const contagens = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="board-stages"] [role="tab"]')].map((t) =>
      Number(t.textContent.match(/(\d+)\s*$/)?.[1]),
    ),
  )

const etapaAtiva = () =>
  page.evaluate(() => {
    const t = document.querySelector('[data-testid="board-stages"] [role="tab"][aria-selected="true"]')
    return t ? t.textContent.replace(/\d+$/, '').trim() : null
  })

const temFantasma = () => page.locator('.board-ghost').count()

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  ctx = await browser.newContext({ ...devices['iPhone 13'] })
  page = await ctx.newPage()
  cdp = await ctx.newCDPSession(page)
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

// ---------------------------------------------------------------------------
// O QUE NAO PODE ATIVAR — o critério que o product owner chamou de prioridade
// máxima. Estes vêm primeiro de propósito.
// ---------------------------------------------------------------------------
describe('arrasto no toque — os outros quatro gestos continuam intactos', () => {
  it('toque curto NÃO ativa o arrasto e continua abrindo a tarefa', async () => {
    const p = await centroDe('[data-task-id="d-sem-data"]')
    await toque('touchStart', [p])
    await page.waitForTimeout(90)
    await toque('touchEnd', [])
    expect(await temFantasma(), 'um toque curto não pode pegar o cartão').toBe(0)

    // O proprio touchEnd sem movimento sintetiza o clique: se o gesto novo
    // tivesse engolido o toque, nenhum dialogo abriria aqui.
    await page.waitForTimeout(900)
    const dialogo = await page.getByRole('dialog').innerText()
    expect(dialogo, 'o toque tem de abrir a tarefa, não a folha de mover').toMatch(/Editar atividade/i)
    // O titulo mora no VALOR do campo, nao no texto do dialogo. Alvo pelo
    // rotulo acessivel, nao por "o primeiro input": no CP5.9 o titulo virou um
    // campo que cresce com o texto (um <input> de uma linha cortava titulos
    // comuns a 390px), e "o primeiro input" passou a ser a data.
    expect(
      await page.getByRole('dialog').locator('[aria-label="Título da atividade"]').inputValue(),
    ).toBe('D sem data')
  }, 60_000)

  it('mover o dedo ANTES do limiar não ativa — é assim que o deslize sobrevive', async () => {
    const p = await centroDe('[data-task-id="d-sem-data"]')
    await toque('touchStart', [p])
    await page.waitForTimeout(120) // bem antes dos 380ms
    for (let i = 1; i <= 5; i += 1) {
      await toque('touchMove', [{ x: p.x - i * 22, y: p.y }])
      await page.waitForTimeout(24)
    }
    expect(await temFantasma(), 'movimento antes do limiar não pode ativar').toBe(0)
    await page.waitForTimeout(500) // o timer não pode disparar depois
    expect(await temFantasma()).toBe(0)
    await toque('touchEnd', [])
    expect(await colunaDe('d-sem-data')).toBe('sem_data')
  }, 60_000)

  it('deslize horizontal continua trocando de coluna', async () => {
    expect(await etapaAtiva()).toBe('Sem data')
    const caixa = await page.locator('[data-testid="board-pager"]').boundingBox()
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
    await page.mouse.wheel(caixa.width, 0)
    await page.waitForTimeout(900)
    expect(await etapaAtiva()).toBe('A fazer')
    expect(await temFantasma()).toBe(0)
  }, 60_000)

  it('scroll vertical na coluna não ativa e não move nada', async () => {
    const p = await centroDe('[data-task-id="d-sem-data"]')
    await toque('touchStart', [p])
    await page.waitForTimeout(110)
    for (let i = 1; i <= 6; i += 1) {
      await toque('touchMove', [{ x: p.x, y: p.y - i * 26 }])
      await page.waitForTimeout(24)
    }
    expect(await temFantasma(), 'scroll vertical não pode pegar o cartão').toBe(0)
    await toque('touchEnd', [])
    await page.waitForTimeout(400)
    expect(await colunaDe('d-sem-data')).toBe('sem_data')
  }, 60_000)

  it('segurar sobre o ••• abre "Mover para" em vez de pegar o cartão', async () => {
    const p = await centroDe('[data-task-id="d-sem-data"] button[aria-label^="Mover"]')
    await toque('touchStart', [p])
    await page.waitForTimeout(SEGURAR + 180)
    expect(await temFantasma(), 'o ••• tem função própria: não pega o cartão').toBe(0)
    await toque('touchEnd', [])
    await page.waitForTimeout(900)
    // E a folha aprovada no CP5.4 continua sendo a via principal.
    expect(await page.getByRole('dialog').innerText()).toMatch(/Mover para/i)
  }, 60_000)
})

// ---------------------------------------------------------------------------
// O QUE PRECISA ACONTECER
// ---------------------------------------------------------------------------
describe('arrasto no toque — pegar, atravessar e soltar', () => {
  it('segurar 380ms pega o cartão e dá retorno visual', async () => {
    const p = await centroDe('[data-task-id="d-sem-data"]')
    await toque('touchStart', [p])
    await page.waitForTimeout(SEGURAR + 160)
    expect(await temFantasma(), 'depois do limiar o cartão tem de estar na mão').toBe(1)
    // origem esmaecida = o mesmo sinal do arrasto de desktop, reaproveitado
    const opacidade = await page.evaluate(() =>
      getComputedStyle(document.querySelector('[data-task-id="d-sem-data"]')).opacity,
    )
    expect(Number(opacidade)).toBeLessThan(0.6)
    await toque('touchCancel', [])
    await page.waitForTimeout(400)
    expect(await colunaDe('d-sem-data')).toBe('sem_data')
  }, 60_000)

  it('a coluna candidata recebe destaque durante o arrasto', async () => {
    const p = await centroDe('[data-task-id="d-sem-data"]')
    await toque('touchStart', [p])
    await page.waitForTimeout(SEGURAR + 160)
    await toque('touchMove', [{ x: p.x + 6, y: p.y + 6 }])
    await page.waitForTimeout(200)
    const anel = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="board-column-sem_data"].ring-2')),
    )
    expect(anel, 'a coluna sob o dedo precisa se anunciar').toBe(true)
    await toque('touchCancel', [])
  }, 60_000)

  it('arrastar para a coluna vizinha move UMA tarefa e persiste', async () => {
    await focarEtapa(1)
    const antes = await contagens()

    // Gesto realista: segura, leva ate a borda direita, o quadro anda sozinho,
    // e solta no meio da coluna que entrou em foco.
    const origem = await centroDe('[data-task-id="d-a-fazer"]')
    const bordaX = await bordaDireitaDoPager()
    await toque('touchStart', [origem])
    await page.waitForTimeout(SEGURAR + 160)
    await toque('touchMove', [{ x: origem.x + 20, y: origem.y }])
    await page.waitForTimeout(60)
    await toque('touchMove', [{ x: bordaX, y: origem.y }])
    await page.waitForTimeout(820)
    await toque('touchMove', [{ x: Math.round(bordaX - 140), y: origem.y }])
    await page.waitForTimeout(200)
    await toque('touchEnd', [])
    await page.waitForTimeout(800)

    expect(await colunaDe('d-a-fazer')).toBe('em_andamento')
    const depois = await contagens()
    expect(depois[1]).toBe(antes[1] - 1)
    expect(depois[2]).toBe(antes[2] + 1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="board-pager"]', { timeout: 15000 })
    await page.waitForTimeout(700)
    expect(await colunaDe('d-a-fazer'), 'tem de sobreviver ao reload').toBe('em_andamento')
  }, 90_000)

  it('encostar na borda atravessa colunas sem soltar o cartão', async () => {
    const origem = await centroDe('[data-task-id="d-sem-data"]')
    await toque('touchStart', [origem])
    await page.waitForTimeout(SEGURAR + 160)

    const bordaX = await bordaDireitaDoPager()
    await toque('touchMove', [{ x: origem.x + 20, y: origem.y }])
    await page.waitForTimeout(60)
    await toque('touchMove', [{ x: bordaX, y: origem.y }])
    // duas passagens pela espera entre avancos: duas colunas para a direita
    await page.waitForTimeout(760)
    await toque('touchMove', [{ x: bordaX, y: origem.y }])
    await page.waitForTimeout(760)
    await toque('touchMove', [{ x: bordaX, y: origem.y }])
    await page.waitForTimeout(500)

    expect(await etapaAtiva(), 'o quadro tem de ter andado com o cartão na mão').not.toBe('Sem data')
    await toque('touchCancel', [])
    await page.waitForTimeout(400)
  }, 90_000)

  it('voltar para a coluna anterior também funciona', async () => {
    await focarEtapa(2)
    expect(await etapaAtiva()).toBe('Em andamento')

    const origem = await centroDe('[data-task-id="d-andamento"]')
    const caixa = await page.locator('[data-testid="board-pager"]').boundingBox()
    await toque('touchStart', [origem])
    await page.waitForTimeout(SEGURAR + 160)
    await toque('touchMove', [{ x: origem.x - 20, y: origem.y }])
    await page.waitForTimeout(60)
    await toque('touchMove', [{ x: Math.round(caixa.x + 18), y: origem.y }])
    await page.waitForTimeout(760)
    expect(await etapaAtiva()).toBe('A fazer')
    await toque('touchCancel', [])
    await page.waitForTimeout(400)
  }, 90_000)
})

// ---------------------------------------------------------------------------
// DESISTIR, FALHAR, E A REGRA DA DATA
// ---------------------------------------------------------------------------
describe('arrasto no toque — desistir e falhar', () => {
  it('touchcancel devolve o cartão e não move nada', async () => {
    await focarEtapa(2)
    const p = await centroDe('[data-task-id="d-andamento"]')
    await gesto({ de: p, para: [{ x: p.x + 90, y: p.y }], cancelar: true })
    expect(await colunaDe('d-andamento')).toBe('em_andamento')
    expect(await temFantasma()).toBe(0)
  }, 60_000)

  it('soltar fora de qualquer coluna não move', async () => {
    const p = await centroDe('[data-task-id="d-sem-data"]')
    // sobe até a área do cabeçalho, que não é coluna nenhuma
    await gesto({ de: p, para: [{ x: p.x, y: 20 }] })
    expect(await colunaDe('d-sem-data')).toBe('sem_data')
    expect(await temFantasma()).toBe(0)
  }, 60_000)

  it('Sem data -> A fazer PERGUNTA a data; cancelar devolve à origem', async () => {
    const origem = await centroDe('[data-task-id="d-sem-data"]')
    const bordaX = await bordaDireitaDoPager()
    await toque('touchStart', [origem])
    await page.waitForTimeout(SEGURAR + 160)
    await toque('touchMove', [{ x: origem.x + 20, y: origem.y }])
    await page.waitForTimeout(60)
    await toque('touchMove', [{ x: bordaX, y: origem.y }])
    await page.waitForTimeout(800)
    // agora "A fazer" está sob o dedo
    await toque('touchMove', [{ x: Math.round(bordaX - 120), y: origem.y }])
    await page.waitForTimeout(200)
    await toque('touchEnd', [])
    await page.waitForTimeout(800)

    expect(await page.getByRole('dialog').innerText()).toMatch(/Para quando/i)
    expect(await colunaDe('d-sem-data'), 'nada se move antes da data').toBe('sem_data')

    await page.getByRole('button', { name: /^Cancelar$/ }).click()
    await page.waitForTimeout(700)
    expect(await colunaDe('d-sem-data'), 'cancelar devolve à origem').toBe('sem_data')
  }, 90_000)

  it('erro de gravação faz rollback: o cartão não fica na coluna errada', async () => {
    await focarEtapa(1)
    await page.evaluate(() => {
      const real = Storage.prototype.setItem
      Storage.prototype.setItem = function (k, v) {
        if (k === 'agenda360.db.v2') throw new Error('falha simulada de gravação')
        return real.call(this, k, v)
      }
    })
    const origem = await centroDe('[data-task-id="d-a-fazer"]')
    const bordaX = await bordaDireitaDoPager()
    await toque('touchStart', [origem])
    await page.waitForTimeout(SEGURAR + 160)
    await toque('touchMove', [{ x: origem.x + 20, y: origem.y }])
    await page.waitForTimeout(60)
    await toque('touchMove', [{ x: bordaX, y: origem.y }])
    await page.waitForTimeout(820)
    await toque('touchMove', [{ x: Math.round(bordaX - 140), y: origem.y }])
    await page.waitForTimeout(200)
    await toque('touchEnd', [])
    await page.waitForTimeout(900)
    expect(await colunaDe('d-a-fazer')).toBe('a_fazer')
    expect(await page.locator('body').innerText()).toMatch(/Não foi possível mover/i)
  }, 90_000)
})
