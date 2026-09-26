import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import PrototypeStore from './store/PrototypeStore'
import Shell from './shell/Shell'
import CentralDeAcao from './capture/CentralDeAcao'
import Notificacoes from './shell/Notificacoes'
import MenuPessoal from './shell/MenuPessoal'
import Busca from './screens/Busca'
import TarefaForm from './forms/TarefaForm'
import CompromissoForm from './forms/CompromissoForm'
import Hoje from './screens/Hoje'
import Agenda from './screens/Agenda'
import Tarefas from './screens/Tarefas'
import TarefaDetalhe from './screens/TarefaDetalhe'
import Memoria from './screens/Memoria'
import Nota from './screens/Nota'
import NotaEditor from './screens/NotaEditor'
import Copiloto from './screens/Copiloto'
import Revisao from './screens/Revisao'
import Relatorios from './screens/Relatorios'
import Configuracoes from './screens/Configuracoes'
import './prototype.css'

// ---------------------------------------------------------------------------
// AGENDA 360 2.0 — PROTOTIPO NAVEGAVEL (UX1 → UX1.2).
//
// Isto NAO e o produto. E uma peca de avaliacao, isolada de proposito:
//
//   . todo o estado e MOCK e vive em memoria (sem Supabase, sem servico, sem
//     localStorage, sem rede — ha um teste que impede esses imports);
//   . a IA e simulada: nenhum provider, nenhum modelo, nenhuma Edge Function;
//   . delegacao, notificacoes e Copiloto sao SIMULADOS — nao ha backend
//     multiusuario, push real nem tempo real. As interacoes, porem, produzem
//     resultado observavel DENTRO da sessao: aceitar muda de fato o estado,
//     devolver escreve o motivo, o evento entra no historico da tarefa;
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
  // Uma porta só de criação (a central) e três superfícies globais que podem
  // ser chamadas de qualquer tela.
  const [central, setCentral] = useState(false)
  const [busca, setBusca] = useState(false)
  const [notificacoes, setNotificacoes] = useState(false)
  const [menu, setMenu] = useState(false)
  const [novaTarefa, setNovaTarefa] = useState(false)
  const [novoCompromisso, setNovoCompromisso] = useState(false)

  // Atalhos de quem vai avaliar no desktop.
  useEffect(() => {
    const tecla = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBusca(true) }
      // A central NÃO é fechada aqui: ela trata o próprio Escape, porque
      // desistir precisa preservar o rascunho — fechar por fora perderia o que
      // foi escrito, que é exatamente o que a captura promete não fazer.
      if (e.key === 'Escape') { setBusca(false); setNotificacoes(false); setMenu(false) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  if (!liberado()) return <Navigate to="/" replace />

  return (
    <PrototypeStore>
      <Rotas
        onCentral={() => setCentral(true)}
        onBuscar={() => setBusca(true)}
        onNotificacoes={() => setNotificacoes(true)}
        onMenuPessoal={() => setMenu(true)}
      />
      <Superficies
        central={central}
        fecharCentral={() => setCentral(false)}
        novaTarefa={novaTarefa}
        setNovaTarefa={setNovaTarefa}
        novoCompromisso={novoCompromisso}
        setNovoCompromisso={setNovoCompromisso}
        busca={busca}
        setBusca={setBusca}
        notificacoes={notificacoes}
        setNotificacoes={setNotificacoes}
        menu={menu}
        setMenu={setMenu}
      />
    </PrototypeStore>
  )
}

function Superficies({
  central, fecharCentral, novaTarefa, setNovaTarefa, novoCompromisso, setNovoCompromisso,
  busca, setBusca, notificacoes, setNotificacoes, menu, setMenu,
}) {
  const navegar = useNavigate()
  return (
    <>
      <CentralDeAcao
        aberto={central}
        aoFechar={fecharCentral}
        aoNovaTarefa={() => setNovaTarefa(true)}
        aoNovoCompromisso={() => setNovoCompromisso(true)}
        aoNovaNota={() => navegar('/prototipo/memoria/nova')}
      />
      <Busca aberto={busca} aoFechar={() => setBusca(false)} />
      <Notificacoes aberta={notificacoes} aoFechar={() => setNotificacoes(false)} />
      <MenuPessoal aberta={menu} aoFechar={() => setMenu(false)} />
      <TarefaForm aberta={novaTarefa} aoFechar={() => setNovaTarefa(false)} />
      <CompromissoForm aberta={novoCompromisso} aoFechar={() => setNovoCompromisso(false)} />
    </>
  )
}

// As telas largas (agenda, quadro, memoria, relatorios) e as estreitas
// (leitura, escrita) dividem o mesmo shell, mas nao a mesma medida — por isso a
// rota precisa dizer qual e qual.
function Rotas(props) {
  const { pathname } = useLocation()
  const largo = /\/(agenda|tarefas|memoria|relatorios)$/.test(pathname)
  // UX-M1: so o piloto do Hoje desenha o proprio topo.
  const hoje = /\/hoje$/.test(pathname) || /\/prototipo\/?$/.test(pathname)
  return (
    <Shell
      largo={largo}
      semCabecalhoMovel={hoje}
      aoCentral={props.onCentral}
      aoBuscar={props.onBuscar}
      aoNotificacoes={props.onNotificacoes}
      aoMenuPessoal={props.onMenuPessoal}
    >
      <Routes>
        <Route index element={<Navigate to="hoje" replace />} />
        <Route
          path="hoje"
          element={<Hoje aoBuscar={props.onBuscar} aoMenu={props.onMenuPessoal} />}
        />
        <Route path="agenda" element={<Agenda />} />
        <Route path="tarefas" element={<Tarefas />} />
        <Route path="tarefas/:id" element={<TarefaDetalhe />} />
        <Route path="memoria" element={<Memoria />} />
        <Route path="memoria/nova" element={<NotaEditor />} />
        <Route path="memoria/:id/editar" element={<NotaEditor />} />
        <Route path="memoria/:id" element={<Nota />} />
        <Route path="copiloto" element={<Copiloto />} />
        <Route path="revisao" element={<Revisao />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="config" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="hoje" replace />} />
      </Routes>
    </Shell>
  )
}
