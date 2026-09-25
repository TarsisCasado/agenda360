/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

// ---------------------------------------------------------------------------
// UX1.6 (C3) — MEMORIA REAL, no build real.
//
// O criterio deste checkpoint NAO e "os testes passaram": e se, abrindo
// Memoria, da para ver conteudo, procurar, filtrar, abrir sem sair da tela,
// criar uma nota e derivar uma acao sem perder a nota. Este arquivo verifica
// exatamente essa lista — a dos "30 segundos" — num navegador de verdade,
// sobre o bundle de producao.
//
// O QUE ELE NAO PODE PROVAR, e por isso esta escrito aqui em vez de implicito
// num nome de teste: isto e CHROMIUM. O gesto, a rolagem, o teclado e a
// composicao do Safari no iPhone NAO sao reproduzidos por ele. A largura de
// 390x844 abaixo prova LAYOUT em viewport de telefone, nao "validado no
// iPhone". A validacao de iPhone continua sendo o QA humano.
//
// Volume: o MESMO do baseline UX1.4 e do C1 (202 tarefas / 41 links / 61
// notas). Medida com volume diferente nao compara com nada.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

const QUANTAS_TAREFAS = 200
const QUANTOS_LINKS = 40
const QUANTAS_NOTAS = 56

const SEMENTE = `((n, nl, nn) => {
  const KEY = 'agenda360.db.v2'
  const db = JSON.parse(localStorage.getItem(KEY))
  if (!db) return false
  const ws = db.workspaces[0].id, uid = db.profiles[0].id
  const agora = new Date().toISOString()
  const base = { workspace_id: ws, created_by: uid, assignee_id: uid, delegated_by: null, delegated_at: null,
    description: '', link: '', notes: '', alert_enabled: false, alert_type: 'push', alert_minutes_before: 15,
    alert_sent: false, reschedule_count: 0, start_time: null, end_time: null, date: null, origin: 'manual',
    created_at: agora, updated_at: agora, priority: 'medium', status: 'todo' }

  db.tasks = [
    { ...base, id: 'qa-derivada', title: 'Revisar checklist de preparacao', origin: 'inbox' },
    { ...base, id: 'qa-titulo', title: 'Conferir documentacao dos seminovos' },
    ...Array.from({ length: n }, (_, i) => ({ ...base, id: 'qa-vol-' + i, title: 'Atividade de volume ' + i })),
  ]
  db.links = [
    { id: 'qa-link', workspace_id: ws, created_by: uid, title: 'Relatorio mercado seminovos',
      url: 'https://carmais.com.br/relatorio-seminovos', note: '', task_id: null, created_at: agora },
    ...Array.from({ length: nl }, (_, i) => ({ id: 'qa-link-' + i, workspace_id: ws, created_by: uid,
      title: 'Link ' + i, url: 'https://exemplo.com.br/' + i, note: '', task_id: null, created_at: agora })),
  ]
  const nota = (id, over) => Object.assign({ id, workspace_id: ws, created_by: uid, type: 'note',
    status: 'inbox', origin: 'manual', title: '', content: '', seen: false,
    created_at: agora, updated_at: agora }, over)
  db.inbox_items = [
    nota('qa-nota', { title: 'Padrao de preparacao', content: 'checklist unico assinado por quem entrega os seminovos' }),
    nota('qa-nota-acento', { title: 'Garantia estendida', content: 'argumento de fechamento na proposta, nao na venda' }),
    nota('qa-nota-sem-titulo', { content: 'primeira linha vira titulo quando nao ha titulo' }),
    nota('qa-lista', { type: 'checklist', title: 'Lista de conferencia do patio', content: 'pneus, documentos, chave reserva' }),
    nota('qa-nota-arquivada', { status: 'archived', title: 'Politica antiga de desconto', content: 'valores que valiam ate marco' }),
    nota('qa-ideia', { status: 'to_think', title: 'Vitrine digital do patio', content: 'pensar depois com calma' }),
    nota('qa-com-tarefa', { title: 'Padronizar preparacao dos veiculos', content: 'virou uma atividade' }),
    nota('qa-nota-outro-ws', { workspace_id: 'outro-workspace-0000', title: 'Segredo do outro espaco', content: 'nao pode vazar' }),
    ...Array.from({ length: nn }, (_, i) => nota('qa-nota-' + i, { title: 'Nota ' + i, content: 'conteudo ' + i })),
  ]
  db.inbox_task_links = [
    { id: 'qa-vinculo', workspace_id: ws, created_by: uid, inbox_item_id: 'qa-com-tarefa', task_id: 'qa-derivada', created_at: agora },
  ]
  localStorage.setItem(KEY, JSON.stringify(db))
  return true
})(${QUANTAS_TAREFAS}, ${QUANTOS_LINKS}, ${QUANTAS_NOTAS})`

let servidor, porta, browser, ctx, page
const medidas = {}

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
    await page.fill('input[type="email"]', 'memoria@agenda360.test')
    await page.fill('input[type="password"]', 'memoria1234')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
}

async function irParaMemoria() {
  await page.goto(`http://127.0.0.1:${porta}/memoria`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
}

const banco = () => page.evaluate(() => localStorage.getItem('agenda360.db.v2'))

// O detalhe e renderizado duas vezes: painel (desktop) e folha (telefone,
// escondida por `lg:hidden`). Os dois ficam no DOM — e o padrao do produto
// inteiro, igual a barra inferior e ao menu pessoal. Nos testes, portanto,
// sempre o VISIVEL: sem `:visible` o seletor acha os dois e o Playwright,
// corretamente, se recusa a adivinhar qual deles a pessoa veria.
const DETALHE = '[data-testid="memoria-detalhe"]:visible'

const titulos = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="memoria-item"]')].map((n) => (n.innerText || '').split('\n')[0].trim()),
  )

async function filtrar(chave) {
  await page.locator(`[data-testid="memoria-filtro-${chave}"]`).click()
  await page.waitForTimeout(250)
}

async function buscar(texto) {
  await page.locator('[data-testid="memoria-busca"]').fill(texto)
  await page.waitForTimeout(300)
  return titulos()
}

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
  if (Object.keys(medidas).length) {
    console.log('\n[UX1.6/C3] PERFORMANCE DA MEMORIA', JSON.stringify({
      volume: { tarefas: QUANTAS_TAREFAS + 2, links: QUANTOS_LINKS + 1, notas: QUANTAS_NOTAS + 7 },
      ...medidas,
    }, null, 2))
  }
})

// ===========================================================================
// A — MEMORIA MOSTRA CONTEUDO (e nao tres atalhos)
// ===========================================================================
describe('A — Memoria agrega as fontes existentes', () => {
  it('abre ja com conteudo real na tela', async () => {
    await irParaMemoria()
    const lista = page.locator('[data-testid="memoria-lista"]')
    expect(await lista.isVisible()).toBe(true)
    expect(await page.locator('[data-testid="memoria-item"]').count()).toBeGreaterThan(10)
  }, 60000)

  it('notas, ideias, checklists e links convivem na MESMA lista', async () => {
    await irParaMemoria()
    const t = (await titulos()).join(' | ')
    expect(t).toMatch(/Padrao de preparacao/i)
    expect(t).toMatch(/Vitrine digital do patio/i)
    expect(t).toMatch(/Lista de conferencia do patio/i)
    expect(t).toMatch(/Relatorio mercado seminovos/i)
  }, 60000)

  it('NAO e mais um hub: nada de "Notas e ideias / Por organizar / Links" como tres atalhos', async () => {
    await irParaMemoria()
    const texto = await page.locator('main').innerText()
    // O antigo hub do C2 tinha estas tres descricoes fixas. Se alguma voltar,
    // a tela regrediu para indice.
    expect(texto).not.toMatch(/O que você anotou para lembrar depois/i)
    expect(texto).not.toMatch(/Capturas que ainda não viraram nada/i)
    expect(texto).not.toMatch(/Endereços salvos com nome/i)
  }, 60000)

  it('nao vaza conteudo de outro workspace', async () => {
    await irParaMemoria()
    expect((await titulos()).join(' | ')).not.toMatch(/Segredo do outro espaco/i)
  }, 60000)

  it('a linha diz o que importa sem repetir o tipo tres vezes', async () => {
    await irParaMemoria()
    const linha = await page.locator('[data-testid="memoria-item"]').first().innerText()
    expect(linha.match(/\bNota\b/gi)?.length ?? 0).toBeLessThanOrEqual(1)
  }, 60000)
})

// ===========================================================================
// B / C — BUSCA
// ===========================================================================
describe('B/C — buscar dentro da Memoria', () => {
  it('encontra pelo TITULO', async () => {
    await irParaMemoria()
    expect((await buscar('garantia')).join(' | ')).toMatch(/Garantia estendida/i)
  }, 60000)

  it('encontra pelo CONTEUDO', async () => {
    await irParaMemoria()
    expect((await buscar('chave reserva')).join(' | ')).toMatch(/Lista de conferencia/i)
  }, 60000)

  it('encontra link por dominio', async () => {
    await irParaMemoria()
    expect((await buscar('carmais')).join(' | ')).toMatch(/Relatorio mercado seminovos/i)
  }, 60000)

  it('encontra o arquivado — guardar nao e apagar', async () => {
    await irParaMemoria()
    expect((await buscar('desconto')).join(' | ')).toMatch(/Politica antiga/i)
  }, 60000)

  it('limpar a busca devolve a lista, sem perder o filtro', async () => {
    await irParaMemoria()
    await filtrar('links')
    const antes = await titulos()
    await buscar('carmais')
    await page.locator('[data-testid="memoria-limpar-busca"]').click()
    await page.waitForTimeout(300)
    expect(await titulos()).toEqual(antes)
    expect(await page.locator('[data-testid="memoria-filtro-links"]').getAttribute('aria-selected')).toBe('true')
  }, 60000)

  it('BUSCAR E LEITURA: nenhum byte do banco muda', async () => {
    await irParaMemoria()
    const antes = await banco()
    await buscar('seminovos')
    await buscar('garantia')
    await buscar('')
    expect(await banco()).toBe(antes)
  }, 60000)
})

// ===========================================================================
// D — FILTROS
// ===========================================================================
describe('D — filtrar e leitura pura', () => {
  it('comeca em "Tudo"', async () => {
    await irParaMemoria()
    expect(await page.locator('[data-testid="memoria-filtro-tudo"]').getAttribute('aria-selected')).toBe('true')
  }, 60000)

  it('"Por organizar" mostra o ESTADO, nao um tipo de conteudo', async () => {
    await irParaMemoria()
    await filtrar('por_organizar')
    const t = (await titulos()).join(' | ')
    expect(t).toMatch(/Padrao de preparacao/i)
    // A ideja ja foi decidida: saiu de Por organizar.
    expect(t).not.toMatch(/Vitrine digital do patio/i)
  }, 60000)

  it('"Ideias" traz o significado; "Links" traz o formato', async () => {
    await irParaMemoria()
    await filtrar('ideias')
    expect((await titulos()).join(' | ')).toMatch(/Vitrine digital do patio/i)
    await filtrar('links')
    const links = (await titulos()).join(' | ')
    expect(links).toMatch(/Relatorio mercado seminovos/i)
    expect(links).not.toMatch(/Padrao de preparacao/i)
  }, 60000)

  it('uma ideia continua sendo uma NOTA (formato != significado)', async () => {
    await irParaMemoria()
    await filtrar('notas')
    expect((await titulos()).join(' | ')).toMatch(/Vitrine digital do patio/i)
  }, 60000)

  it('FILTRAR NAO ALTERA DADOS: nenhum byte do banco muda', async () => {
    await irParaMemoria()
    const antes = await banco()
    for (const f of ['por_organizar', 'notas', 'ideias', 'links', 'tudo']) await filtrar(f)
    expect(await banco()).toBe(antes)
  }, 60000)
})

// ===========================================================================
// E — ABRIR SEM SAIR DE MEMORIA
// ===========================================================================
describe('E — abrir um item', () => {
  it('abre a leitura AO LADO, sem trocar de rota', async () => {
    await irParaMemoria()
    await page.locator('[data-testid="memoria-item"]', { hasText: 'Padrao de preparacao' }).first().click()
    await page.waitForTimeout(350)
    expect(await page.locator(DETALHE).isVisible()).toBe(true)
    expect(new URL(page.url()).pathname).toBe('/memoria')
  }, 60000)

  it('o detalhe mostra o conteudo, nao so o titulo', async () => {
    await irParaMemoria()
    await page.locator('[data-testid="memoria-item"]', { hasText: 'Padrao de preparacao' }).first().click()
    await page.waitForTimeout(350)
    expect(await page.locator(DETALHE).innerText()).toMatch(/checklist unico assinado/i)
  }, 60000)

  it('a lista marca qual item esta aberto', async () => {
    await irParaMemoria()
    await page.locator('[data-testid="memoria-item"]', { hasText: 'Garantia estendida' }).first().click()
    await page.waitForTimeout(300)
    const sel = page.locator('[data-testid="memoria-item"][data-selecionado="sim"]')
    expect(await sel.count()).toBe(1)
    expect(await sel.innerText()).toMatch(/Garantia estendida/i)
  }, 60000)

  it('mostra a relacao com a tarefa derivada, e ela leva a Tarefas', async () => {
    await irParaMemoria()
    await page.locator('[data-testid="memoria-item"]', { hasText: 'Padronizar preparacao dos veiculos' }).first().click()
    await page.waitForTimeout(350)
    const rel = page.locator('[data-testid="memoria-relacoes"]:visible')
    expect(await rel.isVisible()).toBe(true)
    expect(await rel.innerText()).toMatch(/Revisar checklist de preparacao/i)
  }, 60000)

  it('ABRIR NAO ALTERA DADOS: nenhum byte do banco muda', async () => {
    await irParaMemoria()
    const antes = await banco()
    const itens = page.locator('[data-testid="memoria-item"]')
    for (const i of [0, 1, 2]) { await itens.nth(i).click(); await page.waitForTimeout(250) }
    expect(await banco()).toBe(antes)
  }, 60000)

  it('as acoes oferecidas dependem do item: link nao oferece "Tratar como ideia"', async () => {
    await irParaMemoria()
    await filtrar('links')
    await page.locator('[data-testid="memoria-item"]').first().click()
    await page.waitForTimeout(300)
    const d = await page.locator(DETALHE).innerText()
    expect(d).not.toMatch(/Tratar como ideia/i)
    expect(d).toMatch(/Criar tarefa/i)
  }, 60000)

  it('nota por organizar oferece as decisoes simples, sem obrigar', async () => {
    await irParaMemoria()
    await filtrar('por_organizar')
    await page.locator('[data-testid="memoria-item"]').first().click()
    await page.waitForTimeout(300)
    const d = await page.locator(DETALHE).innerText()
    expect(d).toMatch(/Tratar como ideia/i)
    expect(d).toMatch(/Manter como nota/i)
    expect(d).toMatch(/Decida quando quiser/i)
  }, 60000)
})

// ===========================================================================
// H (na tela) — DERIVAR ACAO SEM PERDER O CONTEUDO
// ===========================================================================
describe('derivar uma tarefa sem perder a nota', () => {
  it('cria a tarefa, mantem a nota na lista e passa a mostrar a relacao', async () => {
    await irParaMemoria()
    await buscar('Garantia estendida')
    await page.locator('[data-testid="memoria-item"]').first().click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /^Criar tarefa$/ }).click()
    await page.waitForTimeout(1200)

    // A nota continua.
    expect((await titulos()).join(' | ')).toMatch(/Garantia estendida/i)
    // E a tarefa existe, ligada a ela.
    const estado = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('agenda360.db.v2'))
      const nota = db.inbox_items.find((n) => n.id === 'qa-nota-acento')
      const vinculo = db.inbox_task_links.find((l) => l.inbox_item_id === 'qa-nota-acento')
      const tarefa = vinculo && db.tasks.find((t) => t.id === vinculo.task_id)
      return { nota: !!nota, conteudo: nota?.content, titulo: tarefa?.title, origem: tarefa?.origin }
    })
    expect(estado.nota).toBe(true)
    expect(estado.conteudo).toMatch(/argumento de fechamento/i)
    expect(estado.titulo).toMatch(/Garantia estendida/i)
    expect(estado.origem).toBe('inbox')
  }, 90000)
})

// ===========================================================================
// L / P — COPILOTO CONTEXTUAL NAS QUATRO SUPERFICIES
// ===========================================================================
describe('L/P — a faisca do Copiloto', () => {
  it('existe nas quatro superficies', async () => {
    const onde = [['/', 'hoje'], ['/dia', 'agenda'], ['/tarefas', 'tarefas'], ['/memoria', 'memoria']]
    for (const [rota, superficie] of onde) {
      await page.goto(`http://127.0.0.1:${porta}${rota}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      const b = page.locator(`[data-testid="copiloto-contextual-${superficie}"]`).first()
      expect(await b.count()).toBeGreaterThan(0)
    }
  }, 90000)

  it('abre o Copiloto ja sabendo de onde veio — e sem enviar turno nenhum', async () => {
    await page.goto(`http://127.0.0.1:${porta}/tarefas`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const antes = await banco()
    await page.locator('[data-testid="copiloto-contextual-tarefas"]').first().click()
    await page.waitForTimeout(1200)

    expect(new URL(page.url()).pathname).toBe('/assistente')
    const alvo = page.locator('[data-testid="copiloto-saudacao"]')
    await alvo.waitFor({ state: 'visible', timeout: 15000 })
    expect(await alvo.innerText()).toMatch(/vem primeiro|priorizar|decidir/i)
    // Nada foi perguntado, proposto nem gravado so por abrir.
    expect(await page.locator('[data-testid="copiloto-proposta"]').count()).toBe(0)
    expect(await banco()).toBe(antes)
  }, 90000)

  it('de Memoria, a saudacao cita o item selecionado', async () => {
    await irParaMemoria()
    await buscar('Padrao de preparacao')
    await page.locator('[data-testid="memoria-item"]').first().click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: /Me ajude com isto/i }).click()
    await page.waitForTimeout(1200)
    const saud = page.locator('[data-testid="copiloto-saudacao"]')
    await saud.waitFor({ state: 'visible', timeout: 15000 })
    expect(await saud.innerText()).toMatch(/Padrao de preparacao/i)
  }, 90000)

  it('o Copiloto continua abrindo como conversa pela rota de sempre', async () => {
    // Entrada NOVA, nao um F5 sobre a visita contextual anterior: o state da
    // rota sobrevive ao recarregamento (o navegador guarda a entrada do
    // historico), e isso e o comportamento desejado — recarregar a pagina que
    // voce abriu a partir de uma nota nao deveria apagar de onde voce veio.
    // O que este teste quer medir e outra coisa: chegar ao Copiloto pela porta
    // da frente continua dando a abertura neutra de sempre.
    await page.goto(`http://127.0.0.1:${porta}/config`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(600)
    await page.goto(`http://127.0.0.1:${porta}/assistente`, { waitUntil: 'domcontentloaded' })
    const saud = page.locator('[data-testid="copiloto-saudacao"]')
    await saud.waitFor({ state: 'visible', timeout: 15000 })
    // TRANSIÇÃO — UX1.6: a abertura neutra deixou de explicar o mecanismo
    // ("eu preparo, você confirma") e passou a perguntar, como um mensageiro.
    // O contrato de segurança não mudou: abrir não envia turno nenhum.
    expect(await saud.innerText()).toMatch(/Como posso te ajudar/i)
  }, 60000)
})

// ===========================================================================
// R / S / T — NADA DO QUE JA EXISTIA FOI EMBORA
// ===========================================================================
describe('R — as rotas antigas continuam acessiveis', () => {
  const ROTAS = ['/ideias', '/caixa', '/links', '/assistente', '/relatorios', '/config', '/dia', '/tarefas']
  for (const rota of ROTAS) {
    it(`${rota} continua abrindo`, async () => {
      await page.goto(`http://127.0.0.1:${porta}${rota}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(900)
      expect(new URL(page.url()).pathname).toBe(rota)
      expect((await page.locator('body').innerText()).length).toBeGreaterThan(30)
    }, 60000)
  }

  it('o editor de nota em tela cheia continua sendo o mesmo lugar de escrever', async () => {
    await page.goto(`http://127.0.0.1:${porta}/ideias/qa-nota`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    expect(await page.locator('textarea').first().inputValue()).toMatch(/checklist unico assinado/i)
  }, 60000)
})

describe('S — o C1 continua valendo: a busca global encontra a Memoria', () => {
  it('a paleta ainda encontra uma nota', async () => {
    await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    await page.keyboard.press('Control+k')
    const campo = page.locator('input[placeholder*="Buscar"]')
    await campo.waitFor({ state: 'visible', timeout: 8000 })
    await page.waitForTimeout(400)
    await campo.fill('preparacao')
    await page.waitForTimeout(350)
    const texto = await page.evaluate(() => {
      const raiz = document.querySelector('input[placeholder*="Buscar"]')?.closest('div[class*="fixed"]')
      return raiz ? raiz.innerText : ''
    })
    expect(texto).toMatch(/Guardado/i)
    await page.keyboard.press('Escape')
  }, 60000)
})

describe('T — o C2 continua valendo: quatro destinos', () => {
  it('a barra lateral ainda tem Hoje, Agenda, Tarefas e Memoria', async () => {
    await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    const nav = await page.locator('[data-testid="sidebar"] nav').innerText()
    for (const d of ['Hoje', 'Agenda', 'Tarefas', 'Memória']) expect(nav).toMatch(new RegExp(d))
  }, 60000)

  it('Memoria continua sendo o destino ativo quando se esta nela', async () => {
    await irParaMemoria()
    const ativo = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="sidebar"] a')]
        .filter((a) => a.className.includes('font-semibold'))
        .map((a) => a.textContent.trim()),
    )
    expect(ativo).toContain('Memória')
  }, 60000)
})

// ===========================================================================
// Q — TELEFONE (390x844). LAYOUT, nao "validado no iPhone".
// ===========================================================================
describe('Q — 390x844: lista -> detalhe -> volta ao mesmo contexto', () => {
  let tel

  beforeAll(async () => {
    tel = await ctx.newPage()
    await tel.goto(`http://127.0.0.1:${porta}/memoria`, { waitUntil: 'domcontentloaded' })
    await tel.setViewportSize({ width: 390, height: 844 })
    await tel.waitForTimeout(1200)
  }, 60000)

  afterAll(async () => { await tel?.close() })

  it('a lista e a tela: nao ha painel espremido lado a lado', async () => {
    expect(await tel.locator('[data-testid="memoria-lista"]').isVisible()).toBe(true)
    // Nenhum detalhe VISIVEL enquanto nada foi tocado: em 390px a leitura
    // nunca divide a tela com a lista.
    expect(await tel.locator('[data-testid="memoria-detalhe"]:visible').count()).toBe(0)
  }, 60000)

  it('nada vaza na horizontal', async () => {
    const vaza = await tel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(vaza).toBe(false)
  }, 60000)

  // A folha cobre a tela inteira por definicao. Cada cenario abaixo parte da
  // LISTA, nunca do que o cenario anterior deixou aberto.
  const voltarALista = async () => {
    const fechar = tel.locator('[data-testid="memoria-fechar-detalhe"]:visible')
    if (await fechar.count()) { await fechar.first().click(); await tel.waitForTimeout(400) }
  }

  it('tocar abre o detalhe em folha inteira', async () => {
    await voltarALista()
    await tel.locator('[data-testid="memoria-item"]', { hasText: 'Padrao de preparacao' }).first().click()
    await tel.waitForTimeout(400)
    expect(await tel.locator('[data-testid="memoria-folha"]').isVisible()).toBe(true)
    expect(await tel.locator('[data-testid="memoria-detalhe"]:visible').innerText()).toMatch(/checklist unico/i)
  }, 60000)

  // TRANSIÇÃO — UX1.6: em 390px os cinco filtros deixaram de ser uma fileira
  // de pílulas (que transbordava e comia 44px da dobra) e passaram a ser um
  // seletor: o recorte atual, e um toque para trocar. Mesmo estado, mesmos
  // testids — só que agora a lista de opções precisa ser ABERTA antes.
  const escolherFiltro = async (chave) => {
    await tel.locator('[data-testid="memoria-seletor-filtro"]').click()
    await tel.waitForTimeout(200)
    await tel.locator(`[data-testid="memoria-filtro-${chave}"]:visible`).click()
    await tel.waitForTimeout(250)
  }

  it('voltar devolve o MESMO filtro, a MESMA busca e a MESMA lista', async () => {
    await voltarALista()
    await escolherFiltro('notas')
    await tel.locator('[data-testid="memoria-busca"]').fill('nota 1')
    await tel.waitForTimeout(350)
    const antes = await tel.evaluate(() =>
      [...document.querySelectorAll('[data-testid="memoria-item"]')].map((n) => n.innerText.split('\n')[0]))

    await tel.locator('[data-testid="memoria-item"]').first().click()
    await tel.waitForTimeout(400)
    await tel.locator('[data-testid="memoria-fechar-detalhe"]:visible').first().click()
    await tel.waitForTimeout(400)

    expect(await tel.locator('[data-testid="memoria-busca"]').inputValue()).toBe('nota 1')
    expect(await tel.locator('[data-testid="memoria-seletor-filtro"]').innerText()).toMatch(/Notas/)
    const depois = await tel.evaluate(() =>
      [...document.querySelectorAll('[data-testid="memoria-item"]')].map((n) => n.innerText.split('\n')[0]))
    expect(depois).toEqual(antes)
    expect(new URL(tel.url()).pathname).toBe('/memoria')
  }, 60000)

  it('a barra inferior continua Hoje · Agenda · + · Tarefas · Memoria', async () => {
    await voltarALista()
    const itens = await tel.evaluate(() => {
      const nav = document.querySelector('nav[class*="fixed"][class*="bottom"]') ||
        [...document.querySelectorAll('nav')].find((n) => getComputedStyle(n).position === 'fixed')
      return nav ? [...nav.querySelectorAll('a,button')].map((n) => n.innerText.trim()).filter(Boolean) : []
    })
    expect(itens.join('|')).toMatch(/Hoje/)
    expect(itens.join('|')).toMatch(/Agenda/)
    expect(itens.join('|')).toMatch(/Tarefas/)
    expect(itens.join('|')).toMatch(/Memória/)
  }, 60000)
})

// ===========================================================================
// PERFORMANCE — mesma metodologia e mesmo volume do C3/C1 (15 amostras, p90)
// ===========================================================================
describe('performance da Memoria', () => {
  it('mede abertura, filtragem e busca com volume declarado', async () => {
    const aberturas = [], filtragens = [], buscas = []

    for (let i = 0; i < 15; i += 1) {
      await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(500)
      const t0 = Date.now()
      await page.goto(`http://127.0.0.1:${porta}/memoria`, { waitUntil: 'domcontentloaded' })
      await page.locator('[data-testid="memoria-lista"]').waitFor({ state: 'visible', timeout: 10000 })
      aberturas.push(Date.now() - t0)

      filtragens.push(await page.evaluate(async () => {
        const b = document.querySelector('[data-testid="memoria-filtro-por_organizar"]')
        const inicio = performance.now()
        b.click()
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        return Math.round(performance.now() - inicio)
      }))

      buscas.push(await page.evaluate(async () => {
        const input = document.querySelector('[data-testid="memoria-busca"]')
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set
        const inicio = performance.now()
        setter.call(input, 'seminovos')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        return Math.round(performance.now() - inicio)
      }))
    }

    const ordenado = (a) => [...a].sort((x, y) => x - y)
    const mediana = (a) => ordenado(a)[Math.floor(a.length / 2)]
    const p90 = (a) => ordenado(a)[Math.min(a.length - 1, Math.ceil(a.length * 0.9) - 1)]
    const resumo = (a) => ({ mediana: mediana(a), p90: p90(a), min: Math.min(...a), max: Math.max(...a), amostras: ordenado(a) })
    medidas.abertura_ms = resumo(aberturas)
    medidas.filtragem_ms = resumo(filtragens)
    medidas.busca_ms = resumo(buscas)

    // Sem meta arbitraria: o teste so falha se a tela ficar inutilizavel. O
    // numero registrado acima e o que vale para comparacao.
    expect(mediana(aberturas)).toBeLessThan(5000)
    expect(mediana(filtragens)).toBeLessThan(1000)
    expect(mediana(buscas)).toBeLessThan(1000)
  }, 240000)
})
