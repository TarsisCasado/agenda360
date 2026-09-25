import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, PenLine, X, Loader2, Library } from 'lucide-react'
import { Page, PageHeader } from '../components/layout/Page'
import { EmptyState, ErrorState } from '../components/ui/Common'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { useMemoria } from '../hooks/useMemoria'
import { inboxService } from '../services/inboxService'
import { linkService } from '../services/linkService'
import { taskService } from '../services/taskService'
import { conversionService } from '../services/conversionService'
import { FILTROS, listarMemoria } from '../lib/memoria'
import { SUPERFICIE } from '../lib/copilotoContexto'
import { cx } from '../lib/utils'
import LinhaMemoria from '../components/memoria/LinhaMemoria'
import DetalheMemoria from '../components/memoria/DetalheMemoria'
import AcaoCopiloto from '../components/copiloto/AcaoCopiloto'

// ---------------------------------------------------------------------------
// MEMORIA — o lugar do que foi guardado (C3).
//
// No C2 esta tela era um HUB: tres atalhos para Ideias, Caixa e Links. Aquilo
// resolveu a navegacao e nao resolveu o produto — a propria avaliacao do QA
// foi "nao consegui perceber tanta diferenca", e estava certa. Um destino de
// primeiro nivel cujo conteudo e uma lista de links para outras telas nao e um
// lugar, e um indice.
//
// Agora a tela MOSTRA O QUE EXISTE. As tres listas antigas viram uma so,
// composta na aplicacao sobre as mesmas tabelas de sempre (ver lib/memoria.js).
// As telas antigas continuam existindo, nas rotas de sempre, intactas.
//
// -------------------- DUAS COMPOSICOES, UMA ARQUITETURA --------------------
//
// Desktop: lista a esquerda, leitura a direita. Abrir um item nao troca de
// pagina — e exatamente isso que faz Memoria parecer um lugar onde se fica.
//
// Telefone: a lista e a tela; tocar abre o detalhe como folha por cima. A
// lista NAO e desmontada, entao voltar devolve o mesmo filtro, a mesma busca e
// a mesma posicao de rolagem — sem precisar guardar nada em lugar nenhum. Nao
// ha painel espremido em 390px: a tentativa de espremer as duas colunas e o
// que transforma tela pequena em tela ruim.
//
// -------------------- O QUE ESTA TELA NAO FAZ ------------------------------
//
// Nao grava nada ao abrir. Nao marca visto, nao classifica, nao converte, nao
// chama IA. Buscar e filtrar sao leitura pura, em memoria, sem ida a rede.
// ---------------------------------------------------------------------------

export default function Memoria() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const { reload: reloadData } = useData()
  const { toast } = useToast()
  const { itens, carregando, erro, recarregar } = useMemoria()

  const [filtro, setFiltro] = useState('tudo')
  const [consulta, setConsulta] = useState('')
  const [abertoId, setAbertoId] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const [criando, setCriando] = useState(false)
  const [tarefas, setTarefas] = useState([])
  const buscaRef = useRef(null)

  // As tarefas servem a UMA coisa: dar nome ao vinculo que ja existe, para o
  // detalhe poder dizer "levou a <titulo>" em vez de mostrar um uuid. Leitura,
  // uma vez por carga; falha nao derruba a tela.
  useEffect(() => {
    if (!workspaceId) return undefined
    let vivo = true
    taskService
      .list(workspaceId, {})
      .then((t) => { if (vivo) setTarefas(t) })
      .catch(() => { if (vivo) setTarefas([]) })
    return () => { vivo = false }
  }, [workspaceId])

  const visiveis = useMemo(
    () => listarMemoria(itens, { filtro, consulta }),
    [itens, filtro, consulta],
  )

  // O item aberto vem SEMPRE da lista viva, nunca de uma copia guardada no
  // estado: assim, depois de arquivar ou organizar, o painel ja mostra o
  // estado novo sem que ninguem precise sincronizar duas verdades.
  const aberto = useMemo(() => itens.find((i) => i.id === abertoId) || null, [itens, abertoId])

  const tarefasDoAberto = useMemo(() => {
    if (!aberto) return []
    const ids = new Set(aberto.tarefasRelacionadas || [])
    return tarefas.filter((t) => ids.has(t.id))
  }, [aberto, tarefas])

  // Trocar de recorte fecha a leitura: manter aberto um item que sumiu da
  // lista deixaria a tela afirmando duas coisas diferentes ao mesmo tempo.
  const trocarFiltro = (chave) => {
    setFiltro(chave)
    setAbertoId(null)
  }

  const recarregarTudo = useCallback(async () => {
    await recarregar()
    reloadData()
    taskService.list(workspaceId, {}).then(setTarefas).catch(() => {})
  }, [recarregar, reloadData, workspaceId])

  // --- Escrita: sempre por acao explicita da pessoa ------------------------

  const novaNota = async () => {
    if (criando) return
    setCriando(true)
    try {
      // Nota nasce VAZIA e vai direto para a escrita. Sem categoria, sem data,
      // sem status para escolher: uma nota pode simplesmente ser uma nota.
      const salva = await inboxService.create(workspaceId, user.id, { title: '', content: '' })
      reloadData()
      navigate(`/ideias/${salva.id}`, {
        state: { note: salva, voltarPara: '/memoria', voltarRotulo: 'Memória' },
      })
    } catch (err) {
      toast('Não foi possível criar a nota: ' + err.message, 'error')
      setCriando(false)
    }
  }

  const editar = () => {
    if (!aberto || aberto.fonte !== 'inbox_items') return
    navigate(`/ideias/${aberto.origemId}`, {
      state: { note: aberto.origem, voltarPara: '/memoria', voltarRotulo: 'Memória' },
    })
  }

  const comOcupado = async (fn, sucesso) => {
    if (ocupado) return
    setOcupado(true)
    try {
      await fn()
      await recarregarTudo()
      if (sucesso) toast(sucesso)
    } catch (err) {
      toast('Não consegui concluir: ' + err.message, 'error')
    } finally {
      setOcupado(false)
    }
  }

  // "Organizar" e uma decisao, nao uma obrigacao: nada aqui e automatico, e
  // toda decisao e reversivel (existe o caminho de volta).
  const decidir = (decisao) =>
    comOcupado(async () => {
      const nota = aberto.origem
      if (decisao === 'ideia') await inboxService.moveToThink(nota, user.id)
      else if (decisao === 'por_organizar') await inboxService.moveToInbox(nota, user.id)
      else await inboxService.markProcessed(nota, user.id)
    }, decisao === 'por_organizar' ? 'Voltou para Por organizar' : 'Organizado')

  // -------------------------------------------------------------------------
  // CRIAR TAREFA A PARTIR DO CONTEUDO — sem destruir o conteudo.
  //
  // Para NOTA, passa pelo conversionService, que e o unico ponto do produto que
  // cria a Task E grava o vinculo `inbox_task_links`. Copiar o texto para uma
  // tarefa solta seria duplicacao silenciosa: dois textos iguais, nenhum
  // caminho de volta.
  //
  // Para LINK, a propria tabela ja tem `task_id`: cria a tarefa e prende o link
  // a ela. Mesma garantia, mecanismo que ja existia.
  //
  // Nos dois casos o item ORIGINAL permanece em Memoria, com o estado que
  // tinha. Derivar acao nao consome o que a gerou.
  // -------------------------------------------------------------------------
  const criarTarefa = () =>
    comOcupado(async () => {
      const titulo = (aberto.titulo || 'Nova tarefa').slice(0, 200)
      if (aberto.fonte === 'inbox_items') {
        await conversionService.convertInboxItemToTask(workspaceId, user.id, aberto.origem, {
          title: titulo,
          description: aberto.conteudo || '',
          date: null,
        })
      } else {
        const t = await taskService.create(workspaceId, user.id, {
          title: titulo,
          description: aberto.url || '',
          date: null,
        })
        await linkService.attachTask(aberto.origemId, t.id)
      }
    }, 'Tarefa criada — o item continua aqui')

  const arquivar = () =>
    comOcupado(() => inboxService.archive(aberto.origem, user.id), 'Arquivado — nada foi excluído')

  const restaurar = () =>
    comOcupado(() => inboxService.restore(aberto.origem, user.id), 'Restaurado')

  // Excluir NUNCA acontece por engano: confirmacao explicita, texto que diz o
  // que se perde, e so entao a chamada.
  const excluir = () => {
    const nota = aberto.fonte === 'inbox_items'
    if (!window.confirm(`Excluir “${aberto.titulo}”? Isso não pode ser desfeito.`)) return
    return comOcupado(async () => {
      if (nota) await inboxService.remove(aberto.origem)
      else await linkService.remove(aberto.origemId)
      setAbertoId(null)
    }, 'Excluído')
  }

  const acoes = {
    ocupado,
    filtro,
    onFechar: () => setAbertoId(null),
    onEditar: editar,
    onDecidir: decidir,
    onCriarTarefa: criarTarefa,
    onArquivar: arquivar,
    onRestaurar: restaurar,
    onExcluir: excluir,
  }

  const buscando = consulta.trim().length > 0

  return (
    <Page width="workspace" className="max-w-6xl">
      <PageHeader
        title="Memória"
        subtitle="O que você guardou"
        actions={
          <>
            <AcaoCopiloto
              superficie={SUPERFICIE.MEMORIA}
              extra={{ filtro }}
              className="hidden sm:inline-flex"
            />
            {/* SECUNDARIO, e nao primario, por um motivo de telefone: ali
                embaixo ja existe um `+` roxo — o criar GLOBAL da barra
                inferior. Dois botoes roxos identicos a poucos centimetros um
                do outro, um "criar qualquer coisa" e um "criar nota",
                obrigavam a pessoa a aprender a diferenca pela posicao. Esta e
                a acao DESTA tela; a global continua sendo aquela. */}
            <button
              onClick={novaNota}
              disabled={criando}
              className="btn-secondary press !px-3"
              data-testid="memoria-nova-nota"
              aria-label="Nova nota"
            >
              {criando ? <Loader2 size={17} className="animate-spin" /> : <PenLine size={17} />}
              <span className="hidden sm:inline">Nova nota</span>
            </button>
          </>
        }
      />

      {/* BUSCA — visivel sempre, nao escondida atras de um icone. Procurar e o
          gesto central de uma memoria; esconde-lo seria esconder a funcao. */}
      <div className="px-2">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={buscaRef}
            value={consulta}
            onChange={(e) => { setConsulta(e.target.value); setAbertoId(null) }}
            placeholder="Buscar no que guardei…"
            aria-label="Buscar na memória"
            data-testid="memoria-busca"
            className="input !pl-9 !pr-9"
          />
          {buscando && (
            <button
              type="button"
              onClick={() => { setConsulta(''); buscaRef.current?.focus() }}
              aria-label="Limpar busca"
              data-testid="memoria-limpar-busca"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted active:bg-surface-3 hover:bg-surface-3"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* FILTROS — uma fila rolavel, nao cinco abas disputando o topo. O
            primeiro ("Tudo") e o padrao, e "Por organizar" vem logo depois
            porque e ESTADO: e a unica pergunta que a pessoa faz sobre o que
            ainda pende. Os tres seguintes sao recorte de conteudo. */}
        <div
          className="-mx-2 mt-2.5 flex gap-1.5 overflow-x-auto px-2 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filtros da memória"
        >
          {FILTROS.map((f) => (
            <button
              key={f.chave}
              role="tab"
              aria-selected={filtro === f.chave}
              data-testid={`memoria-filtro-${f.chave}`}
              onClick={() => trocarFiltro(f.chave)}
              className={filtro === f.chave ? 'pill-on' : 'pill-off'}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 px-2">
        {erro ? (
          <ErrorState onRetry={recarregar} />
        ) : carregando && itens.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
          </div>
        ) : (
          <div
            className={cx(
              // A segunda coluna so existe onde ha espaco para ela ser util.
              'lg:grid lg:items-start lg:gap-6',
              'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]',
            )}
          >
            <div className="min-w-0">
              {visiveis.length === 0 ? (
                <EmptyState
                  icon={Library}
                  title={buscando ? 'Nada encontrado' : 'Nada guardado por aqui ainda'}
                  description={
                    buscando
                      ? 'Tente outra palavra — a busca olha o título e o conteúdo.'
                      : 'Anote um pensamento, salve um link, capture o que não pode esquecer.'
                  }
                />
              ) : (
                <ul className="list" data-testid="memoria-lista">
                  {visiveis.map((item) => (
                    <li key={item.id}>
                      <LinhaMemoria
                        item={item}
                        selecionado={item.id === abertoId}
                        onAbrir={(i) => setAbertoId(i.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* LEITURA NO DESKTOP — coluna fixa ao lado da lista. Sem item
                aberto, a coluna nao vira um vazio decorado: ela diz o que
                fazer, em uma linha. */}
            <div className="hidden lg:block">
              <div className="sticky top-2 max-h-[calc(100dvh-8rem)] surface-line rounded-surface p-4">
                {aberto ? (
                  <DetalheMemoria item={aberto} tarefas={tarefasDoAberto} {...acoes} />
                ) : (
                  <p className="text-caption px-1 py-6 text-center">
                    Selecione algo à esquerda para ler aqui.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* LEITURA NO TELEFONE — folha por cima, com a lista intacta embaixo.
          Fechar devolve o mesmo filtro, a mesma busca e a mesma rolagem,
          porque nada foi desmontado. */}
      {aberto && (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-canvas pt-safe lg:hidden"
          data-testid="memoria-folha"
          role="dialog"
          aria-label={aberto.titulo}
        >
          <div className="min-h-0 flex-1 px-4 pb-safe pt-3">
            <DetalheMemoria item={aberto} tarefas={tarefasDoAberto} {...acoes} />
          </div>
        </div>
      )}
    </Page>
  )
}
