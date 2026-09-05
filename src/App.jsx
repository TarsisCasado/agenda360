import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { DataProvider } from './context/DataContext'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Spinner from './components/ui/Spinner'
import { Skeleton } from './components/ui/Skeleton'
import { lazyRoute } from './lib/lazyRoute'
import Login from './pages/Login'
import Today from './pages/Today'

// Code-splitting por rota: reduz o bundle inicial e acelera o carregamento no
// celular. A tela "Hoje" (principal) e carregada de imediato; as demais sob
// demanda, via lazyRoute — que recarrega a pagina uma vez quando o chunk
// pedido nao existe mais (aba aberta durante um deploy). Ver lib/lazyRoute.js.
const Tasks = lazyRoute(() => import('./pages/Tasks'))
const Ideas = lazyRoute(() => import('./pages/Ideas'))
const IdeaEditor = lazyRoute(() => import('./pages/IdeaEditor'))
const Inbox = lazyRoute(() => import('./pages/Inbox'))
const DayAgenda = lazyRoute(() => import('./pages/DayAgenda'))
const Links = lazyRoute(() => import('./pages/Links'))
const Assistant = lazyRoute(() => import('./pages/Assistant'))
const Reports = lazyRoute(() => import('./pages/Reports'))
const Settings = lazyRoute(() => import('./pages/Settings'))

// CP5.7 — trocar de rota nao pode parecer "carregando um site". Um spinner
// grande no meio da tela e a imagem do carregamento de pagina; um esqueleto com
// a FORMA do que vem (titulo, contexto, algumas linhas) e a do aplicativo que
// ja sabe o que vai mostrar. Discreto de proposito: se a rota abre em 80ms, o
// que se ve e um piscar de estrutura, nao um pedido de espera.
function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-in" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-2 h-3 w-28" />
      <div className="mt-6 space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={32} />
        <p className="text-caption">Abrindo…</p>
      </div>
    </div>
  )
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <FullScreenLoader />

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <WorkspaceProvider>
      <DataProvider>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Editor de Ideias em TELA CHEIA (fora do Layout: sem
                  sidebar/bottom-nav, viewport inteira, teclado/safe-area). */}
              <Route path="/ideias/:id" element={<IdeaEditor />} />
              <Route path="/" element={<Layout />}>
                <Route index element={<Today />} />
                <Route path="tarefas" element={<Tasks />} />
                <Route path="ideias" element={<Ideas />} />
                <Route path="caixa" element={<Inbox />} />
                <Route path="dia" element={<DayAgenda />} />
                {/* CP5.2 — "Semana" e "Mes" deixaram de ser destinos e viraram
                    VISOES dentro de Tarefas e de Agenda. As rotas antigas
                    continuam valendo (link salvo, atalho, paleta de comandos) e
                    redirecionam para o recorte equivalente. Os componentes
                    WeekKanban e MonthCalendar seguem existindo e sao montados
                    pelas visoes — servem tambem de rollback. */}
                <Route path="semana" element={<Navigate to="/tarefas?visao=semana" replace />} />
                <Route path="mes" element={<Navigate to="/dia?visao=mes" replace />} />
                <Route path="calendario" element={<Navigate to="/dia?visao=mes" replace />} />
                <Route path="kanban" element={<Navigate to="/tarefas?visao=semana" replace />} />
                <Route path="links" element={<Links />} />
                <Route path="assistente" element={<Assistant />} />
                <Route path="relatorios" element={<Reports />} />
                <Route path="config" element={<Settings />} />
              </Route>
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </DataProvider>
    </WorkspaceProvider>
  )
}
