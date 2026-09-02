import { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { WorkspaceProvider } from './context/WorkspaceContext'
import { DataProvider } from './context/DataContext'
import Layout from './components/layout/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import Spinner from './components/ui/Spinner'
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
const WeekKanban = lazyRoute(() => import('./pages/WeekKanban'))
const MonthCalendar = lazyRoute(() => import('./pages/MonthCalendar'))
const Links = lazyRoute(() => import('./pages/Links'))
const Assistant = lazyRoute(() => import('./pages/Assistant'))
const Reports = lazyRoute(() => import('./pages/Reports'))
const Settings = lazyRoute(() => import('./pages/Settings'))

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center py-20">
      <Spinner size={32} />
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <Spinner size={40} />
        <p className="text-sm text-slate-500">Carregando...</p>
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
                <Route path="semana" element={<WeekKanban />} />
                <Route path="mes" element={<MonthCalendar />} />
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
