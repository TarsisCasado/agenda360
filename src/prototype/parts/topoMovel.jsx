import { Search, MoreHorizontal } from 'lucide-react'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// O TOPO DAS TELAS MOVEIS (UX-M2 → UX-M3).
//
// A mesma estrutura que o Hoje estreou: contexto pequeno em cima, titulo
// grande embaixo, duas utilidades a direita. Nenhuma barra de marca — dentro
// do produto ninguem precisa ser lembrado do nome dele.
//
// O Hoje continua desenhando o proprio topo porque la o titulo E a saudacao
// (muda com a hora e com o nome); aqui o titulo e o nome da tela. Repartir a
// peca em duas nao valia a abstracao.
// ---------------------------------------------------------------------------
export default function TopoMovel({ contexto, titulo, aoBuscar, aoMenu, className }) {
  return (
    <header className={cx('pt-safe pt-3', className)}>
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 pt-2 text-[15px] leading-snug text-secondary">{contexto}</p>
        <div className="flex flex-none items-center gap-2">
          <button type="button" onClick={aoBuscar} aria-label="Buscar" className="m2-redondo">
            <Search size={19} />
          </button>
          <button type="button" onClick={aoMenu} aria-label="Mais" className="m2-redondo">
            <MoreHorizontal size={19} />
          </button>
        </div>
      </div>
      <h1 className="mt-1 text-[30px] font-bold leading-[1.12] tracking-[-0.03em]">{titulo}</h1>
    </header>
  )
}
