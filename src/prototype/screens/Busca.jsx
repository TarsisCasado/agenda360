import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useProto } from '../store/contexto'
import { buscar } from '../store/reducer'
import { rotuloDeData } from '../mock/dados'

// Buscar e capacidade GLOBAL, nao uma funcao de uma tela. Recuperar o que foi
// guardado e metade do valor de um segundo cerebro — se so der para achar
// navegando, a arquitetura ainda nao esta certa.
export default function Busca({ aberto, aoFechar }) {
  const { estado } = useProto()
  const [termo, setTermo] = useState('')
  const campo = useRef(null)

  useEffect(() => {
    if (aberto) setTimeout(() => campo.current?.focus(), 60)
    else setTermo('')
  }, [aberto])

  if (!aberto) return null
  const r = buscar(estado, termo)
  const vazio = !r.memoria.length && !r.tarefas.length && !r.compromissos.length

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <button aria-label="Fechar busca" onClick={aoFechar} className="animate-backdrop absolute inset-0 bg-black/35 backdrop-blur-[2px]" />
      <div className="animate-scale-in relative w-full max-w-[560px] overflow-hidden rounded-sheet border border-hairline bg-surface shadow-float">
        <div className="flex items-center gap-3 border-b border-hairline px-4 py-3.5">
          <Search size={18} className="flex-none text-muted" />
          <input
            ref={campo}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar em tudo"
            className="w-full bg-transparent text-[16px] outline-none placeholder:text-faint"
          />
          <button onClick={aoFechar} aria-label="Fechar" className="press text-muted"><X size={18} /></button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-4 py-2">
          {!termo && <p className="py-5 text-[13.5px] text-faint">Notas, tarefas, compromissos — tudo de uma vez.</p>}
          {termo && vazio && <p className="py-5 text-[13.5px] text-faint">Nada encontrado.</p>}

          {r.memoria.map((m) => (
            <Link key={m.id} to={`/prototipo/memoria/${m.id}`} onClick={aoFechar} className="px-linha px-toque items-center">
              <span className="min-w-0 flex-1 truncate text-[14.5px]">{m.titulo}</span>
              <span className="px-motivo flex-none">{m.porOrganizar ? 'por organizar' : 'memória'}</span>
            </Link>
          ))}
          {r.tarefas.map((t) => (
            <Link key={t.id} to={`/prototipo/tarefas/${t.id}`} onClick={aoFechar} className="px-linha px-toque items-center">
              <span className="min-w-0 flex-1 truncate text-[14.5px]">{t.titulo}</span>
              <span className="px-motivo flex-none">tarefa</span>
            </Link>
          ))}
          {r.compromissos.map((c) => (
            <Link key={c.id} to="/prototipo/agenda" onClick={aoFechar} className="px-linha px-toque items-center">
              <span className="min-w-0 flex-1 truncate text-[14.5px]">{c.titulo}</span>
              <span className="px-motivo flex-none">{rotuloDeData(c.data, estado.hoje)} · {c.inicio}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
