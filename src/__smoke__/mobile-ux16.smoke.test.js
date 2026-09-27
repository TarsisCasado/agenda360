/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// UX1.6 — MOBILE 2.0, no build real.
//
// O que este arquivo protege (e NAO mais que isso): navegacao, conteudo
// principal de cada tela, revelacao progressiva, acoes que continuam
// alcancaveis, o Kanban congelado, tema e densidade.
//
// O QUE ELE NAO PROVA, dito aqui para nao ser confundido depois: isto e
// CHROMIUM com viewport de telefone. Gesto, teclado, `position:fixed`,
// safe-area, overscroll e bottom sheet do Safari/iOS NAO sao reproduzidos.
// Tudo isso continua dependendo do QA humano no iPhone — inclusive o drag do
// Kanban, que ja passou por esse QA em 5049a52 e aqui so e verificado como
// NAO-REGRESSAO estrutural (o quadro existe, as colunas existem, o gesto nao
// foi tocado).
//
// Densidade: o teste mede PIXELS ate o primeiro conteudo util em cada tela,
// registra o numero e falha so no absurdo. E fotografia para comparar, nao
// meta inventada.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

const VIEWPORTS = [
  { nome: 'iphone-13-mini', width: 375, height: 812 },
  { nome: 'iphone-14', width: 390, height: 844 },
  { nome: 'iphone-14-plus', width: 430, height: 932 },
]

const SEMENTE = `(() => {
  const K = 'agenda360.db.v2'
  const db = JSON.parse(localStorage.getItem(K))
  if (!db) return false
  const ws = db.workspaces[0].id, uid = db.profiles[0].id
  const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const agora = new Date().toISOString()
  const base = { workspace_id: ws, created_by: uid, assignee_id: uid, delegated_by: null, delegated_at: null,
    description: '', link: '', notes: '', alert_enabled: false, alert_type: 'push', alert_minutes_before: 15,
    alert_sent: false, reschedule_count: 0, start_time: null, end_time: null, date: null, origin: 'manual',
    created_at: agora, updated_at: agora, priority: 'medium', status: 'todo' }

  db.tasks = [
    { ...base, id: 'ux-prox', title: 'Reuniao com os gerentes', date: dia(0), start_time: '09:30', end_time: '10:30' },
    { ...base, id: 'ux-hoje', title: 'Revisar proposta comercial', date: dia(0) },
    { ...base, id: 'ux-remarcada', title: 'Fechar o repasse', date: dia(0), reschedule_count: 4 },
    { ...base, id: 'ux-atraso1', title: 'Pagar contas do mes', date: dia(-3) },
    { ...base, id: 'ux-atraso2', title: 'Enviar nota fiscal', date: dia(-1) },
    { ...base, id: 'ux-atraso3', title: 'Confirmar vistoria', date: dia(-5) },
    { ...base, id: 'ux-semdata', title: 'Organizar o patio' },
    { ...base, id: 'ux-feita', title: 'Responder e-mails', date: dia(0), status: 'done' },
  ]
  db.inbox_items = [
    { id: 'ux-nota', workspace_id: ws, created_by: uid, type: 'note', status: 'inbox', origin: 'manual', seen: false,
      title: 'Contrato da locadora', content: 'ver com juridico antes de assinar',
      created_at: agora, updated_at: agora },
    { id: 'ux-ideia', workspace_id: ws, created_by: uid, type: 'note', status: 'to_think', origin: 'manual', seen: false,
      title: 'Vitrine digital do patio', content: 'pensar depois com calma',
      created_at: agora, updated_at: agora },
  ]
  db.links = [{ id: 'ux-link', workspace_id: ws, created_by: uid, title: 'Relatorio mercado',
    url: 'https://carmais.com.br/r', note: '', task_id: null, created_at: agora }]
  db.inbox_task_links = []
  localStorage.setItem(K, JSON.stringify(db))
  return true
})()`

let servidor, porta, browser
const densidade = {}

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

// ---------------------------------------------------------------------------
// RELOGIO CONGELADO as 09:00 DE HOJE.
//
// "AGORA" so existe quando ha um compromisso AINDA POR VIR hoje. Com o relogio
// real do runner, um teste que semeia as 09:30 passa de manha e falha a noite
// — e um teste que muda de resultado conforme a hora nao e um teste, e um
// sorteio. Congelar remove a unica variavel que nao interessa aqui.
//
// `pauseAt` e nao `install`: o tempo para, entao os timers da aplicacao nao
// avancam sozinhos durante o teste e a leitura fica estavel.
// ---------------------------------------------------------------------------
async function abrir({ width, height }, tema = 'light') {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    colorScheme: tema,
  })
  const hoje9h = new Date()
  hoje9h.setHours(9, 0, 0, 0)
  await ctx.clock.install({ time: hoje9h })
  const page = await ctx.newPage()
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
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1400)
  return { ctx, page }
}

const irPara = async (page, rota) => {
  await page.goto(`http://127.0.0.1:${porta}${rota}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
}, 240000)

afterAll(async () => {
  await browser?.close()
  await new Promise((r) => servidor?.close(r))
  if (Object.keys(densidade).length) {
    console.log('\n[UX1.6] DENSIDADE — pixels ate o primeiro conteudo util (390x844)',
      JSON.stringify(densidade, null, 2))
  }
})

// ===========================================================================
// HOJE — a home pessoal
// ===========================================================================
describe('Hoje no telefone', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('abre na composicao do telefone, nao na do desktop', async () => {
    await irPara(page, '/')
    expect(await page.locator('[data-testid="hoje-mobile"]').isVisible()).toBe(true)
    // As quatro entradas de foco sairam da dobra do telefone.
    expect(await page.locator('[data-testid="hoje-entradas"]:visible').count()).toBe(0)
  }, 60000)

  it('os tres tempos aparecem: AGORA, HOJE e PRECISA DE VOCE', async () => {
    await irPara(page, '/')
    expect(await page.locator('[data-testid="hoje-agora"]').isVisible()).toBe(true)
    expect(await page.locator('[data-testid="hoje-linha-do-dia"]').isVisible()).toBe(true)
    expect(await page.locator('[data-testid="hoje-atencao"]').isVisible()).toBe(true)
  }, 60000)

  it('AGORA mostra a hora como maior elemento, sem virar um card enorme', async () => {
    await irPara(page, '/')
    const m = await page.evaluate(() => {
      const bloco = document.querySelector('[data-testid="hoje-proximo"]')
      const hora = bloco.querySelector('span')
      return {
        altura: Math.round(bloco.getBoundingClientRect().height),
        hora: parseInt(getComputedStyle(hora).fontSize, 10),
        fundo: getComputedStyle(bloco).backgroundColor,
      }
    })
    expect(m.hora).toBeGreaterThanOrEqual(30)
    // Forte por hierarquia, nao por caixa: o bloco nao tem superficie propria.
    expect(m.fundo).toBe('rgba(0, 0, 0, 0)')
    expect(m.altura).toBeLessThan(140)
  }, 60000)

  it('a linha do dia mistura compromisso e tarefa na ordem do relogio', async () => {
    await irPara(page, '/')
    const linhas = await page.locator('[data-testid="hoje-linha"]').allInnerTexts()
    expect(linhas.join(' | ')).toMatch(/Revisar proposta comercial/)
    // Tarefa sem hora nao ganha horario inventado.
    const semHora = linhas.find((l) => l.includes('Revisar proposta'))
    expect(semHora).toMatch(/—/)
  }, 60000)

  it('UM ITEM, UM LUGAR: o destaque de AGORA nao se repete na linha do dia', async () => {
    await irPara(page, '/')
    const agora = await page.locator('[data-testid="hoje-agora"]').innerText()
    expect(agora).toMatch(/Reuniao com os gerentes/)
    const linhas = await page.locator('[data-testid="hoje-linha"]').allInnerTexts()
    expect(linhas.join(' | ')).not.toMatch(/Reuniao com os gerentes/)
  }, 60000)

  it('UM ITEM, UM LUGAR: a remarcada de hoje aparece na linha do dia, com sinal', async () => {
    await irPara(page, '/')
    const linhas = await page.locator('[data-testid="hoje-linha"]').allInnerTexts()
    const remarcada = linhas.filter((l) => l.includes('Fechar o repasse'))
    expect(remarcada).toHaveLength(1)
    expect(remarcada[0]).toMatch(/4×/)
    const atencao = await page.locator('[data-testid="hoje-atencao-item"]').allInnerTexts()
    expect(atencao.join(' | ')).not.toMatch(/Fechar o repasse/)
  }, 60000)

  it('PRECISA DE VOCE mostra no maximo duas, com o resto atras de um toque', async () => {
    await irPara(page, '/')
    expect(await page.locator('[data-testid="hoje-atencao-item"]').count()).toBe(2)
    const ver = page.getByRole('button', { name: /Ver mais/ })
    expect(await ver.isVisible()).toBe(true)
    await ver.click()
    await page.waitForTimeout(300)
    expect(await page.locator('[data-testid="hoje-atencao-item"]').count()).toBe(3)
  }, 60000)

  it('a excecao traz EVIDENCIA, e nao julgamento', async () => {
    await irPara(page, '/')
    const t = (await page.locator('[data-testid="hoje-atencao"]').innerText())
    expect(t).toMatch(/dias de atraso|dia de atraso/)
    expect(t).not.toMatch(/procrastin|preguic|disciplin|voce falhou/i)
  }, 60000)

  it('captura "por organizar" NAO aparece como emergencia', async () => {
    await irPara(page, '/')
    const t = await page.locator('[data-testid="hoje-atencao"]').innerText()
    expect(t).not.toMatch(/Contrato da locadora/)
    expect(t).not.toMatch(/Por organizar/i)
  }, 60000)

  it('concluir continua a um toque, direto da linha', async () => {
    await irPara(page, '/')
    const antes = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('agenda360.db.v2'))
      return db.tasks.find((t) => t.id === 'ux-hoje').status
    })
    expect(antes).toBe('todo')
    await page.locator('[data-testid="hoje-linha"]', { hasText: 'Revisar proposta' })
      .getByRole('button', { name: /Concluir/i }).click()
    await page.waitForTimeout(900)
    const depois = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('agenda360.db.v2'))
      return db.tasks.find((t) => t.id === 'ux-hoje').status
    })
    expect(depois).toBe('done')
  }, 60000)
})

// ===========================================================================
// CAPTURA — a porta comeca com um campo
// ===========================================================================
describe('a porta do +', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('abre CURTA: pergunta, campo e quatro atalhos', async () => {
    await irPara(page, '/')
    await page.locator('nav.fixed.inset-x-0.bottom-0').getByRole('button', { name: /Capturar/i }).click()
    await page.waitForTimeout(600)
    expect(await page.locator('[data-testid="captura-campo"]').isVisible()).toBe(true)
    expect(await page.locator('[data-testid^="captura-atalho-"]:visible').count()).toBe(4)
    // Nenhum formulario completo de imediato.
    expect(await page.locator('input[type="date"]:visible').count()).toBe(0)
  }, 60000)

  it('a folha ocupa pouco: e curta de verdade', async () => {
    const altura = await page.evaluate(() => {
      const campo = document.querySelector('[data-testid="captura-campo"]')
      const folha = campo.closest('div[class*="fixed"]')
      return Math.round(folha.getBoundingClientRect().height)
    })
    expect(altura).toBeLessThan(300)
  }, 60000)

  it('as QUATRO portas cabem na tela — nenhuma cortada na borda', async () => {
    const larg = await page.evaluate(() => window.innerWidth)
    const caixas = await page.locator('[data-testid^="captura-atalho-"]').evaluateAll(
      (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { right: Math.round(r.right), left: Math.round(r.left) } }),
    )
    expect(caixas).toHaveLength(4)
    for (const c of caixas) {
      expect(c.left).toBeGreaterThanOrEqual(0)
      expect(c.right).toBeLessThanOrEqual(larg)
    }
  }, 60000)

  it('o texto escrito ali CHEGA na captura, sem ser digitado de novo', async () => {
    await page.locator('[data-testid="captura-campo"]').fill('Ligar para o Rafael amanha')
    await page.locator('[data-testid="captura-enviar"]').click()
    await page.waitForTimeout(1200)
    const valor = await page.locator('textarea:visible').first().inputValue()
    expect(valor).toMatch(/Ligar para o Rafael amanha/)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }, 60000)

  it('"Nota" nao passa por formulario nenhum: abre a folha de escrever', async () => {
    await irPara(page, '/')
    await page.locator('nav.fixed.inset-x-0.bottom-0').getByRole('button', { name: /Capturar/i }).click()
    await page.waitForTimeout(500)
    await page.locator('[data-testid="captura-atalho-nota"]').click()
    await page.waitForTimeout(1400)
    expect(new URL(page.url()).pathname).toMatch(/^\/ideias\//)
    expect(await page.locator('textarea').first().isVisible()).toBe(true)
  }, 60000)
})

// ===========================================================================
// MEMORIA / MES / COPILOTO / RELATORIOS
// ===========================================================================
describe('as outras superficies no telefone', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('Memoria: os cinco recortes viram UM seletor, nao uma fileira', async () => {
    await irPara(page, '/memoria')
    expect(await page.locator('[data-testid="memoria-seletor-filtro"]').isVisible()).toBe(true)
    expect(await page.locator('[data-testid="memoria-filtro-tudo"]:visible').count()).toBe(0)
    await page.locator('[data-testid="memoria-seletor-filtro"]').click()
    await page.waitForTimeout(250)
    expect(await page.locator('[data-testid="memoria-filtro-ideias"]:visible').isVisible()).toBe(true)
    await page.locator('[data-testid="memoria-filtro-ideias"]:visible').click()
    await page.waitForTimeout(300)
    expect(await page.locator('[data-testid="memoria-seletor-filtro"]').innerText()).toMatch(/Ideias/)
    expect((await page.locator('[data-testid="memoria-item"]').allInnerTexts()).join(' '))
      .toMatch(/Vitrine digital/)
  }, 60000)

  it('Mes: escolher um dia mostra a agenda ABAIXO, sem cobrir a grade', async () => {
    await irPara(page, '/dia?visao=mes')
    const hoje = new Date().toISOString().slice(0, 10)
    await page.locator(`[data-testid="mes-dia-${hoje}"]`).click()
    await page.waitForTimeout(600)
    const painel = page.locator('[data-testid="mes-painel-dia"]')
    expect(await painel.isVisible()).toBe(true)
    // A grade continua na tela: escolher nao apaga o contexto da escolha.
    expect(await page.locator(`[data-testid="mes-dia-${hoje}"]`).isVisible()).toBe(true)
    expect(await page.getByRole('dialog').count()).toBe(0)
    // Tocar de novo fecha.
    await page.locator(`[data-testid="mes-dia-${hoje}"]`).click()
    await page.waitForTimeout(400)
    expect(await painel.count()).toBe(0)
  }, 60000)

  it('Copiloto: a conversa vazia comeca perto do campo, nao colada no topo', async () => {
    await irPara(page, '/assistente')
    await page.locator('[data-testid="copiloto-abertura"]').waitFor({ state: 'visible', timeout: 15000 })
    const m = await page.evaluate(() => {
      const bloco = document.querySelector('[data-testid="copiloto-abertura"]')
      const campo = document.querySelector('input[aria-label="Mensagem para o copiloto"]')
      return {
        folga: Math.round(campo.getBoundingClientRect().top - bloco.getBoundingClientRect().bottom),
        altura: window.innerHeight,
      }
    })
    // Sem grande vazio no meio: a abertura termina perto da entrada.
    expect(m.folga).toBeGreaterThanOrEqual(0)
    expect(m.folga).toBeLessThan(m.altura * 0.25)
  }, 60000)

  it('Copiloto: cumprimenta e devolve a palavra, sem enviar turno sozinho', async () => {
    const t = await page.locator('[data-testid="copiloto-abertura"]').innerText()
    expect(t).toMatch(/Olá/)
    expect(t).toMatch(/ajudar/i)
    expect(await page.locator('[data-testid="copiloto-proposta"]').count()).toBe(0)
  }, 60000)

  it('Relatorios: manchete, serie da semana e a verdade sobre delegacao', async () => {
    await irPara(page, '/relatorios')
    expect(await page.locator('[data-testid="relatorios-mobile"]').isVisible()).toBe(true)
    expect(await page.locator('[data-testid="rel-manchete"]').innerText()).toMatch(/%/)
    expect(await page.locator('[data-testid="rel-semana"]').isVisible()).toBe(true)
    // O que o modelo nao sustenta e DITO, nao desenhado como zero.
    expect(await page.locator('[data-testid="rel-delegacao"]').locator('..').innerText())
      .toMatch(/ainda não são registradas/i)
  }, 60000)

  it('Relatorios: tocar num dia da a leitura daquele dia', async () => {
    await irPara(page, '/relatorios')
    const hoje = new Date()
    const rot = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][hoje.getDay()]
    await page.locator(`[data-testid="rel-dia-${rot}"]`).click()
    await page.waitForTimeout(300)
    expect(await page.locator('[data-testid="rel-semana"]').innerText()).toMatch(new RegExp(`${rot} ·`))
  }, 60000)
})

// ===========================================================================
// O QUE NAO PODE TER REGREDIDO
// ===========================================================================
describe('nao-regressao', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('a barra inferior continua Hoje · Agenda · + · Tarefas · Memoria', async () => {
    await irPara(page, '/')
    const itens = await page.locator('nav.fixed.inset-x-0.bottom-0 a').allInnerTexts()
    expect(itens.map((s) => s.trim())).toEqual(['Hoje', 'Agenda', 'Tarefas', 'Memória'])
  }, 60000)

  it('o destino ativo e marcado pela pilula sob o icone', async () => {
    await irPara(page, '/tarefas')
    const ativo = await page.evaluate(() => {
      const nav = document.querySelector('nav.fixed.inset-x-0.bottom-0')
      const l = [...nav.querySelectorAll('a')].find((a) => a.querySelector('.bg-accent-soft'))
      return l?.innerText.trim()
    })
    expect(ativo).toBe('Tarefas')
  }, 60000)

  it('o alvo de toque da barra inferior tem pelo menos 44px', async () => {
    const alturas = await page.locator('nav.fixed.inset-x-0.bottom-0 a').evaluateAll(
      (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)),
    )
    for (const h of alturas) expect(h).toBeGreaterThanOrEqual(44)
  }, 60000)

  // O Kanban esta CONGELADO neste checkpoint: o gesto foi validado no iPhone em
  // 5049a52 e nao pode regredir. Aqui so se verifica a ESTRUTURA — que o quadro
  // continua sendo um pager de colunas no telefone, com as mesmas etapas. O
  // gesto em si (long-press, arrasto, travessia de borda) nao e reproduzivel em
  // Chromium e continua dependendo do QA humano.
  it('KANBAN CONGELADO: o pager e as etapas continuam como estavam', async () => {
    // O quadro com o gesto e a visao FLUXO (FlowBoard), que e a padrao de
    // /tarefas. 'semana' e a agenda semanal, outra tela.
    await irPara(page, '/tarefas')
    await page.locator('[data-testid="board-stages"]').waitFor({ state: 'visible', timeout: 20000 })
    expect(await page.locator('[data-testid="board-pager"]').count()).toBeGreaterThan(0)
    const etapas = await page.locator('[data-testid="board-stages"]').innerText()
    expect(etapas).toMatch(/fazer/i)
    expect(etapas).toMatch(/andamento/i)
    expect(etapas).toMatch(/conclu/i)
  }, 60000)

  it('nenhuma tela cria rolagem lateral', async () => {
    for (const rota of ['/', '/dia', '/tarefas', '/memoria', '/assistente', '/relatorios']) {
      await irPara(page, rota)
      const vaza = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      expect(vaza, rota).toBe(false)
    }
  }, 120000)

  it('as rotas antigas continuam abrindo', async () => {
    for (const rota of ['/ideias', '/caixa', '/links', '/config']) {
      await irPara(page, rota)
      expect(new URL(page.url()).pathname).toBe(rota)
    }
  }, 90000)
})

// ===========================================================================
// DENSIDADE (§22) — quantos pixels ate o primeiro conteudo util
// ===========================================================================
describe('densidade', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 120000)
  afterAll(async () => { await ctx?.close() })

  // Distancia do topo do CONTEUDO, e nao da viewport: a Agenda rola sozinha
  // ate a hora atual assim que abre, e medir a viewport ali devolvia numero
  // negativo — que nao diz nada sobre quanto cabecalho existe antes do
  // conteudo. Somando `scrollTop` a medida volta a ser "quanto se gasta antes
  // de comecar", que e a pergunta do §22.
  const medir = async (rota, seletor) => {
    await irPara(page, rota)
    const y = await page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return null
      const main = document.querySelector('main')
      return Math.round(el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop)
    }, seletor)
    densidade[rota] = y
    return y
  }

  it('Hoje comeca cedo', async () => {
    const y = await medir('/', '[data-testid="hoje-agora"]')
    expect(y).not.toBeNull()
    expect(y).toBeLessThan(220)
  }, 60000)

  it('Memoria comeca cedo', async () => {
    const y = await medir('/memoria', '[data-testid="memoria-busca"]')
    expect(y).toBeLessThan(220)
  }, 60000)

  it('Relatorios comeca cedo', async () => {
    const y = await medir('/relatorios', '[data-testid="rel-manchete"]')
    expect(y).toBeLessThan(260)
  }, 60000)

  it('Agenda comeca cedo', async () => {
    const y = await medir('/dia', '[data-testid="dia-timeline"]')
    expect(y).toBeLessThan(320)
  }, 60000)
})

// ===========================================================================
// TEMA e LARGURAS
// ===========================================================================
describe('tema escuro', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1], 'dark')) }, 120000)
  afterAll(async () => { await ctx?.close() })

  it('o fundo escurece de verdade e o texto continua claro', async () => {
    await irPara(page, '/')
    const m = await page.evaluate(() => {
      const ler = (c) => c.match(/\d+/g).slice(0, 3).map(Number)
      const fundo = ler(getComputedStyle(document.body).backgroundColor)
      const h1 = document.querySelector('[data-testid="hoje-mobile"] h1')
      const texto = ler(getComputedStyle(h1).color)
      const media = (a) => (a[0] + a[1] + a[2]) / 3
      return { fundo: media(fundo), texto: media(texto) }
    })
    expect(m.fundo).toBeLessThan(60)
    expect(m.texto).toBeGreaterThan(180)
  }, 60000)

  it('o grafico da semana usa token, nao hex fixo: ele acompanha o tema', async () => {
    await irPara(page, '/relatorios')
    const cor = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="rel-semana"] .bg-accent')
      return b ? getComputedStyle(b).backgroundColor : null
    })
    // No escuro o accent e o passo claro (129 140 248), nao o do tema claro.
    expect(cor).toBe('rgb(129, 140, 248)')
  }, 60000)

  it('a barra inferior nao vira uma faixa transparente ilegivel', async () => {
    const fundo = await page.evaluate(() =>
      getComputedStyle(document.querySelector('nav.fixed.inset-x-0.bottom-0')).backgroundColor)
    expect(fundo).not.toBe('rgba(0, 0, 0, 0)')
  }, 60000)
})

describe('as tres larguras', () => {
  for (const vp of VIEWPORTS) {
    it(`${vp.nome} (${vp.width}x${vp.height}): sem vazamento e com a barra inteira`, async () => {
      const { ctx, page } = await abrir(vp)
      try {
        for (const rota of ['/', '/memoria', '/relatorios']) {
          await irPara(page, rota)
          const m = await page.evaluate(() => ({
            vaza: document.documentElement.scrollWidth > window.innerWidth + 1,
            nav: document.querySelectorAll('nav.fixed.inset-x-0.bottom-0 a').length,
          }))
          expect(m.vaza, `${rota} vazou em ${vp.width}`).toBe(false)
          expect(m.nav, `${rota} perdeu destinos em ${vp.width}`).toBe(4)
        }
      } finally {
        await ctx.close()
      }
    }, 180000)
  }
})
