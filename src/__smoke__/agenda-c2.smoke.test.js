/* eslint-env node */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { getWeekDays, toISODate, addDays } from '../lib/date'

// ---------------------------------------------------------------------------
// C2 — A INTEGRACAO VISUAL, no build real.
//
// `lib/agendaReal.test.js` prova a TRADUCAO (que distincao vira o que) e
// `lib/agendaGrade.test.js` prova a GEOMETRIA e a paridade com o prototipo.
// Aqui prova-se o que so existe na tela montada: que a interface aprovada esta
// ligada aos dados reais, que as acoes de escrita funcionam, e que nada do que
// ja estava no ar regrediu.
//
// -------------------- DE ONDE VEM O DADO -----------------------------------
//
// NENHUMA LINHA DESTE ARQUIVO TOCA O SUPABASE. Sem `VITE_SUPABASE_URL` no
// build, `services/localStore.js` assume e a persistencia e o localStorage
// deste navegador descartavel — e o mesmo mecanismo que os smokes do produto
// usam desde o CP5.5. As acoes de escrita (concluir) sao exercidas contra ele.
// O banco compartilhado com Production nao e lido nem escrito.
//
// -------------------- O QUE ELE NAO PROVA ----------------------------------
//
// Isto e CHROMIUM com viewport de telefone. O DESLIZE HORIZONTAL da Semana, o
// teclado, `position:fixed`, safe-area, overscroll e a folha inferior do
// Safari/iOS NAO sao reproduzidos. O deslize so e verificado como NAO-
// REGRESSAO estrutural (o gesto esta instalado e os controles explicitos
// existem); confirma-lo continua dependendo do QA humano no iPhone.
//
// O Kanban nao e tocado por este checkpoint e aqui so se verifica que ele
// continua de pe — o drag validado no iPhone em 5049a52 segue congelado.
// ---------------------------------------------------------------------------

const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.txt': 'text/plain' }

const VIEWPORTS = [
  { nome: 'iphone-13-mini', width: 375, height: 812 },
  { nome: 'iphone-14', width: 390, height: 844 },
  { nome: 'iphone-14-plus', width: 430, height: 932 },
]

// Uma carga com um caso de cada DISTINCAO do §3, mais o conflito que a grade
// existe para revelar. Prefixo "C2 " em tudo: se algum dia isto rodar contra
// um banco de verdade por acidente, da para ver de onde veio.
const SEMENTE = `(() => {
  const K = 'agenda360.db.v2'
  const db = JSON.parse(localStorage.getItem(K))
  if (!db) return false
  const ws = db.workspaces[0].id, uid = db.profiles[0].id
  const dia = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const agora = new Date().toISOString()
  const cats = [
    { id: 'c2-cat-op', workspace_id: ws, name: 'Operacao', color: '#7c3aed', created_at: agora },
    { id: 'c2-cat-fin', workspace_id: ws, name: 'Financeiro', color: '#0ea5e9', created_at: agora },
  ]
  db.categories = [...(db.categories || []).filter((c) => !String(c.id).startsWith('c2-')), ...cats]

  const base = { workspace_id: ws, created_by: uid, assignee_id: uid, delegated_by: null, delegated_at: null,
    description: '', link: '', notes: '', alert_enabled: false, alert_type: 'push', alert_minutes_before: 15,
    alert_sent: false, reschedule_count: 0, start_time: null, end_time: null, date: null, origin: 'manual',
    category_id: null, created_at: agora, updated_at: agora, priority: 'medium', status: 'todo' }

  db.tasks = [
    // 1 · compromisso com intervalo (e o destaque de AGORA no Hoje)
    { ...base, id: 'c2-reuniao', title: 'C2 Reuniao com os gerentes', date: dia(0),
      start_time: '09:30', end_time: '10:30', category_id: 'c2-cat-op' },
    // 1 · segundo compromisso que ENCAVALA com o terceiro — o conflito
    { ...base, id: 'c2-diretoria', title: 'C2 Diretoria resultado do trimestre', date: dia(0),
      start_time: '11:00', end_time: '13:00', category_id: 'c2-cat-op' },
    { ...base, id: 'c2-auditoria', title: 'C2 Auditoria externa', date: dia(0),
      start_time: '12:00', end_time: '13:30', category_id: 'c2-cat-fin' },
    // 5 · compromisso com LEMBRETE configurado
    { ...base, id: 'c2-almoco', title: 'C2 Almoco com o cliente', date: dia(0),
      start_time: '14:00', end_time: '15:00', category_id: 'c2-cat-fin',
      alert_enabled: true, alert_minutes_before: 60 },
    // 2 · tarefa com dia planejado e SEM horario
    { ...base, id: 'c2-proposta', title: 'C2 Revisar a proposta', date: dia(0) },
    // 3 · tarefa com horario que NAO e compromisso (o horario reservado)
    { ...base, id: 'c2-contas', title: 'C2 Pagar as contas do mes', date: dia(0),
      start_time: '16:00', alert_enabled: true, alert_minutes_before: 30 },
    // 4 · informacao SEM DATA — nao pode aparecer na Agenda
    { ...base, id: 'c2-ideia', title: 'C2 Ideia sem data nenhuma' },
    // um compromisso em outro dia da semana, para a faixa e o recorte
    { ...base, id: 'c2-vistoria', title: 'C2 Vistoria no patio', date: dia(2),
      start_time: '08:00', end_time: '09:00', category_id: 'c2-cat-op' },
    // uma atrasada, para "Precisa de voce"
    { ...base, id: 'c2-atraso', title: 'C2 Pendencia antiga', date: dia(-3) },
    // cancelada: NAO ocupa a linha do tempo
    { ...base, id: 'c2-cancelada', title: 'C2 Compromisso cancelado', date: dia(0),
      start_time: '10:45', end_time: '11:00', status: 'cancelled' },
  ]
  db.inbox_items = []
  db.inbox_task_links = []
  localStorage.setItem(K, JSON.stringify(db))
  return true
})()`

let servidor, porta, browser

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

// RELOGIO CONGELADO as 09:00 DE HOJE. "Agora" e "a seguir" so existem em
// relacao a um instante; com o relogio do runner, um teste que semeia as 09:30
// passa de manha e falha a noite — e um teste que muda de resultado conforme a
// hora nao e um teste, e um sorteio.
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
    await page.fill('input[type="email"]', 'c2vis@agenda360.test')
    await page.fill('input[type="password"]', 'c2vis12345')
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForTimeout(1800)
  }
  for (let i = 0; i < 4; i += 1) {
    const pular = page.locator('div.fixed.inset-0.z-50').getByRole('button', { name: /^Pular/i })
    if (await pular.count()) { await pular.first().click({ timeout: 5000 }); await page.waitForTimeout(400) } else break
  }
  await page.evaluate(SEMENTE)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1600)
  return { ctx, page }
}

const irPara = async (page, rota) => {
  await page.goto(`http://127.0.0.1:${porta}${rota}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1300)
}

const HOJE = toISODate(new Date())

beforeAll(async () => {
  if (precisaBuildar()) execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' })
  await servir()
  const exec = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  browser = await chromium.launch(fs.existsSync(exec) ? { executablePath: exec } : {})
}, 300000)

afterAll(async () => {
  await browser?.close()
  await new Promise((r) => servidor?.close(r))
})

// ===========================================================================
// A AGENDA, LIGADA AOS DADOS REAIS
// ===========================================================================
describe('Agenda no telefone — a interface aprovada com dado real', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 180000)
  afterAll(async () => { await ctx?.close() })

  it('abre na composicao aprovada, e nao na do desktop', async () => {
    await irPara(page, '/dia')
    expect(await page.locator('[data-testid="am-agenda"]').isVisible()).toBe(true)
    // O seletor de visao e o eixo da tela, e esta sempre visivel.
    for (const v of ['dia', 'semana', 'mes']) {
      expect(await page.locator(`[data-testid="am-visao-${v}"]`).isVisible()).toBe(true)
    }
    // Uma barra de navegacao so: a de baixo, do Layout.
    expect(await page.locator('nav.fixed.inset-x-0.bottom-0').count()).toBe(1)
  }, 90000)

  it('as cinco distincoes do modelo real sobrevivem a traducao', async () => {
    await irPara(page, '/dia')
    const m = await page.evaluate(() => {
      const regua = document.querySelector('[data-testid="dia-timeline"]')?.innerText || ''
      const soltas = document.querySelector('[data-testid="dia-tarefas"]')?.innerText || ''
      return { regua, soltas, tela: document.querySelector('main').innerText }
    })
    // 1 · compromisso com intervalo -> bloco na regua, com o fim REAL
    expect(m.regua).toMatch(/C2 Reuniao com os gerentes/)
    expect(m.regua).toMatch(/at[ée] 10:30/)
    // 2 · tarefa com dia planejado e sem horario -> abaixo da regua, nunca nela
    expect(m.soltas).toMatch(/C2 Revisar a proposta/)
    expect(m.regua).not.toMatch(/C2 Revisar a proposta/)
    // 3 · tarefa com horario que nao e compromisso -> na regua, identificada
    expect(m.regua).toMatch(/C2 Pagar as contas do mes/)
    expect(m.regua).toMatch(/Hor[áa]rio reservado/)
    // 4 · informacao sem data -> NAO aparece na Agenda, em recorte nenhum
    expect(m.tela).not.toMatch(/C2 Ideia sem data nenhuma/)
    // 5 · o lembrete nao inventa um segundo objeto
    expect((m.tela.match(/C2 Almoco com o cliente/g) || []).length).toBe(1)
  }, 90000)

  it('um compromisso cancelado nao ocupa a linha do tempo', async () => {
    await irPara(page, '/dia')
    const regua = await page.locator('[data-testid="dia-timeline"]').innerText()
    expect(regua).not.toMatch(/C2 Compromisso cancelado/)
  }, 60000)

  it('a sobreposicao e DITA, nao escondida', async () => {
    await irPara(page, '/dia')
    expect(await page.locator('main').innerText()).toMatch(/se sobrep[õo]em neste dia/)
  }, 60000)

  it('Semana: sete dias na faixa, tres na grade, e o bloco volta a ser legivel', async () => {
    await irPara(page, '/dia?visao=semana')
    const m = await page.evaluate(() => {
      const blocos = [...document.querySelectorAll('[data-testid="am-bloco"]')]
      const fontes = blocos.map((b) => parseFloat(getComputedStyle(b).fontSize))
      const apoios = [...document.querySelectorAll('[data-testid="am-bloco"] .am-apoio')]
        .map((a) => parseFloat(getComputedStyle(a).fontSize))
      return {
        faixa: document.querySelectorAll('[data-testid^="semana-dia-"]').length,
        colunas: document.querySelectorAll('[data-testid^="am-coluna-"]').length,
        blocos: blocos.length,
        menorFonte: fontes.length ? Math.min(...fontes) : null,
        menorApoio: apoios.length ? Math.min(...apoios) : null,
        menorLargura: blocos.length ? Math.min(...blocos.map((b) => Math.round(b.getBoundingClientRect().width))) : null,
        grade: Boolean(document.querySelector('[data-testid="am-grade"]')),
      }
    })
    expect(m.faixa).toBe(7)
    expect(m.colunas).toBe(3)
    expect(m.grade).toBe(true)
    expect(m.blocos).toBeGreaterThan(0)
    // A REGRA DO UX-M3.1, medida: nunca reduzir a fonte principal para
    // preservar a geometria. 9,5px foi o que reprovou a versao de sete colunas.
    expect(m.menorFonte).toBeGreaterThanOrEqual(14)
    if (m.menorApoio !== null) expect(m.menorApoio).toBeGreaterThanOrEqual(13)
    // E com tres colunas o bloco mais estreito (o escalonado por conflito)
    // continua largo o suficiente para o titulo ser reconhecido antes do toque.
    expect(m.menorLargura).toBeGreaterThan(60)
  }, 90000)

  it('Semana: o HORARIO nunca reticencia — a regra que reprovou a grade de sete colunas', async () => {
    // "09:30–10:…" nao informa nada: o horario e a unica coisa num bloco que
    // nao pode ser cortada. A saida obvia — baixar a fonte ate caber — e
    // exatamente o que o UX-M3.1 proibiu, entao quem cede e a margem (a grade
    // sangra ate a borda). Isto trava as duas pontas: nada cortado E a fonte
    // no piso.
    await irPara(page, '/dia?visao=semana')
    const m = await page.evaluate(() => {
      // Largura NATURAL do texto, por Range: `scrollWidth` devolve o valor ja
      // recortado quando ha `text-overflow: ellipsis`, e nao serve aqui.
      const natural = (el) => {
        const r = document.createRange()
        r.selectNodeContents(el)
        return Math.ceil(r.getBoundingClientRect().width)
      }
      return [...document.querySelectorAll('[data-testid="am-bloco"] .am-apoio')]
        .map((ap) => ({
          texto: ap.textContent,
          fonte: parseFloat(getComputedStyle(ap).fontSize),
          tem: ap.clientWidth,
          precisa: natural(ap),
        }))
    })
    expect(m.length).toBeGreaterThan(0)
    for (const a of m) {
      expect(a.precisa, `"${a.texto}" nao cabe em ${a.tem}px`).toBeLessThanOrEqual(a.tem)
      expect(a.fonte, `"${a.texto}" encolheu a fonte para caber`).toBeGreaterThanOrEqual(13)
    }
  }, 90000)

  it('Semana: a grade e TEMPORAL — altura e duracao, e nao tres listas', async () => {
    await irPara(page, '/dia?visao=semana')
    const m = await page.evaluate(() => {
      const bloco = (t) => [...document.querySelectorAll('[data-testid="am-bloco"]')]
        .find((b) => b.getAttribute('title')?.includes(t))
      const curta = bloco('C2 Reuniao com os gerentes')   // 1h
      const longa = bloco('C2 Diretoria')                  // 2h
      if (!curta || !longa) return null
      return {
        curta: Math.round(curta.getBoundingClientRect().height),
        longa: Math.round(longa.getBoundingClientRect().height),
        curtaTopo: Math.round(curta.getBoundingClientRect().top),
        longaTopo: Math.round(longa.getBoundingClientRect().top),
      }
    })
    expect(m).not.toBeNull()
    // Duas horas ocupam ~o dobro de uma — e e isso que faz a grade mostrar
    // "esta tarde esta livre".
    expect(m.longa).toBeGreaterThan(m.curta * 1.7)
    // E a posicao e cronologica: as 09:30 vem acima das 11:00.
    expect(m.curtaTopo).toBeLessThan(m.longaTopo)
  }, 90000)

  it('Semana: os conflitantes ESCALONAM — os dois continuam visiveis', async () => {
    await irPara(page, '/dia?visao=semana')
    const m = await page.evaluate(() => {
      const bs = [...document.querySelectorAll('[data-testid="am-bloco"]')]
      const a = bs.find((b) => b.getAttribute('title')?.includes('C2 Diretoria'))
      const c = bs.find((b) => b.getAttribute('title')?.includes('C2 Auditoria'))
      if (!a || !c) return null
      const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect()
      return { aEsq: Math.round(ra.left), cEsq: Math.round(rc.left), aLarg: Math.round(ra.width), cLarg: Math.round(rc.width) }
    })
    expect(m).not.toBeNull()
    // O de tras fica a esquerda e o da frente recua: a tira exposta e o que
    // denuncia que ha algo embaixo.
    expect(m.cEsq).toBeGreaterThan(m.aEsq)
    // Nenhum dos dois foi espremido a metade da coluna (a tentativa reprovada).
    expect(m.aLarg).toBeGreaterThan(60)
    expect(m.cLarg).toBeGreaterThan(60)
  }, 90000)

  // --- Aritmetica da janela, para o teste nao depender da data de hoje -----
  //
  // A janela anda UM dia dentro da semana e vira PAGINA (tres dias) na ponta.
  // Qual dos dois vai acontecer se le na propria janela, sem saber que dia e
  // hoje: para frente, so vira pagina quando o ultimo dia visivel e um domingo
  // (isto e, a janela ja e [sex, sab, dom]); para tras, so quando o primeiro e
  // uma segunda.
  const diaISO = (testid) => testid.replace('am-coluna-', '')
  const distancia = (a, b) =>
    Math.round((Date.parse(diaISO(b)) - Date.parse(diaISO(a))) / 864e5)
  const diaDaSemana = (testid) => new Date(`${diaISO(testid)}T12:00:00Z`).getUTCDay()
  const passoEsperado = (janela, delta) => {
    const naPonta = delta > 0
      ? diaDaSemana(janela[2]) === 0  // domingo fecha a semana
      : diaDaSemana(janela[0]) === 1  // segunda abre a semana
    return (naPonta ? 3 : 1) * delta
  }

  it('Semana: os controles explicitos do recorte andam, e o deslize esta instalado', async () => {
    await irPara(page, '/dia?visao=semana')
    const visiveis = () => page.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="am-coluna-"]')].map((c) => c.dataset.testid))
    const antes = await visiveis()
    await page.locator('[data-testid="am-recorte-depois"]').click()
    await page.waitForTimeout(700)
    const depois = await visiveis()
    expect(depois).not.toEqual(antes)

    // TRANSICAO DE CONTRATO — hotfix UX-M3.1. A assercao anterior era:
    //
    //   // A janela andou UM dia: o primeiro de agora era o segundo de antes.
    //   expect(depois[0]).toBe(antes[1])
    //
    // Ela afirmava "um passo, um dia" para QUALQUER dia, usando a data real da
    // execucao — e so era exercitada no dia em que a CI calhasse de rodar. Em
    // 18/10/2026, um domingo, caiu.
    //
    // O comportamento nao e defeito: a janela de tres dias vive DENTRO de uma
    // semana de segunda a domingo, entao [sab, dom, seg-da-proxima] nao cabe no
    // modelo, e na ponta a janela vira PAGINA em vez de deslizar. A tabela de
    // verdade dos sete dias esta em `lib/agendaGrade.test.js`, onde ela roda em
    // milissegundos e nao depende de calendario.
    //
    // O que este teste de NAVEGADOR deve provar e outra coisa: que o controle
    // existe, que ele move a grade e que nada se perde no caminho. E faz isso
    // sem depender do dia, porque deriva o passo esperado da propria janela.
    expect(depois).toHaveLength(3)
    expect(passoEsperado(antes, 1)).toBe(distancia(antes[0], depois[0]))
    // Nada foi pulado: a janela nova comeca, no maximo, no dia seguinte ao
    // ultimo da antiga. E a propriedade que de fato importa para quem navega.
    expect(distancia(antes[2], depois[0])).toBeLessThanOrEqual(1)

    // E volta. O defeito era simetrico — recuar tambem vira pagina nas pontas —
    // e a direcao de tras nao era exercitada aqui.
    await page.locator('[data-testid="am-recorte-antes"]').click()
    await page.waitForTimeout(700)
    const devolta = await visiveis()
    expect(devolta).toHaveLength(3)
    expect(distancia(depois[0], devolta[0])).toBe(passoEsperado(depois, -1))

    // "Hoje" devolve o recorte, e o dia de hoje volta a estar visivel.
    await page.locator('[data-testid="am-recorte-hoje"]').click()
    await page.waitForTimeout(700)
    expect(await visiveis()).toEqual(antes)
    // NAO-REGRESSAO do gesto: o deslize e um ATALHO e os controles sao a
    // garantia. Chromium nao reproduz o gesto do Safari — o que se verifica
    // aqui e que a garantia existe e funciona sem dedo.
    expect(await page.locator('[data-testid="am-recorte-antes"]').isVisible()).toBe(true)
  }, 90000)

  it('Semana: tocar no dia ja escolhido abre o Dia; tocar em outro so reposiciona', async () => {
    await irPara(page, '/dia?visao=semana')
    const outro = toISODate(addDays(new Date(), getWeekDays(new Date()).map(toISODate).indexOf(HOJE) === 6 ? -1 : 1))
    await page.locator(`[data-testid="semana-dia-${outro}"]`).click()
    await page.waitForTimeout(700)
    // Continua na Semana: escolher um dia na faixa nao troca de visao.
    expect(await page.locator('[data-testid="am-grade"]').isVisible()).toBe(true)
    await page.locator(`[data-testid="semana-dia-${outro}"]`).click()
    await page.waitForTimeout(800)
    expect(await page.locator('[data-testid="am-dia-rotulo"]').isVisible()).toBe(true)
  }, 90000)

  it('Mes: pontos para varrer, e a agenda do dia ABAIXO do calendario', async () => {
    await irPara(page, '/dia?visao=mes')
    const m = await page.evaluate(() => {
      const celulas = [...document.querySelectorAll('[data-testid^="mes-dia-"]')]
      const mes = document.querySelector('[data-testid="am-mes"]').getBoundingClientRect()
      const painel = document.querySelector('[data-testid="mes-painel-dia"]').getBoundingClientRect()
      return {
        celulas: celulas.length,
        comPontos: celulas.filter((c) => c.querySelectorAll('.am-ponto-chapado').length > 0).length,
        painelAbaixo: painel.top >= mes.bottom - 2,
        cabeca: [...document.querySelectorAll('[data-testid="am-mes"] span')].slice(0, 7).map((s) => s.textContent),
      }
    })
    expect(m.celulas).toBe(42)
    expect(m.comPontos).toBeGreaterThan(0)
    // O mes continua a vista: escolher um dia nao pode apagar o contexto que
    // motivou a escolha.
    expect(m.painelAbaixo).toBe(true)
    // A semana comeca na SEGUNDA, como em todo o resto do produto.
    expect(m.cabeca[0]).toMatch(/seg/i)
    expect(m.cabeca[6]).toMatch(/dom/i)
    const painel = await page.locator('[data-testid="mes-painel-dia"]').innerText()
    expect(painel).toMatch(/C2 Reuniao com os gerentes/)
    expect(painel).toMatch(/C2 Revisar a proposta/)
  }, 90000)

  it('Mes: escolher outro dia troca o painel e leva o calendario junto', async () => {
    await irPara(page, '/dia?visao=mes')
    const outro = toISODate(addDays(new Date(), 2))
    await page.locator(`[data-testid="mes-dia-${outro}"]`).click()
    await page.waitForTimeout(700)
    const painel = await page.locator('[data-testid="mes-painel-dia"]').innerText()
    expect(painel).toMatch(/C2 Vistoria no patio/)
    expect(painel).not.toMatch(/C2 Reuniao com os gerentes/)
  }, 90000)

  it('a INVARIANTE: nada some entre Dia, Semana e Mes', async () => {
    for (const rota of ['/dia', '/dia?visao=semana', '/dia?visao=mes']) {
      await irPara(page, rota)
      const t = await page.locator('main').innerText()
      expect(t, `${rota} perdeu o compromisso`).toMatch(/C2 Reuniao com os gerentes/)
      expect(t, `${rota} perdeu a tarefa do dia`).toMatch(/C2 Revisar a proposta/)
      expect(t, `${rota} deixou vazar um item sem data`).not.toMatch(/C2 Ideia sem data nenhuma/)
    }
  }, 120000)

  it('os parametros de rota continuam valendo: ?visao= e ?dia=', async () => {
    await irPara(page, '/dia?visao=semana')
    expect(await page.locator('[data-testid="am-visao-semana"]').getAttribute('aria-selected')).toBe('true')
    await irPara(page, '/dia?visao=mes')
    expect(await page.locator('[data-testid="am-visao-mes"]').getAttribute('aria-selected')).toBe('true')
    // ?date= e o parametro do produto…
    const outro = toISODate(addDays(new Date(), 2))
    await irPara(page, `/dia?date=${outro}`)
    expect(await page.locator('[data-testid="dia-timeline"]').innerText()).toMatch(/C2 Vistoria no patio/)
    // …e ?dia= e aceito como apelido dele, para nenhum link salvo quebrar.
    await irPara(page, `/dia?dia=${outro}`)
    expect(await page.locator('[data-testid="dia-timeline"]').innerText()).toMatch(/C2 Vistoria no patio/)
  }, 120000)

  it('abrir um objeto abre o EDITOR do produto, com edicao, alerta e exclusao', async () => {
    await irPara(page, '/dia')
    await page.locator('[data-testid="am-evento"]').first().click()
    await page.waitForTimeout(800)
    const modal = page.getByRole('dialog')
    expect(await modal.count()).toBeGreaterThan(0)
    const t = await modal.first().innerText()
    // E o editor do PRODUTO, aberto em modo de edicao sobre a atividade certa.
    // O titulo mora num <input>, e nao no texto do modal — por isso ele e lido
    // pelo valor do campo, que e tambem onde a pessoa o edita.
    expect(t).toMatch(/Editar compromisso/i)
    const titulo = await modal.first().getByPlaceholder(/Título da atividade/i).inputValue()
    expect(titulo).toMatch(/C2 Reuniao com os gerentes/)
    // As funcoes que o editor real guarda e que uma folha propria perderia.
    expect(t).toMatch(/Excluir/i)
    expect(t).toMatch(/Avisar|Aviso|Alerta/i)
    expect(t).toMatch(/Status/i)
  }, 90000)

  it('ESCRITA, contra o servico simulado: concluir uma tarefa do dia a resolve', async () => {
    await irPara(page, '/dia')
    const soltas = page.locator('[data-testid="dia-tarefas"]')
    expect(await soltas.innerText()).toMatch(/C2 Revisar a proposta/)
    await soltas.locator('[data-testid="am-concluir"]').first().click()
    await page.waitForTimeout(1500)
    // Ela sai da lista de "a fazer" do dia — a regra de `semHorarioDoDia`.
    const depois = await page.locator('main').innerText()
    expect(depois).not.toMatch(/C2 Revisar a proposta/)
    // E PERSISTE: a mudanca foi para o servico, nao so para o estado da tela.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1600)
    expect(await page.locator('main').innerText()).not.toMatch(/C2 Revisar a proposta/)
    // devolve ao estado anterior para nao contaminar os testes seguintes
    await page.evaluate(() => {
      const K = 'agenda360.db.v2'
      const db = JSON.parse(localStorage.getItem(K))
      const t = db.tasks.find((x) => x.id === 'c2-proposta')
      if (t) t.status = 'todo'
      localStorage.setItem(K, JSON.stringify(db))
    })
  }, 120000)

  it('dia vazio e uma frase, nao um erro', async () => {
    const longe = toISODate(addDays(new Date(), 120))
    await irPara(page, `/dia?date=${longe}`)
    const t = await page.locator('main').innerText()
    expect(t).toMatch(/Nada marcado neste dia/i)
    expect(t).not.toMatch(/erro|falha/i)
  }, 90000)

  it('nenhuma das tres visoes empurra o body na horizontal', async () => {
    for (const rota of ['/dia', '/dia?visao=semana', '/dia?visao=mes']) {
      await irPara(page, rota)
      const x = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth + 1)
      expect(x, `${rota} nao pode empurrar o body`).toBe(false)
    }
  }, 120000)
})

// ===========================================================================
// HOJE — a mesma derivacao, a superficie aprovada
// ===========================================================================
describe('Hoje no telefone — as superficies do UX-M2 com dado real', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 180000)
  afterAll(async () => { await ctx?.close() })

  it('as tres superficies existem, com funcoes e cores diferentes', async () => {
    await irPara(page, '/')
    const m = await page.evaluate(() => {
      const fundo = (s) => {
        const el = document.querySelector(s)
        return el ? getComputedStyle(el).backgroundColor : null
      }
      return {
        agora: fundo('[data-testid="hoje-agora"]'),
        decisoes: fundo('[data-testid="hoje-atencao"]'),
        atmosfera: Boolean(document.querySelector('.am-fundo')),
        saudacao: parseInt(getComputedStyle(document.querySelector('[data-testid="hoje-mobile"] h1')).fontSize, 10),
      }
    })
    // A lavanda do proximo compromisso e a branca das decisoes nao podem ser a
    // mesma cor: e a diferenca que as faz tres pecas em vez de uma lista.
    expect(m.agora).not.toBe(m.decisoes)
    expect(m.atmosfera).toBe(true)
    // A saudacao e o maior texto da tela e o unico elemento editorial.
    expect(m.saudacao).toBeGreaterThanOrEqual(28)
  }, 90000)

  it('o dado e o real, e a deduplicacao do produto continua valendo', async () => {
    await irPara(page, '/')
    const agora = await page.locator('[data-testid="hoje-agora"]').innerText()
    expect(agora).toMatch(/C2 Reuniao com os gerentes/)
    // UM ITEM, UM LUGAR: o destaque nao se repete na linha do dia.
    const linhas = (await page.locator('[data-testid="hoje-linha"]').allInnerTexts()).join(' | ')
    expect(linhas).not.toMatch(/C2 Reuniao com os gerentes/)
    expect(linhas).toMatch(/C2 Revisar a proposta/)
    // E a atrasada e EXCECAO, com evidencia — nao mais um numero.
    expect(await page.locator('[data-testid="hoje-atencao"]').innerText()).toMatch(/C2 Pendencia antiga/)
  }, 90000)

  it('a sugestao fecha a composicao, e nao grava nada sozinha', async () => {
    await irPara(page, '/')
    const sug = page.locator('[data-testid="hoje-sugestao"]')
    if (!(await sug.count())) return
    const ordem = await page.evaluate(() => {
      const y = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? null
      return { agora: y('[data-testid="hoje-agora"]'), sugestao: y('[data-testid="hoje-sugestao"]') }
    })
    expect(ordem.sugestao).toBeGreaterThan(ordem.agora)
    await sug.getByRole('button', { name: /^Reservar$/ }).click()
    await page.waitForTimeout(1200)
    // "Reservar" LEVA A CONVERSA. Nada e gravado antes da confirmacao.
    expect(page.url()).toMatch(/assistente/)
  }, 90000)
})

// ===========================================================================
// LARGURAS, TEMAS E NAO-REGRESSAO
// ===========================================================================
describe('375 / 390 / 430, claro e escuro', () => {
  for (const vp of VIEWPORTS) {
    for (const tema of ['light', 'dark']) {
      it(`${vp.nome} ${tema}: as tres visoes e o Hoje se montam sem estourar`, async () => {
        const { ctx, page } = await abrir(vp, tema)
        try {
          for (const rota of ['/', '/dia', '/dia?visao=semana', '/dia?visao=mes']) {
            await irPara(page, rota)
            const m = await page.evaluate(() => ({
              estoura: document.body.scrollWidth > document.body.clientWidth + 1,
              fundoCorpo: getComputedStyle(document.body).backgroundColor,
              vazio: document.querySelector('main').innerText.trim().length < 20,
            }))
            expect(m.estoura, `${rota} empurrou o body`).toBe(false)
            expect(m.vazio, `${rota} montou vazia`).toBe(false)
            expect(m.fundoCorpo).not.toBe('rgba(0, 0, 0, 0)')
          }
          // A grade da Semana nunca reduz a fonte para caber nesta largura.
          await irPara(page, '/dia?visao=semana')
          const fonte = await page.evaluate(() => {
            const b = document.querySelector('[data-testid="am-bloco"]')
            return b ? parseFloat(getComputedStyle(b).fontSize) : null
          })
          if (fonte !== null) expect(fonte, `${vp.nome} reduziu a fonte do bloco`).toBeGreaterThanOrEqual(14)
        } finally {
          await ctx.close()
        }
      }, 180000)
    }
  }
})

describe('nao-regressao', () => {
  let ctx, page
  beforeAll(async () => { ({ ctx, page } = await abrir(VIEWPORTS[1])) }, 180000)
  afterAll(async () => { await ctx?.close() })

  it('o Kanban continua de pe, e intocado por este checkpoint', async () => {
    await irPara(page, '/tarefas?visao=semana')
    await page.waitForTimeout(900)
    const m = await page.evaluate(() => ({
      quadro: Boolean(document.querySelector('[data-testid="board"], [data-testid^="board-"]')),
      texto: document.querySelector('main').innerText,
    }))
    expect(m.texto.length).toBeGreaterThan(20)
    expect(m.texto).not.toMatch(/Algo deu errado|erro inesperado/i)
  }, 90000)

  it('o desktop da Agenda nao foi tocado: acima de lg continua a arvore antiga', async () => {
    const grande = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await grande.newPage()
    try {
      await p.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(1400)
      if (await p.locator('input[type="email"]').count()) {
        await p.fill('input[type="email"]', 'c2vis@agenda360.test')
        await p.fill('input[type="password"]', 'c2vis12345')
        await p.getByRole('button', { name: /Entrar/i }).click()
        await p.waitForTimeout(1800)
      }
      await p.evaluate(SEMENTE)
      await p.goto(`http://127.0.0.1:${porta}/dia`, { waitUntil: 'domcontentloaded' })
      await p.waitForTimeout(1600)
      const t = await p.locator('main').innerText()
      // Os rotulos do desktop, que a composicao do telefone nao tem mais.
      expect(t).toMatch(/Compromissos/i)
      expect(t).toMatch(/Tarefas do dia/i)
      // E a composicao do telefone NAO esta montada aqui.
      expect(await p.locator('[data-testid="am-agenda"]').count()).toBe(0)
    } finally {
      await grande.close()
    }
  }, 120000)

  it('o prototipo continua existindo e continua fechado por padrao', async () => {
    await irPara(page, '/prototipo/agenda')
    // Sem VITE_PROTOTIPO=true no build, o portao esta fechado e a rota devolve
    // para a raiz. C2 nao mexeu no portao.
    expect(new URL(page.url()).pathname).toBe('/')
  }, 60000)
})
