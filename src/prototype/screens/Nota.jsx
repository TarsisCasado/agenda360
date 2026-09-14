import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import Leitura from './Leitura'

// No telefone a leitura ocupa a tela inteira; no desktop ela vive dentro de
// Memória, no painel ao lado. Mesma peça, dois lugares.
export default function Nota() {
  const { id } = useParams()
  const navegar = useNavigate()
  return (
    <div className="px-entra">
      <button
        type="button"
        onClick={() => navegar(-1)}
        className="press -ml-1 mb-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-primary"
      >
        <ArrowLeft size={15} /> Voltar
      </button>
      <Leitura id={id} />
      <Link to="/prototipo/memoria" className="mt-8 inline-block text-[13px] text-muted hover:text-accent-text">
        Ver tudo na Memória
      </Link>
    </div>
  )
}
