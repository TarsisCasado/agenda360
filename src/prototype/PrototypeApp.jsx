import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import PrototypeStore from './store/PrototypeStore'
import Shell from './shell/Shell'
import CaptureOverlay from './capture/CaptureOverlay'
import Busca from './screens/Busca'
import TarefaForm from './forms/TarefaForm'
import CompromissoForm from './forms/CompromissoForm'
import Hoje from './screens/Hoje'
import Agenda from './screens/Agenda'
import Tarefas from './screens/Tarefas'
import TarefaDetalhe from './screens/TarefaDetalhe'
import Memoria from './screens/Memoria'
import Nota from './screens/Nota'
import Copiloto from './screens/Copiloto'
import Revisao from './screens/Revisao'
import './prototype.css'

// ---------------------------------------------------------------------------
// AGENDA 360 2.0 — PROTOTIPO NAVEGAVEL (UX1).
//
// Isto NAO e o produto. E uma peca de avaliacao, isolada de proposito:
//
//   . todo o estado e MOCK e vive em memoria (sem Supabase, sem servico, sem
//     localStorage, sem rede — ha um teste que impede esses imports);
//   . a IA e simulada: nenhum provider, nenhum modelo, nenhuma Edge Function;
//   . nada aqui toca as telas atuais, e remove-lo e apagar esta pasta.
//
// O portao abaixo existe para que o prototipo possa viver na branch sem ficar
// exposto caso ela chegue a producao: so abre em desenvolvimento ou onde
// VITE_PROTOTIPO valer exatamente 'true' (booleano publico, nunca segredo).
// ---------------------------------------------------------------------------
function liberado() {
  try {
    return Boolean(import.meta.env?.DEV) || import.meta.env?.VITE_PROTOTIPO === 'true'
  } catch {
    return false
  }
}

export default function PrototypeApp() {
  const [captura, setCaptura] = useState(false)
  const [busca, setBusca] = useState(false)
  // Criacao estruturada global: acessivel de qualquer tela, tanto pela lateral
  // do desktop quanto pelos atalhos da captura no telefone.
  const [novaTarefa, setNovaTarefa] = useState(false)
  const [novoCompromisso, setNovoCompromisso] = useState(false)

  // Atalhos de quem vai avaliar no desktop.
  useEffect(() => {
    const tecla = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true) }
      if (e.key === 'Escape') { setCaptura(false); setBusca(false) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  if (!liberado()) return <Navigate to="/" replace />

  return (
    <PrototypeStore>
      <Rotas
        onCapturar={() => setCaptura(true)}
        onBuscar={() => setBusca(true)}
        onNovaTarefa={() => setNovaTarefa(true)}
        onNovoCompromisso={() => setNovoCompromisso(true)}
      />
      <CaptureOverlay
        aberto={captura}
        aoFechar={() => setCaptura(false)}
        aoNovaTarefa={() => setNovaTarefa(true)}
        aoNovoCompromisso={() => setNovoCompromisso(true)}
      />
      <Busca aberto={busca} aoFechar={() => setBusca(false)} />
      <TarefaForm aberta={novaTarefa} aoFechar={() => setNovaTarefa(false)} />
      <CompromissoForm aberta={novoCompromisso} aoFechar={() => setNovoCompromisso(false)} />
    </PrototypeStore>
  )
}

// As telas largas (agenda e quadro) e as estreitas (leitura) dividem o mesmo
// shell, mas nao a mesma medida — por isso a rota precisa dizer qual e qual.
function Rotas(props) {
  const { pathname } = useLocation()
  const largo = /\/(agenda|tarefas|memoria)$/.test(pathname)
  return (
    <Shell {...props} largo={largo}>
        <Routes>
          <Route index element={<Navigate to="hoje" replace />} />
          <Route path="hoje" element={<Hoje />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="tarefas" element={<Tarefas />} />
          <Route path="tarefas/:id" element={<TarefaDetalhe />} />
          <Route path="memoria" element={<Memoria />} />
          <Route path="memoria/:id" element={<Nota />} />
          <Route path="copiloto" element={<Copiloto />} />
          <Route path="revisao" element={<Revisao />} />
          <Route path="*" element={<Navigate to="hoje" replace />} />
        </Routes>
    </Shell>
  )
}
