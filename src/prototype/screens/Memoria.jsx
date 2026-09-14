import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, FileText, Lightbulb, Link2, X } from 'lucide-react'
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

  const soltos = estado.memoria.filter((m) => m.porOrganizar)
  const lista = estado.memoria
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
        <h1 className="px-titulo-tela">Memória</h1>
        <span className="text-[12.5px] text-muted">{estado.memoria.length} itens</span>
      </header>

      <div className="mt-4 flex items-center gap-2.5 rounded-row border border-hairline bg-surface px-3 py-2 focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(var(--c-accent)/0.16)]">
        <Search size={16} className="flex-none text-muted" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar em tudo que guardei"
          className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-faint"
        />
        {termo && (
          <button type="button" onClick={() => setTermo('')} aria-label="Limpar busca" className="press text-muted hover:text-primary">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="no-scrollbar mt-3 flex items-center gap-2 overflow-x-auto pb-1">
        <Chip on={filtro === 'tudo'} onClick={() => trocarFiltro('tudo')}>Tudo</Chip>
        <Chip on={filtro === 'por-organizar'} onClick={() => trocarFiltro('por-organizar')}>
          Por organizar{soltos.length ? ` · ${soltos.length}` : ''}
        </Chip>
        <Chip on={filtro === 'nota'} onClick={() => trocarFiltro('nota')}>Notas</Chip>
        <Chip on={filtro === 'ideia'} onClick={() => trocarFiltro('ideia')}>Ideias</Chip>
        <Chip on={filtro === 'link'} onClick={() => trocarFiltro('link')}>Links</Chip>
      </div>

      <div className={cx('mt-4', desktop && 'grid grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-5')}>
        <div className="min-w-0">
          {lista.length === 0 && <Vazio>Nada por aqui{termo ? ' com esse termo' : ''}.</Vazio>}
          {lista.map((m) => {
            const Icone = ICONE[m.tipo] || FileText
            const ativo = selecionado === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => abrir(m)}
                className={cx(
                  'px-linha px-toque w-full items-start text-left',
                  ativo && 'bg-accent-soft/70 hover:bg-accent-soft/70',
                )}
              >
                <Icone size={15} className={cx('mt-0.5 flex-none', ativo ? 'text-accent-text' : 'text-muted')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] leading-snug">{m.titulo}</span>
                  <span className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-1.5">
                    <span>{NOME_TIPO[m.tipo]}</span>
                    {m.url && <span className="truncate text-faint">· {dominio(m.url)}</span>}
                    {m.porOrganizar && <span className="text-accent-text">· por organizar</span>}
                    {m.referencia && <span>· referência</span>}
                    <span>· {rotuloDeData(m.criadoEm, estado.hoje)}</span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {desktop && (
          <div className="px-painel min-h-[320px] p-5">
            {selecionado ? (
              <Leitura id={selecionado} embutida />
            ) : (
              <p className="pt-10 text-center text-[13.5px] text-faint">
                Selecione um item para ler aqui.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
