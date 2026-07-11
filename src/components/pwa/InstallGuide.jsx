import { useMemo, useState } from 'react'
import { Share, Plus, MoreVertical, Smartphone, Zap, WifiOff, Bell } from 'lucide-react'
import Modal from '../ui/Modal'
import { cx } from '../../lib/utils'

// Detecta a plataforma para mostrar o passo a passo certo (iOS x Android).
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'other'
}

const STEPS = {
  ios: [
    { icon: Share, text: 'Toque no botão Compartilhar na barra do Safari.' },
    { icon: Plus, text: 'Escolha "Adicionar à Tela de Início".' },
    { icon: Smartphone, text: 'Confirme. O app aparece como um ícone próprio.' },
  ],
  android: [
    { icon: MoreVertical, text: 'Abra o menu (⋮) do Chrome.' },
    { icon: Plus, text: 'Toque em "Adicionar à tela inicial" / "Instalar app".' },
    { icon: Smartphone, text: 'Confirme. O app abre em tela cheia, sem barra.' },
  ],
  other: [
    { icon: MoreVertical, text: 'No navegador, abra o menu de opções.' },
    { icon: Plus, text: 'Procure por "Instalar" ou "Adicionar à tela inicial".' },
    { icon: Smartphone, text: 'Confirme para ter a Agenda 360 como app.' },
  ],
}

const BENEFITS = [
  { icon: Zap, text: 'Abertura instantânea, direto da tela inicial.' },
  { icon: WifiOff, text: 'Funciona mesmo com conexão instável.' },
  { icon: Bell, text: 'Tela cheia, sem a barra do navegador.' },
]

const TABS = [
  { key: 'ios', label: 'iPhone' },
  { key: 'android', label: 'Android' },
  { key: 'other', label: 'Outro' },
]

export default function InstallGuide({ open, onClose }) {
  const detected = useMemo(detectPlatform, [])
  const [tab, setTab] = useState(detected)

  return (
    <Modal open={open} onClose={onClose} title="Instalar na tela inicial" size="sm">
      <div className="space-y-5">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Transforme a Agenda 360 em um app de verdade — a um toque de distância, todos os dias.
        </p>

        {/* Beneficios */}
        <div className="space-y-2">
          {BENEFITS.map((b, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                <b.icon size={16} />
              </span>
              <span className="text-sm text-slate-600 dark:text-slate-300">{b.text}</span>
            </div>
          ))}
        </div>

        {/* Seletor de plataforma */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                'press flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors',
                tab === t.key
                  ? 'bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-brand-300'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Passos */}
        <ol className="space-y-3">
          {STEPS[tab].map((s, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
                {i + 1}
              </span>
              <s.icon size={18} className="shrink-0 text-slate-400" />
              <span className="text-sm text-slate-600 dark:text-slate-300">{s.text}</span>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  )
}
