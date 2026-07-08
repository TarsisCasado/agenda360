import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Today from './pages/Today'

// Code-splitting por rota: reduz o bundle inicial e acelera o carregamento no
// celular. A tela "Hoje" (principal) e carregada de imediato; as demais sob
// demanda.
const DayAgenda = lazy(() => import('./pages/DayAgenda'))
const WeekKanban = lazy(() => import('./pages/WeekKanban'))
const MonthCalendar = lazy(() => import('./pages/MonthCalendar'))
const Links = lazy(() => import('./pages/Links'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  )
}

function FullScreenLoader() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
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
    <DataProvider>
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Today />} />
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
    </DataProvider>
  )
}
