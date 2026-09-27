import { describe, it, expect } from 'vitest'
import {
  agregarMemoria,
  aplicarFiltro,
  buscarMemoria,
  listarMemoria,
  legendaDoItem,
  acoesDoItem,
  dominio,
  quandoGuardado,
  FORMATO,
  SIGNIFICADO,
  ORGANIZACAO,
} from './memoria'

// ---------------------------------------------------------------------------
// Fixtures com a FORMA REAL das tabelas (inbox_items / links). Nenhum campo
// inventado: se um teste precisasse de coluna que nao existe, isso seria sinal
// de que a experiencia exige migration — e o checkpoint mandaria parar.
// ---------------------------------------------------------------------------
const nota = (over = {}) => ({
  id: 'n1',
  type: 'note',
  title: 'Notas da reunião com os gerentes',
  content: 'Trechos da reunião sobre preparação dos veículos',
  status: 'inbox',
  origin: 'manual',
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
  ...over,
})

const link = (over = {}) => ({
  id: 'l1',
  url: 'https://carmais.com.br/relatorio',
  title: 'Relatório mercado seminovos',
  note: '',
  task_id: null,
  created_at: '2026-09-15T10:00:00Z',
  ...over,
})

describe('memoria — agregacao (A: as fontes existentes viram uma lista so)', () => {
  it('junta inbox_items e links num unico conjunto', () => {
    const itens = agregarMemoria({ notas: [nota()], links: [link()] })
    expect(itens).toHaveLength(2)
    expect(itens.map((i) => i.fonte).sort()).toEqual(['inbox_items', 'links'])
  })

  it('ordena por recencia, mais recente primeiro', () => {
    const itens = agregarMemoria({
      notas: [nota({ id: 'velha', updated_at: '2026-01-01T00:00:00Z' })],
      links: [link({ id: 'novo', created_at: '2026-09-21T00:00:00Z' })],
    })
    expect(itens[0].origemId).toBe('novo')
  })

  it('preserva o id da linha original em cada item', () => {
    const [n] = agregarMemoria({ notas: [nota({ id: 'abc' })] })
    expect(n.origemId).toBe('abc')
    expect(n.id).toBe('nota:abc')
    expect(n.origem.id).toBe('abc')
  })
})

describe('memoria — formato != significado != estado', () => {
  it('nota na caixa e POR ORGANIZAR, sem significado decidido', () => {
    const [i] = agregarMemoria({ notas: [nota({ status: 'inbox' })] })
    expect(i.organizacao).toBe(ORGANIZACAO.POR_ORGANIZAR)
    expect(i.significado).toBeNull()
    expect(i.formato).toBe(FORMATO.NOTA)
  })

  it('"Para pensar" (to_think) e o significado IDEIA, nao um estado de organizacao', () => {
    const [i] = agregarMemoria({ notas: [nota({ status: 'to_think' })] })
    expect(i.significado).toBe(SIGNIFICADO.IDEIA)
    expect(i.organizacao).toBe(ORGANIZACAO.ORGANIZADO)
  })

  it('checklist e FORMATO, e nao muda o estado nem o significado', () => {
    const [i] = agregarMemoria({ notas: [nota({ type: 'checklist', status: 'inbox' })] })
    expect(i.formato).toBe(FORMATO.CHECKLIST)
    expect(i.organizacao).toBe(ORGANIZACAO.POR_ORGANIZAR)
  })

  it('arquivado e eixo proprio: continua com formato e significado', () => {
    const [i] = agregarMemoria({ notas: [nota({ status: 'archived' })] })
    expect(i.arquivado).toBe(true)
    expect(i.formato).toBe(FORMATO.NOTA)
  })

  it('link e referencia; o modelo atual nao tem onde guardar "por organizar" de link', () => {
    const [i] = agregarMemoria({ links: [link()] })
    expect(i.significado).toBe(SIGNIFICADO.REFERENCIA)
    expect(i.organizacao).toBe(ORGANIZACAO.ORGANIZADO)
  })
})

describe('memoria — relacao com acao (I: origem -> tarefa recuperavel)', () => {
  it('le o vinculo inbox_task_links que ja existe', () => {
    const itens = agregarMemoria({
      notas: [nota({ id: 'n9' })],
      vinculos: { n9: { task_id: 't1' } },
    })
    expect(itens[0].tarefasRelacionadas).toEqual(['t1'])
  })

  it('le links.task_id que ja existe', () => {
    const [i] = agregarMemoria({ links: [link({ task_id: 't2' })] })
    expect(i.tarefasRelacionadas).toEqual(['t2'])
  })

  it('sem vinculo, a lista de tarefas e vazia (nunca undefined)', () => {
    const [i] = agregarMemoria({ notas: [nota()] })
    expect(i.tarefasRelacionadas).toEqual([])
  })
})

describe('memoria — filtros (D: filtrar e leitura)', () => {
  const base = agregarMemoria({
    notas: [
      nota({ id: 'caixa', status: 'inbox' }),
      nota({ id: 'ideia', status: 'to_think' }),
      nota({ id: 'guardada', status: 'archived' }),
      nota({ id: 'pronta', status: 'processed' }),
    ],
    links: [link({ id: 'ref' })],
  })

  it('Tudo mostra o que nao esta arquivado', () => {
    const ids = aplicarFiltro(base, 'tudo').map((i) => i.origemId)
    expect(ids.sort()).toEqual(['caixa', 'ideia', 'pronta', 'ref'])
  })

  it('Por organizar traz so o estado, nao um tipo de conteudo', () => {
    expect(aplicarFiltro(base, 'por_organizar').map((i) => i.origemId)).toEqual(['caixa'])
  })

  it('Notas e recorte de FORMATO: a ideia continua sendo uma nota', () => {
    const ids = aplicarFiltro(base, 'notas').map((i) => i.origemId)
    expect(ids).toContain('ideia')
    expect(ids).toContain('caixa')
    expect(ids).not.toContain('ref')
  })

  it('Ideias traz o significado', () => {
    expect(aplicarFiltro(base, 'ideias').map((i) => i.origemId)).toEqual(['ideia'])
  })

  it('Links traz o formato', () => {
    expect(aplicarFiltro(base, 'links').map((i) => i.origemId)).toEqual(['ref'])
  })

  it('filtrar NAO altera a colecao de origem', () => {
    const copia = JSON.parse(JSON.stringify(base))
    aplicarFiltro(base, 'por_organizar')
    aplicarFiltro(base, 'ideias')
    expect(JSON.parse(JSON.stringify(base))).toEqual(copia)
  })
})

describe('memoria — busca (B: titulo / C: conteudo)', () => {
  const base = agregarMemoria({
    notas: [
      nota({ id: 'n1', title: 'Contrato da locadora', content: 'ver com jurídico' }),
      nota({ id: 'n2', title: '', content: 'Padronizar preparação dos veículos' }),
    ],
    links: [link({ id: 'l1', title: 'Relatório mercado seminovos' })],
  })

  it('encontra por titulo', () => {
    expect(buscarMemoria(base, 'contrato').map((i) => i.origemId)).toEqual(['n1'])
  })

  it('encontra por conteudo', () => {
    expect(buscarMemoria(base, 'jurídico').map((i) => i.origemId)).toEqual(['n1'])
  })

  it('encontra sem acento e sem caixa (mesma normalizacao do C1)', () => {
    expect(buscarMemoria(base, 'JURIDICO').map((i) => i.origemId)).toEqual(['n1'])
    expect(buscarMemoria(base, 'preparacao').map((i) => i.origemId)).toEqual(['n2'])
  })

  it('encontra link por dominio', () => {
    expect(buscarMemoria(base, 'carmais').map((i) => i.origemId)).toEqual(['l1'])
  })

  it('consulta vazia devolve tudo, sem reordenar', () => {
    expect(buscarMemoria(base, '   ')).toEqual(base)
  })

  it('buscar NAO altera a colecao de origem', () => {
    const copia = JSON.parse(JSON.stringify(base))
    buscarMemoria(base, 'contrato')
    expect(JSON.parse(JSON.stringify(base))).toEqual(copia)
  })
})

describe('memoria — busca dentro do filtro', () => {
  const base = agregarMemoria({
    notas: [nota({ id: 'n1', title: 'Contrato', status: 'inbox' })],
    links: [link({ id: 'l1', title: 'Contrato modelo' })],
  })

  it('o filtro continua valendo durante a busca', () => {
    const r = listarMemoria(base, { filtro: 'links', consulta: 'contrato' })
    expect(r.map((i) => i.origemId)).toEqual(['l1'])
  })

  it('limpar a busca devolve a lista do mesmo filtro', () => {
    const r = listarMemoria(base, { filtro: 'links', consulta: '' })
    expect(r.map((i) => i.origemId)).toEqual(['l1'])
  })

  it('arquivado volta a aparecer quando ha busca — guardar nao e apagar (J)', () => {
    const comArquivo = agregarMemoria({
      notas: [nota({ id: 'velho', title: 'Contrato antigo', status: 'archived' })],
    })
    expect(listarMemoria(comArquivo, { filtro: 'tudo', consulta: '' })).toHaveLength(0)
    expect(listarMemoria(comArquivo, { filtro: 'tudo', consulta: 'contrato' })).toHaveLength(1)
  })
})

describe('memoria — legenda da linha (economia de chips)', () => {
  it('relacao com acao ganha de estado', () => {
    const [i] = agregarMemoria({ notas: [nota({ id: 'x', status: 'inbox' })], vinculos: { x: { task_id: 't' } } })
    expect(legendaDoItem(i, { quando: 'há 2 dias' })).toBe('há 2 dias · 1 tarefa relacionada')
  })

  it('por organizar aparece quando nao ha relacao', () => {
    const [i] = agregarMemoria({ notas: [nota({ status: 'inbox' })] })
    expect(legendaDoItem(i, { quando: 'ontem' })).toBe('ontem · Por organizar')
  })

  it('link organizado diz Referencia', () => {
    const [i] = agregarMemoria({ links: [link()] })
    expect(legendaDoItem(i, { quando: 'há 5 dias' })).toBe('há 5 dias · Referência')
  })

  it('nunca acumula dois rotulos de estado na mesma linha', () => {
    const [i] = agregarMemoria({ notas: [nota({ status: 'to_think' })] })
    const l = legendaDoItem(i, { quando: 'hoje' })
    expect(l.split(' · ')).toHaveLength(2)
  })
})

describe('memoria — acoes possiveis por item', () => {
  it('nota por organizar oferece as decisoes simples, sem obrigar', () => {
    const [i] = agregarMemoria({ notas: [nota({ status: 'inbox' })] })
    const a = acoesDoItem(i)
    expect(a).toContain('marcar_ideia')
    expect(a).toContain('manter_nota')
    expect(a).toContain('criar_tarefa')
  })

  it('link nao oferece organizar: a tabela nao tem esse estado', () => {
    const [i] = agregarMemoria({ links: [link()] })
    const a = acoesDoItem(i)
    expect(a).not.toContain('marcar_ideia')
    expect(a).toContain('abrir_url')
  })

  it('arquivado oferece restaurar, nao arquivar de novo', () => {
    const [i] = agregarMemoria({ notas: [nota({ status: 'archived' })] })
    const a = acoesDoItem(i)
    expect(a).toContain('restaurar')
    expect(a).not.toContain('arquivar')
  })

  it('excluir sempre existe e e uma acao a parte de arquivar (K)', () => {
    const [i] = agregarMemoria({ notas: [nota()] })
    const a = acoesDoItem(i)
    expect(a).toContain('excluir')
    expect(a).toContain('arquivar')
  })
})

describe('memoria — dominio', () => {
  it('tira protocolo, www e caminho', () => {
    expect(dominio('https://www.carmais.com.br/a/b?x=1')).toBe('carmais.com.br')
  })
  it('aguenta endereco sem protocolo', () => {
    expect(dominio('carmais.com.br/a')).toBe('carmais.com.br')
  })
  it('nao quebra com vazio', () => {
    expect(dominio('')).toBe('')
    expect(dominio(null)).toBe('')
  })
})

describe('memoria — quando foi guardado', () => {
  const agora = new Date('2026-09-22T12:00:00')
  it('hoje', () => expect(quandoGuardado('2026-09-22T08:00:00', agora)).toBe('hoje'))
  it('ontem, mesmo com poucas horas de diferenca', () =>
    expect(quandoGuardado('2026-09-21T23:00:00', agora)).toBe('ontem'))
  it('dentro da semana conta os dias', () =>
    expect(quandoGuardado('2026-09-20T10:00:00', agora)).toBe('há 2 dias'))
  it('passada a semana volta a ser data', () =>
    expect(quandoGuardado('2026-08-30T10:00:00', agora)).toBe('30 ago'))
  it('ano anterior carrega o ano', () =>
    expect(quandoGuardado('2025-08-30T10:00:00', agora)).toBe('30 ago 2025'))
  it('nunca quebra com valor invalido', () => {
    expect(quandoGuardado(null)).toBe('')
    expect(quandoGuardado('nao-e-data')).toBe('')
  })
})

describe('memoria — a previa nunca repete o titulo', () => {
  it('nota sem titulo proprio nao mostra a mesma linha duas vezes', () => {
    const [i] = agregarMemoria({
      notas: [nota({ title: '', content: 'ligar para o Rafael sobre a garantia' })],
    })
    expect(i.titulo).toBe('ligar para o Rafael sobre a garantia')
    expect(i.previa).toBe('')
  })

  it('com titulo proprio, a previa continua sendo o corpo', () => {
    const [i] = agregarMemoria({ notas: [nota({ title: 'Contrato', content: 'ver com jurídico' })] })
    expect(i.previa).toBe('ver com jurídico')
  })

  it('nota de varias linhas sem titulo mostra a SEGUNDA linha como previa', () => {
    const [i] = agregarMemoria({ notas: [nota({ title: '', content: 'primeira\nsegunda' })] })
    expect(i.titulo).toBe('primeira')
    expect(i.previa).toBe('segunda')
  })
})
