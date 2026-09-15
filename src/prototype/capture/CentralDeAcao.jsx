import { useEffect, useRef, useState } from 'react'
import { X, ListTodo, CalendarDays, PenLine, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cx } from '../../lib/utils'
import { useProto, useAcoes, useDesktop } from '../store/contexto'
import { interpretar, espera } from '../mock/ia'
import { somarDias, iso, rotuloDeData } from '../mock/dados'
import { Botao } from '../parts/base'

// ---------------------------------------------------------------------------
// CENTRAL DE ACAO — a porta unica do [+], igual no desktop e no telefone.
//
// O UX1.1.1 tinha DUAS portas: um botao "Capturar" que abria uma superficie e
// botoes separados de criacao. Duas portas para a mesma intencao obrigam a
// pessoa a classificar antes de escrever — exatamente o contrario de CAPTURE
// FIRST, ORGANIZE LATER.
//
// Agora ha uma so, e a propria central JA e a captura: o campo "O que voce quer
// registrar?" esta ali, aberto, sem nada antes dele. Os atalhos ficam ao lado
// para quem JA SABE o que quer criar — e nenhum deles passa pela IA.
//
// NO TELEFONE O TECLADO NAO SOBE SOZINHO. Abrir o [+] para tocar num atalho e
// tao legitimo quanto abrir para escrever; um teclado que salta cobre metade da
// tela e responde uma pergunta que ninguem fez.
//
// Fechar nao cria nada. O que foi escrito vira rascunho da sessao, para que
// desistir nao seja o mesmo que perder.
// ---------------------------------------------------------------------------
export default function CentralDeAcao({ aberto, aoFechar, aoNovaTarefa, aoNovoCompromisso, aoNovaNota }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const desktop = useDesktop()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [sugestao, setSugestao] = useState(null)
  const [pensando, setPensando] = useState(false)
  const [ajustando, setAjustando] = useState(false)
  const [hora, setHora] = useState('')
  const campo = useRef(null)

  const amanha = iso(somarDias(new Date(`${estado.hoje}T12:00:00`), 1))

  useEffect(() => {
    if (!aberto) return undefined
    setTexto(estado.rascunho?.texto || '')
    setSugestao(null)
    setAjustando(false)
    // Só o desktop ganha o cursor: no telefone, focar é convocar o teclado.
    if (!desktop) return undefined
    const t = setTimeout(() => campo.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [aberto, estado.rascunho, desktop])

  // Escape é tratado AQUI, e não pelo atalho global: fechar por fora fecharia
  // sem passar por `fechar()`, e o rascunho — a promessa de que desistir não é
  // perder — ficaria para trás.
  useEffect(() => {
    if (!aberto) return undefined
    const tecla = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (texto.trim()) acoes.guardarRascunho({ texto: texto.trim() })
      aoFechar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, texto, acoes, aoFechar])

  // A interpretacao roda em segundo plano e nunca bloqueia o campo.
  useEffect(() => {
    if (!aberto || texto.trim().length < 6) { setSugestao(null); return undefined }
    let vivo = true
    setPensando(true)
    espera(380).then(() => {
      if (!vivo) return
      const s = interpretar(texto, { hoje: estado.hoje, amanha })
      setSugestao(s)
      setHora(s?.dados?.inicio || '')
      setPensando(false)
    })
    return () => { vivo = false; setPensando(false) }
  }, [texto, aberto, estado.hoje, amanha])

  if (!aberto) return null

  const fechar = () => {
    // Desistir preserva o que foi escrito (durante a sessao) e NAO cria nada.
    if (texto.trim()) acoes.guardarRascunho({ texto: texto.trim() })
    aoFechar()
  }

  const guardar = () => { acoes.guardar(texto); aoFechar() }

  const confirmarSugestao = () => {
    if (sugestao.especie === 'compromisso') {
      acoes.criarCompromisso({ ...sugestao.dados, inicio: hora, fim: maisUmaHora(hora) })
    } else if (sugestao.especie === 'tarefa') {
      acoes.criarTarefa(sugestao.dados)
    } else {
      acoes.guardarReferencia(texto, sugestao.dados.titulo)
    }
    aoFechar()
  }

  const atalho = (Icone, rotulo, acao) => (
    <button
      key={rotulo}
      type="button"
      onClick={() => { aoFechar(); acao() }}
      className="press flex items-center gap-2 rounded-control border border-hairline px-3 py-2 text-[13px] font-medium text-secondary transition hover:border-accent hover:text-accent-text"
    >
      <Icone size={15} /> {rotulo}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-start lg:pt-[12vh]">
      <button
        aria-label="Fechar"
        onClick={fechar}
        className="animate-backdrop absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Criar ou capturar"
        className="animate-sheet relative w-full max-w-[560px] rounded-t-sheet border border-hairline bg-surface p-5 pb-7 shadow-float lg:rounded-sheet lg:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className="text-[17px] font-semibold leading-snug">O que você quer registrar?</h2>
          <button onClick={fechar} aria-label="Fechar" className="press -m-1 p-1 text-muted">
            <X size={19} />
          </button>
        </div>

        {/* O campo É a captura. Não há um botão que abre outra superfície. */}
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          aria-label="O que você quer registrar?"
          placeholder="Uma frase basta. Organizo depois."
          className="w-full resize-none bg-transparent text-[16px] leading-relaxed text-primary outline-none placeholder:text-faint"
        />

        {/* GUARDAR e sempre a acao principal e nunca depende da IA. */}
        <div className="mt-3 flex items-center gap-3 border-t border-hairline pt-3.5">
          <Botao variante="primario" onClick={guardar} disabled={!texto.trim()} className={cx(!texto.trim() && 'opacity-40')}>
            Guardar
          </Botao>
          {pensando && <span className="text-[12.5px] text-faint">lendo…</span>}
        </div>

        {/* Atalhos: para quem JÁ SABE. Somem enquanto há texto, para não
            competir com o que a pessoa está escrevendo. */}
        {!texto.trim() && (
          <div className="mt-4 border-t border-hairline pt-4">
            <p className="px-secao mb-2">Ou crie direto</p>
            <div className="grid grid-cols-2 gap-2">
              {atalho(ListTodo, 'Nova tarefa', () => aoNovaTarefa?.())}
              {atalho(CalendarDays, 'Novo compromisso', () => aoNovoCompromisso?.())}
              {atalho(PenLine, 'Nova nota', () => aoNovaNota?.())}
              {atalho(Sparkles, 'Conversar com o Copiloto', () => navegar('/prototipo/copiloto'))}
            </div>
          </div>
        )}

        {/* A sugestao vem depois, secundaria, e sempre pode ser ignorada. */}
        {sugestao && !pensando && (
          <div className="px-entra mt-4 rounded-row border border-hairline bg-surface-2 px-4 py-3.5">
            <p className="text-[13.5px] text-secondary">{sugestao.frase}</p>

            {sugestao.especie === 'compromisso' && (
              <p className="mt-2 text-[15px] font-semibold">
                {sugestao.dados.titulo}
                <span className="px-hora ml-2 text-[13px] font-normal text-secondary">
                  {rotuloDeData(sugestao.dados.data, estado.hoje)} · {hora}
                </span>
              </p>
            )}

            {ajustando && sugestao.especie === 'compromisso' && (
              <div className="mt-3 flex items-center gap-2">
                <label className="text-[12.5px] text-muted" htmlFor="px-hora-ajuste">Horário</label>
                <input
                  id="px-hora-ajuste"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="px-campo w-[92px] py-1"
                />
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Botao variante="secundario" onClick={confirmarSugestao}>{sugestao.acao}</Botao>
              {sugestao.especie === 'compromisso' && !ajustando && (
                <Botao variante="fantasma" onClick={() => setAjustando(true)}>Ajustar</Botao>
              )}
            </div>
          </div>
        )}

        <p className="mt-4 text-[12px] leading-relaxed text-faint">
          Fechar não cria nada. O que você escreveu continua aqui.
        </p>
      </div>
    </div>
  )
}

function maisUmaHora(hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number)
  return `${String(((h || 0) + 1) % 24).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
}
