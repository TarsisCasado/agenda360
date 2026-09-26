import { ideaTitle } from './ideas'

// ---------------------------------------------------------------------------
// MEMORIA — o READ-MODEL (C3).
//
// Este arquivo NAO cria tabela, NAO grava e NAO conhece React. Ele responde a
// uma pergunta so: dadas as fontes que ja existem no banco, como e a lista
// unica do que a pessoa guardou?
//
// -------------------- POR QUE COMPOSICAO, E NAO MIGRATION ------------------
//
// As tres telas antigas ja liam as MESMAS duas tabelas:
//   inbox_items  -> "Ideias" e "Caixa de entrada" (sempre foram a mesma tabela,
//                   expostas como dois lugares por acidente historico);
//   links        -> "Central de links".
// E o vinculo com acao ja existe em duas formas persistidas:
//   inbox_task_links (inbox_item_id -> task_id)  e  links.task_id.
//
// Ou seja: o modelo atual JA suporta a experiencia pedida. Criar tabela nova
// aqui seria inventar persistencia para algo que ja esta persistido — e as
// telas antigas passariam a discordar da nova. Entao a unificacao acontece na
// aplicacao, sobre as fontes vivas, e nenhuma fonte e destruida.
//
// -------------------- FORMATO != SIGNIFICADO != ESTADO ---------------------
//
// A regra conceitual do briefing virou tres campos SEPARADOS, porque misturar
// os tres num unico enum foi exatamente o erro que o `tasks.status` cometeu e
// que o UX1.3.1 mandou nao repetir:
//
//   formato   COMO esta escrito          nota | checklist | link
//   significado  O QUE a pessoa decidiu   ideia | referencia | null (nao decidiu)
//   organizacao  ESTADO da decisao        por_organizar | organizado
//   arquivado    eixo proprio (bool) — arquivar nao e excluir nem organizar
//
// A leitura de cada eixo vem do dado REAL, sem interpretacao inventada:
//
//   inbox_items.status = 'inbox'     -> POR ORGANIZAR. E literalmente "guardei
//                                       e ainda nao decidi o que e": o proprio
//                                       produto ja chamava esse filtro de
//                                       "Na caixa";
//   inbox_items.status = 'to_think'  -> significado IDEIA. O produto ja rotula
//                                       esse estado como "Para pensar" e ja o
//                                       desenha com a lampada. Nao e leitura
//                                       nova, e o nome que ele ja tinha;
//   inbox_items.status = 'processed' -> organizado, sem significado extra;
//   inbox_items.status = 'archived'  -> arquivado;
//   links                            -> significado REFERENCIA por natureza.
//
// LACUNA REAL, DECLARADA E NAO CONTORNADA: a tabela `links` nao tem coluna de
// status. Um link, portanto, NUNCA aparece como "por organizar" — nao porque
// decidimos que link ja nasce organizado, mas porque o modelo atual nao tem
// onde guardar essa decisao. Corrigir isso exigiria migration, que este
// checkpoint nao faz. Esta ausencia esta no relatorio.
// ---------------------------------------------------------------------------

export const FORMATO = { NOTA: 'nota', CHECKLIST: 'checklist', LINK: 'link' }
export const SIGNIFICADO = { IDEIA: 'ideia', REFERENCIA: 'referencia' }
export const ORGANIZACAO = { POR_ORGANIZAR: 'por_organizar', ORGANIZADO: 'organizado' }

// Os recortes da barra de filtros. "Por organizar" e ESTADO; os outros tres
// sao recorte de conteudo — e o codigo mantem essa diferenca visivel em vez de
// achatar tudo numa lista de cinco abas iguais.
export const FILTROS = [
  { chave: 'tudo', rotulo: 'Tudo', eixo: null },
  { chave: 'por_organizar', rotulo: 'Por organizar', eixo: 'estado' },
  { chave: 'notas', rotulo: 'Notas', eixo: 'conteudo' },
  { chave: 'ideias', rotulo: 'Ideias', eixo: 'conteudo' },
  { chave: 'links', rotulo: 'Links', eixo: 'conteudo' },
]

// Mesma normalizacao da paleta de comandos (C1): minuscula + sem acento. Quem
// digita "reuniao" precisa achar "Reunião", e vice-versa.
export const norm = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

// Dominio legivel de uma URL, para a previa de um link. Sem `new URL` porque
// um endereco digitado a mao pode nao ter protocolo e o construtor lancaria.
export function dominio(url) {
  return String(url || '')
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
}

// --- Conversao das fontes -> item unico de Memoria -------------------------

export function itemDeNota(nota, { tarefas = [] } = {}) {
  const arquivado = nota.status === 'archived'
  const titulo = ideaTitle(nota, 'Sem título')
  // A previa e a primeira linha do corpo que NAO seja o titulo exibido.
  //
  // `ideaSnippet` compara com `note.title`, o campo; aqui o que esta na tela e
  // o titulo EXIBIDO, que numa nota sem titulo proprio e a primeira linha do
  // corpo. Usar o snippet cru repetia essa linha duas vezes, uma embaixo da
  // outra — visto no QA visual, parecia erro de renderizacao. Numa nota de
  // varias linhas o certo nao e sumir com a previa: e mostrar a linha
  // SEGUINTE, que e o que de fato acrescenta.
  const previa = String(nota.content || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && norm(l) !== norm(titulo)) || ''
  return {
    id: `nota:${nota.id}`,
    fonte: 'inbox_items',
    origemId: nota.id,
    formato: nota.type === 'checklist' ? FORMATO.CHECKLIST : FORMATO.NOTA,
    significado: nota.status === 'to_think' ? SIGNIFICADO.IDEIA : null,
    organizacao: nota.status === 'inbox' ? ORGANIZACAO.POR_ORGANIZAR : ORGANIZACAO.ORGANIZADO,
    arquivado,
    titulo,
    previa,
    conteudo: nota.content || '',
    url: null,
    capturadoPor: nota.origin || 'manual',
    criadoEm: nota.created_at || null,
    atualizadoEm: nota.updated_at || nota.created_at || null,
    tarefasRelacionadas: tarefas,
    // A linha original, para quem precisa gravar (o detalhe chama os services
    // com o registro de verdade, nunca com esta projecao).
    origem: nota,
  }
}

export function itemDeLink(link, { tarefas = [] } = {}) {
  return {
    id: `link:${link.id}`,
    fonte: 'links',
    origemId: link.id,
    formato: FORMATO.LINK,
    significado: SIGNIFICADO.REFERENCIA,
    // Ver a lacuna declarada no topo: `links` nao tem status.
    organizacao: ORGANIZACAO.ORGANIZADO,
    arquivado: false,
    titulo: (link.title || '').trim() || dominio(link.url) || 'Link',
    previa: (link.note || '').trim() || dominio(link.url),
    conteudo: link.note || '',
    url: link.url || null,
    capturadoPor: 'manual',
    criadoEm: link.created_at || null,
    atualizadoEm: link.created_at || null,
    tarefasRelacionadas: tarefas,
    origem: link,
  }
}

// ---------------------------------------------------------------------------
// AGREGACAO. `vinculos` e o mapa inbox_item_id -> vinculo que o
// inboxTaskLinkService ja produzia para a Caixa (`convertedMap`); `links` ja
// carrega `task_id` na propria linha. Nenhuma consulta nova, nenhum campo novo.
// ---------------------------------------------------------------------------
export function agregarMemoria({ notas = [], links = [], vinculos = {} } = {}) {
  const itens = [
    ...notas.map((n) => {
      const v = vinculos[n.id]
      return itemDeNota(n, { tarefas: v ? [v.task_id] : [] })
    }),
    ...links.map((l) => itemDeLink(l, { tarefas: l.task_id ? [l.task_id] : [] })),
  ]
  return ordenarPorRecencia(itens)
}

export function ordenarPorRecencia(itens = []) {
  return [...itens].sort((a, b) =>
    String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')),
  )
}

// --- Recortes ---------------------------------------------------------------

export function aplicarFiltro(itens = [], filtro = 'tudo') {
  switch (filtro) {
    case 'por_organizar':
      return itens.filter((i) => i.organizacao === ORGANIZACAO.POR_ORGANIZAR && !i.arquivado)
    // "Notas" e FORMATO: toda nota escrita entra, inclusive a que ja virou
    // ideia. Uma ideia E uma nota com significado — separar as duas listas
    // como se fossem excludentes recriaria "Ideias" como produto proprio, que
    // e exatamente o que o C3 desfaz.
    case 'notas':
      return itens.filter(
        (i) => (i.formato === FORMATO.NOTA || i.formato === FORMATO.CHECKLIST) && !i.arquivado,
      )
    case 'ideias':
      return itens.filter((i) => i.significado === SIGNIFICADO.IDEIA && !i.arquivado)
    case 'links':
      return itens.filter((i) => i.formato === FORMATO.LINK && !i.arquivado)
    default:
      return itens.filter((i) => !i.arquivado)
  }
}

// ---------------------------------------------------------------------------
// BUSCA — leitura pura, sem IA, sem embedding, sem rede. Titulo + conteudo (o
// contrato minimo do C1) e, para link, tambem a URL: quem procura um link
// muitas vezes so lembra do dominio.
//
// Com busca ativa o ARQUIVADO volta a aparecer. Nao e excecao gratuita:
// arquivar guarda, nao apaga, e "procurar" e literalmente o gesto de pedir de
// volta o que foi guardado. Esconder do resultado o que a pessoa nomeou seria
// dizer que o item sumiu.
// ---------------------------------------------------------------------------
export function buscarMemoria(itens = [], consulta = '') {
  const q = norm(consulta).trim()
  if (!q) return itens
  return itens.filter(
    (i) =>
      norm(i.titulo).includes(q) ||
      norm(i.conteudo).includes(q) ||
      norm(i.previa).includes(q) ||
      norm(i.url).includes(q),
  )
}

// Lista final da tela: filtro, depois busca. A ordem importa — filtrar antes
// mantem o recorte escolhido valendo dentro do resultado da busca.
export function listarMemoria(itens = [], { filtro = 'tudo', consulta = '' } = {}) {
  const q = String(consulta || '').trim()
  // Com busca ativa, o arquivado entra de volta (ver acima): a base passa a ser
  // o recorte SEM o corte de arquivados.
  const base = q ? aplicarFiltroComArquivados(itens, filtro) : aplicarFiltro(itens, filtro)
  return buscarMemoria(base, q)
}

function aplicarFiltroComArquivados(itens, filtro) {
  switch (filtro) {
    case 'por_organizar':
      return itens.filter((i) => i.organizacao === ORGANIZACAO.POR_ORGANIZAR)
    case 'notas':
      return itens.filter((i) => i.formato === FORMATO.NOTA || i.formato === FORMATO.CHECKLIST)
    case 'ideias':
      return itens.filter((i) => i.significado === SIGNIFICADO.IDEIA)
    case 'links':
      return itens.filter((i) => i.formato === FORMATO.LINK)
    default:
      return itens
  }
}

// ---------------------------------------------------------------------------
// A LEGENDA DA LINHA. Uma frase curta, nao tres chips.
//
// Regra de economia: mostra no maximo UMA informacao alem da data, e na ordem
// em que ela muda o que a pessoa faria. Relacao com acao ganha de estado, que
// ganha de significado — repetir "Nota" ao lado de um icone de nota nao
// informa nada.
// ---------------------------------------------------------------------------
export function legendaDoItem(item, { quando = '' } = {}) {
  const partes = []
  if (quando) partes.push(quando)
  const n = item.tarefasRelacionadas?.length || 0
  if (item.arquivado) partes.push('Arquivado')
  else if (n === 1) partes.push('1 tarefa relacionada')
  else if (n > 1) partes.push(`${n} tarefas relacionadas`)
  else if (item.organizacao === ORGANIZACAO.POR_ORGANIZAR) partes.push('Por organizar')
  else if (item.significado === SIGNIFICADO.IDEIA) partes.push('Ideia')
  else if (item.formato === FORMATO.LINK) partes.push('Referência')
  return partes.join(' · ')
}

// ---------------------------------------------------------------------------
// ACOES POSSIVEIS para um item. O detalhe renderiza ESTA lista — e por isso
// que nunca aparece uma acao que nao faz sentido (organizar um link, cuja
// tabela nao tem estado; restaurar algo que nao esta arquivado).
// ---------------------------------------------------------------------------
export function acoesDoItem(item) {
  if (!item) return []
  const nota = item.fonte === 'inbox_items'
  const acoes = []
  if (nota && !item.arquivado) acoes.push('editar')
  if (nota && item.organizacao === ORGANIZACAO.POR_ORGANIZAR) {
    acoes.push('marcar_ideia', 'manter_nota')
  }
  if (nota && item.organizacao === ORGANIZACAO.ORGANIZADO && !item.arquivado) {
    acoes.push('devolver_por_organizar')
  }
  if (item.url) acoes.push('abrir_url')
  if (!item.arquivado) acoes.push('criar_tarefa')
  if (nota) acoes.push(item.arquivado ? 'restaurar' : 'arquivar')
  acoes.push('excluir')
  return acoes
}

// ---------------------------------------------------------------------------
// QUANDO foi guardado, na linguagem de quem guardou.
//
// `formatTimestamp` (lib/date) devolve "18:28" ou "20 set" — certo para uma
// timeline, seco para uma lista de memoria: "20 set" obriga a pessoa a fazer a
// conta de quanto tempo faz. Dentro de uma semana o que importa e a distancia,
// nao a data; passada a semana, a data volta a ser a informacao util.
// ---------------------------------------------------------------------------
export function quandoGuardado(iso, agora = new Date()) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Diferenca em DIAS DE CALENDARIO, nao em horas: 23h atras pode ser ontem, e
  // "há 0 dias" nunca e o que alguem diria.
  const dia = (x) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000)
  const dias = dia(agora) - dia(d)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 7) return `há ${dias} dias`
  const mes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getMonth()]
  return d.getFullYear() === agora.getFullYear()
    ? `${d.getDate()} ${mes}`
    : `${d.getDate()} ${mes} ${d.getFullYear()}`
}
