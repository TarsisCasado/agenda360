import { useRef, useState } from 'react'
import { Check, CalendarClock } from 'lucide-react'
import { cx } from '../../lib/utils'

// Linha com gesto de swipe (mobile). Direita -> onSwipeRight (concluir);
// esquerda -> onSwipeLeft (reagendar). Só engata quando o movimento é
// predominantemente horizontal (não sequestra o scroll vertical). O toque
// normal no conteúdo continua funcionando (abre detalhe).
const THRESHOLD = 72

export default function SwipeRow({ children, onSwipeRight, onSwipeLeft, disabled }) {
  const [dx, setDx] = useState(0)
  const start = useRef(null)
  const axis = useRef(null) // 'x' | 'y' | null

  const onStart = (e) => {
    if (disabled) return
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY }
    axis.current = null
  }
  const onMove = (e) => {
    if (disabled || !start.current) return
    const t = e.touches[0]
    const mx = t.clientX - start.current.x
    const my = t.clientY - start.current.y
    if (axis.current === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      axis.current = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'
    }
    if (axis.current === 'x') {
      // clamp e resistência nas pontas
      const clamped = Math.max(-120, Math.min(120, mx))
      setDx(clamped)
    }
  }
  const onEnd = () => {
    if (axis.current === 'x') {
      if (dx >= THRESHOLD && onSwipeRight) onSwipeRight()
      else if (dx <= -THRESHOLD && onSwipeLeft) onSwipeLeft()
    }
    setDx(0); start.current = null; axis.current = null
  }

  const revealing = Math.abs(dx) > 4
  return (
    <div className="relative overflow-hidden">
      {/* ação à esquerda (concluir) */}
      <div className={cx('absolute inset-y-0 left-0 flex items-center gap-1.5 bg-emerald-500 px-4 text-sm font-semibold text-white', dx > 4 ? 'opacity-100' : 'opacity-0')}>
        <Check size={18} /> {dx >= THRESHOLD ? 'Concluir' : ''}
      </div>
      {/* ação à direita (reagendar) */}
      <div className={cx('absolute inset-y-0 right-0 flex items-center gap-1.5 bg-amber-500 px-4 text-sm font-semibold text-white', dx < -4 ? 'opacity-100' : 'opacity-0')}>
        {dx <= -THRESHOLD ? 'Reagendar' : ''} <CalendarClock size={18} />
      </div>
      <div
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
        style={{ transform: `translateX(${dx}px)`, transition: revealing ? 'none' : 'transform 0.2s ease-out' }}
        className="relative bg-white dark:bg-slate-900"
      >
        {children}
      </div>
    </div>
  )
}
