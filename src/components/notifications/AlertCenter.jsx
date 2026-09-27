import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, AlertTriangle, Clock, Check, ChevronRight, Settings2 } from 'lucide-react'
import { useAlerts } from '../../hooks/useAlerts'
import { useEscapeKey } from '../../hooks/useEscapeKey'
import { formatShort } from '../../lib/date'
import { cx } from '../../lib/utils'
import Sheet from '../ui/Sheet'
import DeviceNotifications from './DeviceNotifications'

// ---------------------------------------------------------------------------
// ALERTAS — o que precisa da sua atencao AGORA.
//
// Mudou: deixou de ser um painel administrativo (cabecalho + chip de contagem
// + divisores duros) e virou uma folha compacta com a mesma linguagem das
// listas do produto. E a configuracao de push saiu do meio dos alertas: agora
// e um acesso discreto no rodape, porque e ajuste de aparelho, nao alerta.
// ---------------------------------------------------------------------------
export default function AlertCenter() {
  const { alerts, count } = useAlerts()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showDevice, setShowDevice] = useState(false)
  useEscapeKey(open, () => setOpen(false))

  const goToTask = () => {
    setOpen(false)
    navigate('/dia')
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Alertas (${count})` : 'Alertas'}
        className="icon-btn relative"
      >
        <Bell size={19} />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-danger ring-2 ring-canvas" />
          </span>
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Alertas"
        subtitle={count > 0 ? `${count} pedindo atenção` : 'Nada pendente'}
        maxWidth="max-w-md"
      >
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-positive">
              <Check size={20} />
            </span>
            <p className="text-[15px] font-semibold text-primary">Tudo em dia</p>
            <p className="text-caption max-w-[16rem]">
              Nenhuma atividade atrasada ou com lembrete para agora.
            </p>
          </div>
        ) : (
          <ul className="list">
            {alerts.map((a) => (
              <li key={a.id}>
                <button
                  onClick={goToTask}
                  className="flex w-full items-center gap-3 bg-surface px-2 py-3 text-left transition-colors active:bg-surface-2"
                >
                  <span
                    className={cx(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      a.type === 'overdue'
                        ? 'bg-danger/12 text-danger'
                        : 'bg-warning/12 text-warning',
                    )}
                  >
                    {a.type === 'overdue' ? <AlertTriangle size={15} /> : <Clock size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-primary">
                      {a.task.title}
                    </span>
                    <span className="text-caption">
                      {a.type === 'overdue'
                        ? `Atrasada · ${formatShort(a.task.date)}`
                        : `Lembrete hoje${a.task.start_time ? ' · ' + a.task.start_time : ''}`}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Ajuste do aparelho — separado dos alertas do usuario. */}
        <div className="mt-3 border-t hair pt-3">
          {showDevice ? (
            <DeviceNotifications variant="compact" />
          ) : (
            <button
              onClick={() => setShowDevice(true)}
              className="flex w-full items-center gap-2.5 rounded-row px-2 py-2.5 text-left transition-colors active:bg-surface-2"
            >
              <Settings2 size={15} className="shrink-0 text-muted" />
              <span className="text-secondary-sm flex-1">Notificações deste aparelho</span>
              <ChevronRight size={15} className="shrink-0 text-faint" />
            </button>
          )}
        </div>
      </Sheet>
    </>
  )
}
