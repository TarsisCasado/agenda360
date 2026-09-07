/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// SMOKE DE ROTAS — renderizacao REAL, no build real.
//
// Por que este arquivo existe (incidente do CP5.1.1):
//   621 testes verdes, lint verde e build verde nao impediram um Preview em que
//   "Hoje" abria e TODAS as outras telas caiam no ErrorBoundary. Nenhum teste
//   unitario podia pegar isso: a falha nao estava em nenhuma funcao, estava na
//   TRANSICAO ENTRE DEPLOYS — o service worker trocava de versao por baixo de
//   uma aba aberta e os chunks lazy que ela ainda pedia deixavam de existir.
//
// Por isso aqui ha DOIS testes, e o segundo e o que importa:
//   1. todas as rotas renderizam num deploy integro;
//   2. todas as rotas CONTINUAM renderizando depois de um deploy novo trocar
//      os nomes com hash de todos os chunks, com a aba ja aberta.
//
// O teste 1 sozinho ja passava durante o incidente. E o teste 2 que trava a
// classe de regressao que escapou.
// ---------------------------------------------------------------------------
// Destinos do CP5.2: 4 primarios + 5 secundarios. "Semana" e "Mes" sairam
// daqui de proposito — deixaram de ser destinos e viraram visoes.
const ROTAS = [
  { nome: 'Hoje', conteudo: /Bom dia|Boa tarde|Boa noite/i, primario: true },
  { nome: 'Agenda', conteudo: /Dia|Semana|Mês/, primario: true },
  { nome: 'Tarefas', conteudo: /Fluxo|Semana/, primario: true },
  { nome: 'Ideias', conteudo: /Ideias/i, primario: true },
  { nome: 'Copiloto', conteudo: /Copiloto/i },
  { nome: 'Caixa de entrada', conteudo: /Caixa de Entrada/i },
  { nome: 'Central de links', conteudo: /[Ll]inks/ },
  { nome: 'Relatórios', conteudo: /Relatórios/i },
  { nome: 'Configurações', conteudo: /Configura/i },
]

// Recortes que passaram a viver DENTRO de uma tela, e as rotas antigas que
// precisam continuar levando a algum lugar util.
const VISOES = [
  { url: '/dia?visao=semana', conteudo: /Dia livre|segunda|terça|quarta|quinta|sexta|sábado|domingo/i },
  { url: '/dia?visao=mes', conteudo: /Seg|Ter|Qua|Qui|Sex/ },
  { url: '/tarefas?visao=semana', conteudo: /Semana|Nova/i },
]

const REDIRECTS = [
  { de: '/semana', para: '/tarefas', param: 'visao=semana' },
  { de: '/mes', para: '/dia', param: 'visao=mes' },
  { de: '/calendario', para: '/dia', param: 'visao=mes' },
  { de: '/kanban', para: '/tarefas', param: 'visao=semana' },
]

const BOUNDARY = /Não foi possível abrir esta tela/i
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

// dist esta mais velho que o codigo? entao rebuilda — um smoke que testa um
// build antigo nao testa nada.
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

// "Deploy novo": copia o build trocando o nome de TODO arquivo de assets e
// reescrevendo as referencias. E o que a Vercel entrega a cada push — hashes
// novos inclusive em paginas que ninguem editou.
function simularDeployNovo(origem, destino) {
  fs.cpSync(origem, destino, { recursive: true })
  const assets = path.join(destino, 'assets')
  const renomes = new Map()
  for (const nome of fs.readdirSync(assets)) {
    const novo = `d2-${nome}`
    fs.renameSync(path.join(assets, nome), path.join(assets, novo))
    renomes.set(nome, novo)
  }
  const reescrever = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { reescrever(full); continue }
      if (!/\.(js|mjs|css|html|webmanifest|json)$/.test(e.name)) continue
      let txt = fs.readFileSync(full, 'utf8')
      let mudou = false
      for (const [antigo, novo] of renomes) {
        if (txt.includes(antigo)) { txt = txt.split(antigo).join(novo); mudou = true }
      }
      if (mudou) fs.writeFileSync(full, txt)
    }
  }
  reescrever(destino)
}

let servidor
let raiz // trocavel em tempo de execucao: e o "deploy" servido agora
let porta
let browser
let page

function servir() {
  return new Promise((resolve) => {
    servidor = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || '/').split('?')[0])
      let arquivo = path.join(raiz, url)
      if (!fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
        // Arquivo com extensao que nao existe = 404 de verdade (e o caso do
        // chunk de um deploy antigo). Sem extensao = rota SPA.
        if (path.extname(url)) { res.writeHead(404); res.end('not found'); return }
        arquivo = path.join(raiz, 'index.html')
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      })
      fs.createReadStream(arquivo).pipe(res)
    })
    servidor.listen(0, '127.0.0.1', () => { porta = servidor.address().port; resolve() })
  })
}

function reDe(nome) {
  return new RegExp(`^${nome.replace('Calendário', 'Calend.rio').replace('Configurações', 'Configura..es')}$`, 'i')
}

// Navega pelo MENU (como o usuario) e devolve o diagnostico da tela.
async function abrir(nome, alvo = page) {
  const erros = []
  const onErr = (e) => erros.push(`exceção: ${(e.message || e).toString().slice(0, 160)}`)
  const on404 = (r) => { if (/\/assets\/.*\.(js|css)$/.test(r.url()) && r.status() >= 400) erros.push(`asset ${r.status()}: ${r.url().split('/').pop()}`) }
  alvo.on('pageerror', onErr)
  alvo.on('response', on404)
  try {
    const link = alvo.locator('a').filter({ hasText: reDe(nome) })
    if (await link.count()) await link.first().click({ timeout: 8000 })
    await alvo.waitForTimeout(1200)
    const texto = await alvo.locator('body').innerText()
    return { boundary: BOUNDARY.test(texto), erros, texto }
  } finally {
    alvo.off('pageerror', onErr)
    alvo.off('response', on404)
  }
}

// A fonte externa e ruido de AMBIENTE, nao comportamento do produto: como a
// folha do Google Fonts bloqueia o DOMContentLoaded, cada goto ficava ~12s
// esperando uma conexao que este sandbox nao tem. Cortar isso deixa o smoke
// medir o app, nao a rede.
async function isolar(alvo) {
  await alvo.route(/fonts\.(googleapis|gstatic)\.com/, (rota) => rota.abort())
}

async function entrar(alvo) {
  await alvo.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
  await alvo.waitForTimeout(1500)
  if (await alvo.locator('input[type="email"]').count()) {
    await alvo.fill('input[type="email"]', 'smoke@agenda360.test')
    await alvo.fill('input[type="password"]', 'smoke1234')
    await alvo.getByRole('button', { name: /Entrar/i }).click()
    await alvo.waitForTimeout(1800)
  }
  const overlay = alvo.locator('div.fixed.inset-0.z-50')
  for (let i = 0; i < 4; i += 1) {
    const pular = overlay.getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await alvo.waitForTimeout(500) } else break
  }
  await alvo.waitForTimeout(500)
}

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda360-smoke-'))
  raiz = path.join(tmp, 'deploy-a')
  fs.cpSync(DIST, raiz, { recursive: true })
  simularDeployNovo(DIST, path.join(tmp, 'deploy-b'))
  globalThis.__smokeTmp = tmp
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  page = await ctx.newPage()
  await isolar(page)
  await entrar(page)
}, 240_000)

afterAll(async () => {
  await browser?.close().catch(() => {})
  servidor?.close()
  if (globalThis.__smokeTmp) fs.rmSync(globalThis.__smokeTmp, { recursive: true, force: true })
})

describe('smoke — todas as superfícies renderizam', () => {
  it.each(ROTAS)('$nome abre sem ErrorBoundary e com conteúdo próprio', async ({ nome, conteudo }) => {
    const r = await abrir(nome)
    expect(r.erros, `${nome}: ${r.erros.join(' / ')}`).toEqual([])
    expect(r.boundary, `${nome} caiu no ErrorBoundary`).toBe(false)
    expect(r.texto).toMatch(conteudo)
  }, 40_000)
})

describe('smoke — os recortes dentro das telas', () => {
  it.each(VISOES)('$url renderiza sem ErrorBoundary', async ({ url, conteudo }) => {
    const erros = []
    const onErr = (e) => erros.push(`exceção: ${(e.message || e).toString().slice(0, 160)}`)
    page.on('pageerror', onErr)
    try {
      await page.goto(`http://127.0.0.1:${porta}${url}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2200)
      const texto = await page.locator('body').innerText()
      expect(erros, `${url}: ${erros.join(' / ')}`).toEqual([])
      expect(BOUNDARY.test(texto), `${url} caiu no ErrorBoundary`).toBe(false)
      expect(texto).toMatch(conteudo)
    } finally {
      page.off('pageerror', onErr)
    }
  }, 40_000)
})

describe('smoke — rotas antigas continuam valendo', () => {
  // Link salvo, atalho e paleta de comandos nao podem quebrar so porque a
  // arquitetura mudou. Cada rota antiga leva ao recorte equivalente.
  it.each(REDIRECTS)('$de redireciona para $para ($param)', async ({ de, para, param }) => {
    await page.goto(`http://127.0.0.1:${porta}${de}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2200)
    const url = new URL(page.url())
    expect(url.pathname).toBe(para)
    expect(url.search).toContain(param)
    expect(BOUNDARY.test(await page.locator('body').innerText())).toBe(false)
  }, 40_000)
})

describe('smoke — navegação mobile', () => {
  it('barra inferior leva às 4 áreas, com Capturar alcançável e sem scroll lateral', async () => {
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const mob = await ctxM.newPage()
    try {
      await isolar(mob)
      await entrar(mob)
      const barra = await mob.evaluate(() => {
        const nav = document.querySelector('nav.fixed')
        const itens = nav ? [...nav.querySelectorAll('a,button')] : []
        return {
          itens: itens.map((e) => {
            const r = e.getBoundingClientRect()
            return { rotulo: (e.getAttribute('aria-label') || e.textContent).trim(), w: Math.round(r.width), h: Math.round(r.height) }
          }),
          scrollLateral: document.body.scrollWidth > document.body.clientWidth,
        }
      })
      // 4 areas + Capturar
      expect(barra.itens).toHaveLength(5)
      expect(barra.itens.some((i) => /Capturar/i.test(i.rotulo))).toBe(true)
      // alvo de toque: nada abaixo de 44px
      const pequenos = barra.itens.filter((i) => i.w < 44 || i.h < 44)
      expect(pequenos, `alvos pequenos: ${pequenos.map((i) => i.rotulo).join(', ')}`).toEqual([])
      expect(barra.scrollLateral).toBe(false)

      // os secundarios continuam alcancaveis pelo menu de conta
      await mob.locator('header button[aria-label="Conta"]').first().click()
      await mob.waitForTimeout(500)
      const menu = await mob.locator('body').innerText()
      for (const nome of ['Copiloto', 'Caixa de entrada', 'Relatórios', 'Configurações']) {
        expect(menu, `"${nome}" não está no menu secundário do mobile`).toContain(nome)
      }
    } finally {
      await ctxM.close()
    }
  }, 90_000)
})

describe('smoke — a aba aberta sobrevive a um deploy novo', () => {
  // ESTA e a regressao do CP5.1.1, e o cenario precisa ser montado com cuidado
  // para nao passar por acidente: a aba tem de ser NOVA (nenhum chunk lazy
  // carregado ainda, senao o import() resolve da memoria e nada vai a rede) e a
  // troca de deploy acontece DEPOIS que ela ja esta rodando o bundle antigo.
  //
  // Cada build troca o hash de TODO chunk. A aba antiga continua pedindo os
  // nomes antigos; o servidor so tem os novos. Sem recuperacao, "Hoje" (import
  // estatico) segue abrindo e todas as rotas lazy morrem no ErrorBoundary —
  // exatamente o que o QA humano encontrou.
  it('navega por todas as rotas depois da troca de deploy', async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const aba = await ctx2.newPage()
    try {
      await isolar(aba)
      await entrar(aba) // carrega SO o bundle principal do deploy A
      await aba.waitForTimeout(2000) // deixa o service worker do deploy A assumir

      raiz = path.join(globalThis.__smokeTmp, 'deploy-b') // <- o "push" acontece aqui

      // Reabrir o app e o gesto que dispara a atualizacao do service worker —
      // e era exatamente ai que o SW novo assumia a aba antiga e apagava o
      // precache de que ela ainda dependia.
      await aba.reload({ waitUntil: 'domcontentloaded' })
      await aba.waitForTimeout(2500)

      const quebradas = []
      for (const { nome, conteudo } of ROTAS) {
        let r = await abrir(nome, aba)
        // Recuperar-se de um chunk que sumiu custa UM reload, que devolve a aba
        // para "Hoje". Nesse caso navegamos de novo — e ai tem de funcionar.
        if (!r.boundary && !conteudo.test(r.texto)) {
          await aba.waitForTimeout(1500)
          r = await abrir(nome, aba)
        }
        if (r.boundary) quebradas.push(`${nome}: ErrorBoundary`)
        else if (!conteudo.test(r.texto)) quebradas.push(`${nome}: não renderizou a tela`)
      }
      expect(quebradas, `rotas quebradas após o deploy: ${quebradas.join(' | ')}`).toEqual([])
    } finally {
      await ctx2.close()
    }
  }, 180_000)
})
