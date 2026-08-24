import { useEffect, useState } from 'react'
import { Bell, BellRing, BellOff, ShieldAlert, Smartphone, Settings2 } from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { pushService, isPushConfigured } from '../../services/pushService'
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
    if (!isPushConfigured()) return // botao nem e renderizado; guarda extra
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
  // Avaliado no render (nao e estado): depende so do build/ambiente.
  const configured = isPushConfigured()

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
          <button onClick={onOpenInstall} className="btn-secondary press w-full sm:w-auto">
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

  // Ambiente sem Web Push configurado (sem Supabase ou sem chave VAPID no
  // build): NAO oferece o botao. Tentar aqui so produziria o mesmo erro
  // repetidamente — estado informativo e melhor que um toque inutil.
  if (!configured) {
    return (
      <Shell compact={compact} tone="muted" icon={Settings2}
        title="Push indisponivel neste ambiente"
        text="Este ambiente ainda nao tem as notificacoes push configuradas. Os lembretes continuam aparecendo dentro do app." />
    )
  }

  // 'prompt'
  return (
    <Shell compact={compact} tone="info" icon={Bell}
      title="Ativar notificacoes deste dispositivo"
      text="Receba lembretes das suas atividades diretamente neste aparelho.">
      <button onClick={enable} className="btn-primary press w-full sm:w-auto">
        <Bell size={14} /> Ativar notificacoes
      </button>
    </Shell>
  )
}

const TONES = {
  ok: 'text-positive',
  warn: 'text-warning',
  info: 'text-accent',
  muted: 'text-muted',
}

function Shell({ compact, tone, icon: Icon, title, text, children }) {
  return (
    <div className={cx('flex gap-3', compact ? 'items-center' : 'items-start')}>
      <span className={cx('mt-0.5 shrink-0', TONES[tone])}>
        <Icon size={compact ? 16 : 18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-primary">{title}</p>
        {!compact && <p className="text-caption mt-0.5 leading-relaxed">{text}</p>}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  )
}
