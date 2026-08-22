import { useEffect, useState } from 'react'
import { Bell, BellRing, BellOff, ShieldAlert, Smartphone } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { pushService } from '../../services/pushService'
import { describeDeviceNotifications } from '../../lib/device'
import { cx } from '../../lib/utils'

// "Notificacoes deste dispositivo": estado + acao, coerente entre desktop,
// Android e iPhone instalado como PWA. Nao esconde a opcao por engano — cada
// estado tem uma orientacao clara.
//
// A ACAO e Web Push DE VERDADE (pushService.subscribe -> VAPID + subscription
// persistida no Supabase -> push-delivery-worker entrega mesmo com o app
// fechado/tela bloqueada) — nao so a permissao local do navegador.
//
// variant='card'    -> bloco completo (usado em Configuracoes).
// variant='compact' -> rodape enxuto (usado na Central de alertas).
//
// onOpenInstall (opcional): abre o guia de instalacao no caso iOS nao instalado.
const SUBSCRIBE_ERROR_MESSAGES = {
  demo_mode: 'Notificacoes push exigem o modo Supabase (indisponivel no modo demo).',
  vapid_not_configured: 'Notificacoes push ainda nao foram configuradas neste ambiente.',
  no_user: 'Faca login novamente para ativar as notificacoes.',
  subscribe_failed: 'Nao foi possivel ativar as notificacoes agora. Tente novamente.',
}

export default function DeviceNotifications({ variant = 'card', onOpenInstall }) {
  const { toast } = useToast()
  const { user } = useAuth()
  // Chute inicial SINCRONO (baseado so em Notification.permission/plataforma);
  // ajustado abaixo para 'granted' se ja existir uma subscription real.
  const [status, setStatus] = useState(() => describeDeviceNotifications())

  useEffect(() => {
    if (status !== 'prompt') return
    let cancelled = false
    pushService.isSubscribed().then((subscribed) => {
      if (!cancelled && subscribed) setStatus('granted')
    })
    return () => {
      cancelled = true
    }
  }, [status])

  const enable = async () => {
    const result = await pushService.subscribe(user?.id)
    if (result.ok) {
      setStatus('granted')
      toast('Notificacoes ativadas neste dispositivo')
      return
    }
    if (result.reason === 'denied') {
      setStatus('denied')
      toast('Permissao negada pelo dispositivo', 'error')
      return
    }
    if (result.reason === 'unsupported') {
      setStatus('unsupported')
      toast('Este navegador nao suporta notificacoes push', 'error')
      return
    }
    toast(SUBSCRIBE_ERROR_MESSAGES[result.reason] || 'Nao foi possivel ativar as notificacoes', 'error')
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
