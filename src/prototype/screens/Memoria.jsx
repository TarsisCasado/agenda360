import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Search, FileText, Lightbulb, Link2, X, CornerUpRight, PenLine, Archive } from 'lucide-react'
import { useProto, useDesktop } from '../store/contexto'
import { TIPO_MEMORIA, rotuloDeData } from '../mock/dados'
import { Vazio, Chip } from '../parts/base'
import { dominio } from '../parts/url'
import Leitura from './Leitura'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// MEMÓRIA — lista de trabalho, não página de revista.
//
// Formato, significado e estado são eixos diferentes: um item é LINK (formato)
// e POR ORGANIZAR (estado) e RECENTE (ordenação) ao mesmo tempo. Por isso há
// uma lista só, com busca à mão, uma porta para "Por organizar" e filtros de
// tipo em segundo plano.
//
// No desktop, selecionar abre a leitura AO LADO: ler não deveria custar perder
// a lista e ter de voltar. No telefone, abre em tela.
// ---------------------------------------------------------------------------
const ICONE = {
  [TIPO_MEMORIA.NOTA]: FileText,
  [TIPO_MEMORIA.IDEIA]: Lightbulb,
  [TIPO_MEMORIA.LINK]: Link2,
}
const NOME_TIPO = {
  [TIPO_MEMORIA.NOTA]: 'Nota',
  [TIPO_MEMORIA.IDEIA]: 'Ideia',
  [TIPO_MEMORIA.LINK]: 'Link',
}

export default function Memoria() {
  const { estado } = useProto()
  const desktop = useDesktop()
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const filtro = params.get('filtro') || 'tudo'

  const ativos = estado.memoria.filter((m) => !m.arquivada)
  const arquivados = estado.memoria.filter((m) => m.arquivada)
  const soltos = ativos.filter((m) => m.porOrganizar)
  // Arquivado sai da lista de trabalho — e continua existindo, buscável, a um
  // filtro de distância. Arquivar não é excluir.
  const lista = (filtro === 'arquivados' ? arquivados : ativos)
    .filter((m) => {
      if (filtro === 'por-organizar') return m.porOrganizar
      if (['nota', 'ideia', 'link'].includes(filtro)) return m.tipo === filtro
      return true
    })
    .filter((m) => {
      const q = termo.trim().toLowerCase()
      return !q || `${m.titulo} ${m.texto}`.toLowerCase().includes(q)
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))

  const trocarFiltro = (f) => (f === 'tudo' ? setParams({}) : setParams({ filtro: f }))
  const abrir = (m) => (desktop ? setSelecionado(m.id) : navegar(`/prototipo/memoria/${m.id}`))

  return (
    <div className="px-entra">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="px-titulo-tela">Memória</h1>
          <span className="text-[12.5px] text-muted">{ativos.length} itens</span>
        </div>
        {/* NOVA NOTA é entrada explícita, não um efeito colateral da captura.
            Quem quer escrever quer uma folha em branco agora. */}
        <Link
          to="/prototipo/memoria/nova"
          className="press inline-flex items-center gap-1.5 rounded-control bg-accent px-3.5 py-2 text-[13.5px] font-semibold text-white shadow-raised transition hover:brightness-110"
        >
          <PenLine size={15} /> Nova nota
        </Link>
      </header>

      {/* Busca e filtros dividem uma faixa só: acessíveis sem dominar a tela. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] max-w-[420px] flex-1 items-center gap-2 rounded-row border border-hairline bg-surface px-3 py-1.5 focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(var(--c-accent)/0.16)]">
          <Search size={15} className="flex-none text-muted" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar em tudo que guardei"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-faint"
          />
          {termo && (
            <button type="button" onClick={() => setTermo('')} aria-label="Limpar busca" className="press text-muted hover:text-primary">
              <X size={14} />
            </button>
          )}
        </div>

        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
          <Chip on={filtro === 'tudo'} onClick={() => trocarFiltro('tudo')}>Tudo</Chip>
          <Chip on={filtro === 'por-organizar'} onClick={() => trocarFiltro('por-organizar')}>
            Por organizar{soltos.length ? ` · ${soltos.length}` : ''}
          </Chip>
          <Chip on={filtro === 'nota'} onClick={() => trocarFiltro('nota')}>Notas</Chip>
          <Chip on={filtro === 'ideia'} onClick={() => trocarFiltro('ideia')}>Ideias</Chip>
          <Chip on={filtro === 'link'} onClick={() => trocarFiltro('link')}>Links</Chip>
          {arquivados.length > 0 && (
            <Chip on={filtro === 'arquivados'} onClick={() => trocarFiltro('arquivados')}>
              <Archive size={12} /> Arquivados · {arquivados.length}
            </Chip>
          )}
        </div>

        {(termo || filtro !== 'tudo') && (
          <span className="px-motivo">{lista.length} de {estado.memoria.length}</span>
        )}
      </div>

      <div className={cx('mt-3', desktop && 'grid grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 lg:items-start')}>
        <div className="min-w-0">
          {lista.length === 0 && <Vazio>Nada por aqui{termo ? ' com esse termo' : ''}.</Vazio>}
          {lista.map((m) => {
            const Icone = ICONE[m.tipo] || FileText
            const ativo = selecionado === m.id
            const relacionadas = estado.tarefas.filter((t) => t.origemId === m.id)
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => abrir(m)}
                className={cx(
                  'px-linha px-toque w-full items-start gap-2.5 text-left',
                  ativo && 'bg-accent-soft/70 hover:bg-accent-soft/70',
                )}
              >
                <Icone size={15} className={cx('mt-0.5 flex-none', ativo ? 'text-accent-text' : 'text-muted')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium leading-snug">{m.titulo}</span>

                  {/* Uma prévia curta é o que separa um arquivo de um segundo
                      cérebro: dá para reconhecer o item sem abrir. */}
                  {m.resumo && (
                    <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-secondary">
                      {m.resumo}
                    </span>
                  )}

                  <span className="px-motivo mt-1 flex flex-wrap items-center gap-x-1.5">
                    <span>{NOME_TIPO[m.tipo]}</span>
                    {m.url && <span className="truncate text-faint">· {dominio(m.url)}</span>}
                    <span>· {rotuloDeData(m.criadoEm, estado.hoje)}</span>
                    {m.porOrganizar && <span className="text-accent-text">· por organizar</span>}
                    {m.referencia && <span>· referência</span>}
                    {relacionadas.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-accent-text">
                        · <CornerUpRight size={10} /> {relacionadas.length}{' '}
                        {relacionadas.length === 1 ? 'tarefa' : 'tarefas'}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {desktop && (
          <div className="px-painel sticky top-6 max-h-[calc(100dvh-90px)] overflow-y-auto p-5">
            {selecionado ? (
              <Leitura id={selecionado} embutida />
            ) : (
              // Painel sem seleção não fica vazio: mostra o que há de mais
              // recente, que é o que a pessoa provavelmente quer rever.
              <Leitura id={lista[0]?.id} embutida />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
