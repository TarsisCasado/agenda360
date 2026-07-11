import { useMemo, useState } from 'react'
import { Sparkles, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { savePreferences } from '../../lib/preferences'
import { cx } from '../../lib/utils'

// Onboarding CONVERSACIONAL (nao e tutorial). Uma sequencia curta, elegante,
// que descobre a rotina do usuario e alimenta o Context Engine (via
// preferences locais). Sempre permite "Pular por enquanto".

const WAKE = ['05:00', '06:00', '07:00', '08:00', '09:00']
const SLEEP = ['21:00', '22:00', '23:00', '00:00', '01:00']
const WORK_START = ['07:00', '08:00', '09:00', '10:00']
const WORK_END = ['16:00', '17:00', '18:00', '19:00', '20:00']
const DAYS = [
  { k: 1, s: 'S' }, { k: 2, s: 'T' }, { k: 3, s: 'Q' }, { k: 4, s: 'Q' },
  { k: 5, s: 'S' }, { k: 6, s: 'S' }, { k: 0, s: 'D' },
]
const GOALS = ['Mais organização', 'Mais foco', 'Equilíbrio', 'Produtividade']

// Chip de escolha unica
function Choice({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'press rounded-xl border px-4 py-3 text-sm font-semibold transition-all',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-900/30 dark:text-brand-200'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {children}
    </button>
  )
}

export default function OnboardingFlow({ onDone }) {
  const { user } = useAuth()
  const { workspaceId } = useWorkspace()
  const firstName = user?.full_name?.split(' ')[0] || null
  const [step, setStep] = useState(0)
  const [a, setA] = useState({
    wakeTime: '', sleepTime: '', workStart: '', workEnd: '',
    workDays: [1, 2, 3, 4, 5], hasKids: null, doesSports: null,
    studies: null, dayPreference: '', goal: '',
  })

  const set = (patch) => setA((s) => ({ ...s, ...patch }))
  const toggleDay = (k) =>
    setA((s) => ({
      ...s,
      workDays: s.workDays.includes(k)
        ? s.workDays.filter((d) => d !== k)
        : [...s.workDays, k].sort(),
    }))

  const finish = (skipped = false) => {
    savePreferences(workspaceId, { ...a, onboarded: true, skipped })
    onDone?.()
  }

  // Perguntas (a intro e o fim ficam fora do array de "perguntas").
  const questions = useMemo(
    () => [
      {
        q: 'A que horas você costuma acordar?',
        render: () => (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {WAKE.map((t) => <Choice key={t} active={a.wakeTime === t} onClick={() => { set({ wakeTime: t }); next() }}>{t}</Choice>)}
          </div>
        ),
      },
      {
        q: 'E a que horas costuma dormir?',
        render: () => (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {SLEEP.map((t) => <Choice key={t} active={a.sleepTime === t} onClick={() => { set({ sleepTime: t }); next() }}>{t}</Choice>)}
          </div>
        ),
      },
      {
        q: 'Qual seu horário de trabalho?',
        render: () => (
          <div className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Início</p>
              <div className="grid grid-cols-4 gap-2">
                {WORK_START.map((t) => <Choice key={t} active={a.workStart === t} onClick={() => set({ workStart: t })}>{t}</Choice>)}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Fim</p>
              <div className="grid grid-cols-5 gap-2">
                {WORK_END.map((t) => <Choice key={t} active={a.workEnd === t} onClick={() => set({ workEnd: t })}>{t}</Choice>)}
              </div>
            </div>
          </div>
        ),
      },
      {
        q: 'Em quais dias você trabalha?',
        render: () => (
          <div className="flex flex-wrap justify-center gap-2">
            {DAYS.map((d) => (
              <button
                key={d.k}
                type="button"
                onClick={() => toggleDay(d.k)}
                className={cx(
                  'press flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition-all',
                  a.workDays.includes(d.k)
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                )}
              >
                {d.s}
              </button>
            ))}
          </div>
        ),
      },
      {
        q: 'Para eu entender melhor sua rotina...',
        render: () => (
          <div className="space-y-3">
            {[
              ['hasKids', 'Você tem filhos?'],
              ['doesSports', 'Pratica esportes?'],
              ['studies', 'Está estudando?'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
                <div className="flex gap-2">
                  <Choice active={a[key] === true} onClick={() => set({ [key]: true })}>Sim</Choice>
                  <Choice active={a[key] === false} onClick={() => set({ [key]: false })}>Não</Choice>
                </div>
              </div>
            ))}
          </div>
        ),
      },
      {
        q: 'Você rende mais de manhã ou à noite?',
        render: () => (
          <div className="grid grid-cols-2 gap-2">
            <Choice active={a.dayPreference === 'morning'} onClick={() => { set({ dayPreference: 'morning' }); next() }}>🌅 De manhã</Choice>
            <Choice active={a.dayPreference === 'night'} onClick={() => { set({ dayPreference: 'night' }); next() }}>🌙 À noite</Choice>
          </div>
        ),
      },
      {
        q: 'Por fim: qual seu objetivo principal?',
        render: () => (
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map((g) => <Choice key={g} active={a.goal === g} onClick={() => { set({ goal: g }); next() }}>{g}</Choice>)}
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a],
  )

  const total = questions.length
  const isIntro = step === 0
  const isOutro = step === total + 1
  const qIndex = step - 1
  const question = !isIntro && !isOutro ? questions[qIndex] : null

  function next() {
    setStep((s) => Math.min(total + 1, s + 1))
  }
  function back() {
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b from-brand-50 via-white to-white px-5 pb-safe pt-safe dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="w-full max-w-md">
        {/* Progresso */}
        {!isIntro && (
          <div className="mb-8 flex items-center gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={cx(
                  'h-1 flex-1 rounded-full transition-colors duration-300',
                  i < step ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700',
                )}
              />
            ))}
          </div>
        )}

        {/* Avatar + fala do assistente */}
        <div className="mb-6 flex items-start gap-3 animate-in">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
            <Sparkles size={18} />
          </div>
          <div className="pt-1">
            {isIntro && (
              <>
                <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                  Olá{firstName ? `, ${firstName}` : ''} 👋
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Vou organizar sua rotina. Em menos de dois minutos.
                </p>
              </>
            )}
            {isOutro && (
              <>
                <h1 className="text-xl font-extrabold text-slate-800 dark:text-slate-100">
                  Preparei tudo para você.
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  Sua rotina agora guia as sugestões do assistente.
                </p>
              </>
            )}
            {question && (
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{question.q}</h2>
            )}
          </div>
        </div>

        {/* Corpo da pergunta */}
        <div key={step} className="animate-scale-in">
          {question && <div className="mb-6">{question.render()}</div>}
        </div>

        {/* Acoes */}
        <div className="mt-2 flex items-center justify-between gap-3">
          {isIntro ? (
            <>
              <button onClick={() => finish(true)} className="btn-ghost">Pular por enquanto</button>
              <button onClick={next} className="btn-primary press">
                Começar <ArrowRight size={16} />
              </button>
            </>
          ) : isOutro ? (
            <button onClick={() => finish(false)} className="btn-primary press mx-auto w-full justify-center py-3 text-base">
              <Check size={18} /> Tudo pronto
            </button>
          ) : (
            <>
              <button onClick={back} className="btn-ghost" aria-label="Voltar">
                <ArrowLeft size={16} /> Voltar
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => finish(true)} className="text-sm font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  Pular
                </button>
                <button onClick={next} className="btn-primary press">
                  Continuar <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
