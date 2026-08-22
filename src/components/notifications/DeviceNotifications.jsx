import { useState } from 'react'
import { Bell, BellRing, BellOff, ShieldAlert, Smartphone } from 'lucide-react'
import { requestNotificationPermission, showLocalNotification } from '../../hooks/useAlerts'
import { useToast } from '../../context/ToastContext'
import { describeDeviceNotifications } from '../../lib/device'
import { cx } from '../../lib/utils'

// "Notificacoes deste dispositivo": estado + acao, coerente entre desktop,
// Android e iPhone instalado como PWA. Nao esconde a opcao por engano — cada
// estado tem uma orientacao clara.
//
// variant='card'    -> bloco completo (usado em Configuracoes).
// variant='compact' -> rodape enxuto (usado na Central de alertas).
//
// onOpenInstall (opcional): abre o guia de instalacao no caso iOS nao instalado.
export default function DeviceNotifications({ variant = 'card', onOpenInstall }) {
  const { toast } = useToast()
  const [status, setStatus] = useState(() => describeDeviceNotifications())

  const enable = async () => {
    // Dispara o prompt NATIVO do dispositivo (no iOS instalado, o do iOS).
    const result = await requestNotificationPermission()
    setStatus(describeDeviceNotifications())
    if (result === 'granted') {
      showLocalNotification('Agenda 360', 'Notificacoes ativadas neste dispositivo.')
      toast('Notificacoes ativadas')
    } else if (result === 'denied') {
      toast('Permissao negada pelo dispositivo', 'error')
    }
  }

  const compact = variant === 'compact'

  // ----- estados ------------------------------------------------------------
  if (status === 'granted') {
    return (
      <Shell compact={compact} tone="ok" icon={BellRing}
        title="Notificacoes ativadas"
        text="Este dispositivo recebe as notificacoes do Agenda 360." />
    )
  }

  if (status === 'denied') {
    return (
      <Shell compact={compact} tone="warn" icon={BellOff}
        title="Notificacoes bloqueadas"
        text="Reative nas configuracoes do sistema/navegador para este site e recarregue o app." />
    )
  }

  if (status === 'ios-not-installed') {
    return (
      <Shell compact={compact} tone="info" icon={Smartphone}
        title="Adicione a Tela de Inicio"
        text="Para ativar notificacoes no iPhone, adicione o Agenda 360 a Tela de Inicio e abra pelo icone.">
        {onOpenInstall && (
          <button onClick={onOpenInstall} className="btn-secondary press w-full text-sm sm:w-auto">
            <Smartphone size={14} /> Como adicionar
          </button>
        )}
      </Shell>
    )
  }

  if (status === 'unsupported') {
    return (
      <Shell compact={compact} tone="muted" icon={ShieldAlert}
        title="Notificacoes indisponiveis"
        text="Este navegador nao suporta notificacoes de dispositivo." />
    )
  }

  // 'prompt'
  return (
    <Shell compact={compact} tone="info" icon={Bell}
      title="Ativar notificacoes deste dispositivo"
      text="Receba lembretes das suas atividades diretamente neste aparelho.">
      <button onClick={enable} className="btn-primary press w-full text-sm sm:w-auto">
        <Bell size={14} /> Ativar notificacoes
      </button>
    </Shell>
  )
}

const TONES = {
  ok:    'text-emerald-600 dark:text-emerald-400',
  warn:  'text-amber-600 dark:text-amber-400',
  info:  'text-brand-600 dark:text-brand-300',
  muted: 'text-slate-400',
}

function Shell({ compact, tone, icon: Icon, title, text, children }) {
  return (
    <div className={cx('flex gap-3', compact ? 'items-center' : 'items-start')}>
      <span className={cx('mt-0.5 shrink-0', TONES[tone])}>
        <Icon size={compact ? 16 : 18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
        {!compact && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{text}</p>}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}
