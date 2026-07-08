import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import Layout from './components/layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DayAgenda from './pages/DayAgenda'
import WeekKanban from './pages/WeekKanban'
import MonthCalendar from './pages/MonthCalendar'
import Links from './pages/Links'
import Assistant from './pages/Assistant'
import Reports from './pages/Reports'
import Settings from './pages/Settings'

function FullScreenLoader() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
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
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
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
    </DataProvider>
  )
}
