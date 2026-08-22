import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Clock, BellRing, CheckCircle2 } from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { formatShort } from '../../lib/date'
import { cx } from '../../lib/utils'
import DeviceNotifications from './DeviceNotifications'

// Central de alertas (sino no topo). Notificacoes in-app + estado de
// notificacoes do dispositivo (coerente com iPhone instalado como PWA).
export default function AlertCenter() {
  const { alerts, count } = useAlerts()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  useEscapeKey(open, () => setOpen(false))

  const goToTask = () => {
    setOpen(false)
    navigate('/dia')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Alertas"
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="fixed left-2 right-2 top-16 z-40 max-h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
              <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                <BellRing size={16} /> Central de alertas
              </h3>
              {count > 0 && (
                <span className="chip bg-red-50 text-red-600 dark:bg-red-950/40">
                  {count}
                </span>
              )}
            </div>

            <div className="max-h-[46vh] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                  <p className="text-sm text-slate-500">Tudo em dia! Sem alertas.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                  {alerts.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={goToTask}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      >
                        <span
                          className={cx(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            a.type === 'overdue'
                              ? 'bg-red-50 text-red-500 dark:bg-red-950/40'
                              : 'bg-amber-50 text-amber-500 dark:bg-amber-950/40',
                          )}
                        >
                          {a.type === 'overdue' ? (
                            <AlertTriangle size={15} />
                          ) : (
                            <Clock size={15} />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {a.task.title}
                          </span>
                          <span className="text-xs text-slate-400">
                            {a.type === 'overdue'
                              ? `Atrasada · ${formatShort(a.task.date)}`
                              : `Lembrete hoje${a.task.start_time ? ' · ' + a.task.start_time : ''}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 p-3 dark:border-slate-700">
              <DeviceNotifications variant="compact" />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
