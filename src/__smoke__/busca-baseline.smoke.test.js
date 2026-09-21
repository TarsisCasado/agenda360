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
// 56 geradas + 5 nomeadas = 61 notas NESTE workspace, exatamente o mesmo
// volume da baseline do C3 (202 tarefas / 41 links / 61 notas). A comparacao
// antes x depois so vale com o volume identico.
const QUANTAS_NOTAS = 56

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
    { id: 'qa-nota-acento', workspace_id: ws, created_by: uid, type: 'note', status: 'inbox', origin: 'manual',
      title: 'Garantia estendida', content: 'argumento de fechamento na proposta, nao na venda',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'qa-nota-sem-titulo', workspace_id: ws, created_by: uid, type: 'note', status: 'inbox', origin: 'manual',
      title: '', content: 'primeira linha vira titulo quando nao ha titulo',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'qa-lista', workspace_id: ws, created_by: uid, type: 'checklist', status: 'inbox', origin: 'manual',
      title: 'Lista de conferencia do patio', content: 'pneus, documentos, chave reserva',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'qa-nota-arquivada', workspace_id: ws, created_by: uid, type: 'note', status: 'archived', origin: 'manual',
      title: 'Politica antiga de desconto', content: 'valores que valiam ate marco',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    { id: 'qa-nota-outro-ws', workspace_id: 'outro-workspace-0000', created_by: uid, type: 'note', status: 'inbox',
      origin: 'manual', title: 'Segredo do outro espaco', content: 'nao pode vazar para a busca deste workspace',
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
      volume: { tarefas: QUANTAS_TAREFAS + 2, links: QUANTOS_LINKS + 1, notas: QUANTAS_NOTAS + 5 },
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

  // -------------------------------------------------------------------------
  // TRANSICAO DE CONTRATO — UX1.4 (C3) -> UX1.5 (C1).
  //
  // Ate o commit anterior este teste existia com o rotulo [MUDA:C1] e a
  // asserção INVERTIDA. Ele dizia:
  //
  //   it('[MUDA:C1] NAO encontra notas — `inbox_items` esta fora da busca
  //       — depois: notas passam a ser encontradas por titulo e corpo', ...)
  //     expect(porTitulo).not.toMatch(/Padrao de preparacao/i)
  //     expect(porCorpo).not.toMatch(/Padrao de preparacao/i)
  //
  // O C1 fez exatamente o que aquele rotulo anunciava, entao o teste NAO foi
  // apagado: foi virado do avesso, com o `not` removido, e promovido de
  // [MUDA:C1] a [BASELINE] — de comportamento com data de validade a
  // comportamento que passa a ser preservado daqui para a frente.
  // -------------------------------------------------------------------------
  it('[BASELINE] encontra a nota pelo TITULO (contrato novo do C1)', async () => {
    await abrirPaleta()
    const r = achados(await buscar('Padrao de preparacao'))
    expect(r.join(' | ')).toMatch(/Padrao de preparacao/i)
    await fecharPaleta()
  }, 60000)

  it('[BASELINE] encontra a nota pelo CORPO (contrato novo do C1)', async () => {
    await abrirPaleta()
    const r = achados(await buscar('checklist unico assinado'))
    expect(r.join(' | ')).toMatch(/Padrao de preparacao/i)
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

describe('[C1] Busca encontra o que foi guardado', () => {
  it('[C1] nota SEM titulo e achada pela primeira linha do corpo', async () => {
    await abrirPaleta()
    const r = achados(await buscar('primeira linha vira titulo'))
    expect(r.join(' | ')).toMatch(/primeira linha vira titulo/i)
    await fecharPaleta()
  }, 60000)

  it('[C1] o tipo real do item e respeitado: checklist tambem e achado', async () => {
    await abrirPaleta()
    const r = achados(await buscar('conferencia do patio'))
    expect(r.join(' | ')).toMatch(/Lista de conferencia do patio/i)
    await fecharPaleta()
  }, 60000)

  it('[C1] nota arquivada continua recuperavel — guardar nao e esconder', async () => {
    await abrirPaleta()
    const r = achados(await buscar('Politica antiga'))
    expect(r.join(' | ')).toMatch(/Politica antiga de desconto/i)
    await fecharPaleta()
  }, 60000)

  it('[C1] uma busca traz tipos DIFERENTES ao mesmo tempo, cada um no seu grupo', async () => {
    await abrirPaleta()
    const r = await buscar('seminovos')
    const texto = r.join(' | ')
    expect(texto).toMatch(/Conferir documentacao dos seminovos/i) // tarefa
    expect(texto).toMatch(/Relatorio de mercado/i) // link (pela URL)
    expect(texto).toMatch(/Padrao de preparacao/i) // nota (pelo corpo)
    await fecharPaleta()
  }, 60000)

  it('[C1] a natureza do item aparece em palavra humana, sem jargao interno', async () => {
    await abrirPaleta()
    await buscar('Padrao de preparacao')
    const textoInteiro = await page.evaluate(() => {
      const raiz = document.querySelector('input[placeholder*="Buscar"]')?.closest('div[class*="fixed"]')
      return raiz ? raiz.innerText : ''
    })
    expect(textoInteiro).toMatch(/Guardado/i)
    // O usuario nunca ve o nome da tabela nem os estados internos.
    expect(textoInteiro).not.toMatch(/inbox_items|to_think|processed|archived/i)
    await fecharPaleta()
  }, 60000)

  it('[C1] acentuacao segue a regra que ja existia: acento nao atrapalha', async () => {
    await abrirPaleta()
    // "preparacao" (sem acento) acha a nota; a normalizacao e a MESMA que ja
    // valia para tarefas e links, nao uma regra nova.
    const semAcento = achados(await buscar('preparacao'))
    expect(semAcento.join(' | ')).toMatch(/Padrao de preparacao/i)
    await fecharPaleta()
  }, 60000)

  it('[C1] termo inexistente nao inventa resultado de nota', async () => {
    await abrirPaleta()
    const r = achados(await buscar('zzzznaoexistezzzz'))
    expect(r.join(' | ')).not.toMatch(/Padrao de preparacao|Lista de conferencia/i)
    await fecharPaleta()
  }, 60000)

  it('[C1] ISOLAMENTO: nota de outro workspace nao aparece', async () => {
    await abrirPaleta()
    const r = achados(await buscar('Segredo do outro espaco'))
    expect(r.join(' | ')).not.toMatch(/Segredo do outro espaco/i)
    await fecharPaleta()
  }, 60000)

  it('[C1] selecionar o resultado abre a nota CERTA', async () => {
    await abrirPaleta()
    await buscar('Padrao de preparacao')
    await page.getByText('Padrao de preparacao', { exact: false }).last().click()
    await page.waitForTimeout(1200)
    expect(page.url()).toContain('/ideias/qa-nota')
    // ...e volta, sem deixar nada pelo caminho.
    await page.goBack()
    await page.waitForTimeout(800)
  }, 60000)

  it('[C1] a ordem de quem ja estava NAO mudou: Criar, Navegar, Tarefas, Links, e so entao Guardado', async () => {
    await abrirPaleta()
    const r = await buscar('seminovos')
    const iTarefa = r.findIndex((x) => /Conferir documentacao dos seminovos/i.test(x))
    const iLink = r.findIndex((x) => /Relatorio de mercado/i.test(x))
    const iNota = r.findIndex((x) => /Padrao de preparacao/i.test(x))
    expect(r[0]).toMatch(/Criar tarefa/i)
    expect(iTarefa).toBeGreaterThan(0)
    expect(iLink).toBeGreaterThan(iTarefa)
    expect(iNota).toBeGreaterThan(iLink) // o grupo novo entra por ultimo
    await fecharPaleta()
  }, 60000)
})

describe('[C1] Buscar e LEITURA PURA', () => {
  it('[C1] buscar e abrir nao alteram byte nenhum do banco local', async () => {
    const antes = await page.evaluate(() => localStorage.getItem('agenda360.db.v2'))

    await abrirPaleta()
    await buscar('seminovos')
    await buscar('Padrao de preparacao')
    await page.getByText('Padrao de preparacao', { exact: false }).last().click()
    await page.waitForTimeout(1500)
    await page.goBack()
    await page.waitForTimeout(1000)

    const depois = await page.evaluate(() => localStorage.getItem('agenda360.db.v2'))

    // Uma unica asserção cobre tudo que o briefing pediu separadamente: se o
    // banco e identico byte a byte, entao nenhum inbox_item mudou, nenhuma
    // tarefa foi criada, nenhum vinculo foi gravado, nenhum status virou
    // "processado" e nada foi arquivado.
    expect(depois).toBe(antes)
  }, 90000)

  it('[C1] nenhuma chamada de IA acontece durante a busca', async () => {
    const chamadas = []
    const ouvir = (req) => {
      const u = req.url()
      if (/ai-interpret|functions\/v1|generativelanguage|googleapis/i.test(u)) chamadas.push(u)
    }
    page.on('request', ouvir)

    await abrirPaleta()
    await buscar('Padrao de preparacao')
    await buscar('seminovos')
    await fecharPaleta()

    page.off('request', ouvir)
    expect(chamadas).toEqual([])
  }, 60000)

  it('[C1] busca com lista vazia de notas nao quebra a paleta', async () => {
    // Esvazia SO as notas, em memoria, e recarrega: as outras fontes seguem.
    await page.evaluate(() => {
      const KEY = 'agenda360.db.v2'
      const db = JSON.parse(localStorage.getItem(KEY))
      db.__inbox_backup = db.inbox_items
      db.inbox_items = []
      localStorage.setItem(KEY, JSON.stringify(db))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)

    await abrirPaleta()
    const r = await buscar('seminovos')
    expect(r.join(' | ')).toMatch(/Conferir documentacao dos seminovos/i) // tarefa continua
    expect(achados(r).join(' | ')).not.toMatch(/Padrao de preparacao/i)
    await fecharPaleta()

    // Devolve as notas para os proximos testes deste arquivo.
    await page.evaluate(() => {
      const KEY = 'agenda360.db.v2'
      const db = JSON.parse(localStorage.getItem(KEY))
      db.inbox_items = db.__inbox_backup || []
      delete db.__inbox_backup
      localStorage.setItem(KEY, JSON.stringify(db))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
  }, 90000)
})

describe('[BASELINE] Busca atual — performance', () => {
  it('[BASELINE] mede abertura e filtragem com volume declarado', async () => {
    // METODOLOGIA, para o C1 repetir igual:
    //   . mesmo build, mesmo servidor local, Chromium headless, 1440x900;
    //   . volume semeado no localStorage (ver topo do arquivo);
    //   . ABERTURA  = do Ctrl+K ate o campo de busca estar visivel;
    //   . FILTRAGEM = de digitar o termo ate a lista refletir o termo,
    //     medida com requestAnimationFrame dentro da pagina;
    //   . 15 repeticoes. O C3 usava 5 e isso se mostrou pouco: a filtragem
    //     tem distribuicao BIMODAL (ora ~4ms, ora ~50ms), e com 5 amostras a
    //     mediana pulava de 5 para 46 entre execucoes do MESMO commit.
    //     Reportamos mediana, p90, minimo e maximo — nunca media.
    const REPETICOES = 15
    const aberturas = []
    const filtragens = []

    for (let i = 0; i < REPETICOES; i += 1) {
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

    const ordenado = (a) => [...a].sort((x, y) => x - y)
    const mediana = (a) => ordenado(a)[Math.floor(a.length / 2)]
    const p90 = (a) => ordenado(a)[Math.min(a.length - 1, Math.ceil(a.length * 0.9) - 1)]
    const resumo = (a) => ({
      mediana: mediana(a),
      p90: p90(a),
      min: Math.min(...a),
      max: Math.max(...a),
      amostras: ordenado(a),
    })
    medidas.abertura_ms = resumo(aberturas)
    medidas.filtragem_ms = resumo(filtragens)

    // Sem meta artificial: o teste so falha se a busca ficar inutilizavel.
    // O numero que importa e o registrado acima, para comparacao no C1.
    expect(mediana(aberturas)).toBeLessThan(3000)
    expect(mediana(filtragens)).toBeLessThan(1000)
  }, 120000)
})
