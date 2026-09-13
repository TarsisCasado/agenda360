import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, FileText, Lightbulb, Link2 } from 'lucide-react'
import { useProto } from '../store/contexto'
import { TIPO_MEMORIA, rotuloDeData } from '../mock/dados'
import { Vazio, Chip } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// MEMORIA — nome de trabalho, e assumidamente provisorio.
//
// O erro que esta tela evita: tratar "Recentes", "Por organizar", "Ideias",
// "Notas" e "Links" como cinco categorias irmas. Nao sao da mesma especie.
// Um mesmo item e LINK (formato) e POR ORGANIZAR (estado) e RECENTE
// (ordenacao) ao mesmo tempo — formato, significado e estado sao eixos
// diferentes.
//
// Entao: uma LISTA unica, busca a mao, um acesso reconhecivel a "Por
// organizar" (que e estado) e filtros de tipo (que e formato) em segundo
// plano.
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
  const [params, setParams] = useSearchParams()
  const [termo, setTermo] = useState('')
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
      if (!q) return true
      return `${m.titulo} ${m.texto}`.toLowerCase().includes(q)
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))

  const trocarFiltro = (f) => {
    if (f === 'tudo') setParams({})
    else setParams({ filtro: f })
  }

  return (
    <div className="px-entra">
      <header>
        <p className="px-secao">Memória</p>
        <h1 className="px-serif px-titulo mt-1.5">Tudo que você guardou</h1>
      </header>

      {/* Busca a mao: recuperar e metade do valor de um segundo cerebro. */}
      <div className="mt-5 flex items-center gap-2.5 rounded-row border border-hairline bg-surface px-3.5 py-2.5 focus-within:border-accent">
        <Search size={17} className="flex-none text-muted" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar em tudo que guardei"
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
      </div>

      {/* Por organizar e ESTADO, e merece porta propria. */}
      {soltos.length > 0 && filtro !== 'por-organizar' && (
        <button
          onClick={() => trocarFiltro('por-organizar')}
          className="press mt-3 flex w-full items-center justify-between rounded-row border border-hairline bg-surface-2 px-4 py-3 text-left transition hover:border-accent"
        >
          <span className="text-[14.5px]">
            <span className="font-semibold">Por organizar</span>
            <span className="text-secondary"> · {soltos.length} {soltos.length === 1 ? 'item' : 'itens'}</span>
          </span>
          <span className="px-motivo">abrir</span>
        </button>
      )}

      {/* Tipo e FORMATO: filtro secundario, nunca a estrutura principal. */}
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        <Chip on={filtro === 'tudo'} onClick={() => trocarFiltro('tudo')}>Tudo</Chip>
        <Chip on={filtro === 'por-organizar'} onClick={() => trocarFiltro('por-organizar')}>Por organizar</Chip>
        <Chip on={filtro === 'nota'} onClick={() => trocarFiltro('nota')}>Notas</Chip>
        <Chip on={filtro === 'ideia'} onClick={() => trocarFiltro('ideia')}>Ideias</Chip>
        <Chip on={filtro === 'link'} onClick={() => trocarFiltro('link')}>Links</Chip>
      </div>

      <div className="mt-5">
        {lista.length === 0 && <Vazio>Nada por aqui{termo ? ' com esse termo' : ''}.</Vazio>}
        {lista.map((m) => {
          const Icone = ICONE[m.tipo] || FileText
          return (
            <Link key={m.id} to={`/prototipo/memoria/${m.id}`} className="px-linha px-toque items-start">
              <Icone size={16} className="mt-1 flex-none text-muted" />
              <span className="min-w-0 flex-1">
                <span className={cx('block text-[15px] leading-snug', m.porOrganizar && 'text-primary')}>
                  {m.titulo}
                </span>
                <span className="px-motivo mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span>{NOME_TIPO[m.tipo]}</span>
                  {m.porOrganizar && <span>· Por organizar</span>}
                  {m.referencia && <span>· Referência</span>}
                  <span>· {rotuloDeData(m.criadoEm, estado.hoje)}</span>
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
