import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { cx } from '../../lib/utils'
import { useProto, useAcoes } from '../store/contexto'
import { interpretar, espera } from '../mock/ia'
import { somarDias, iso, rotuloDeData } from '../mock/dados'
import { Botao } from '../parts/base'

// ---------------------------------------------------------------------------
// CAPTURA — a peca mais importante do 2.0.
//
// A primeira pergunta e uma so: "O que voce quer registrar?". Sem catalogo,
// sem escolher tipo, sem decidir onde guardar. Capturar primeiro, organizar
// depois.
//
// GUARDAR esta sempre disponivel assim que existe texto, e nao depende de
// interpretacao nenhuma. A sugestao da IA aparece DEPOIS, menor, ao lado — e e
// uma oferta, nao um pedagio: ninguem precisa aceita-la para capturar.
//
// Fechar nao cria nada. O que foi escrito vira rascunho da sessao, para que
// desistir nao seja o mesmo que perder.
// ---------------------------------------------------------------------------
export default function CaptureOverlay({ aberto, aoFechar }) {
  const { estado } = useProto()
  const acoes = useAcoes()
  const [texto, setTexto] = useState('')
  const [sugestao, setSugestao] = useState(null)
  const [pensando, setPensando] = useState(false)
  const [ajustando, setAjustando] = useState(false)
  const [hora, setHora] = useState('')
  const campo = useRef(null)

  const amanha = iso(somarDias(new Date(`${estado.hoje}T12:00:00`), 1))

  useEffect(() => {
    if (!aberto) return
    setTexto(estado.rascunho?.texto || '')
    setSugestao(null)
    setAjustando(false)
    const t = setTimeout(() => campo.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [aberto, estado.rascunho])

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-start lg:pt-[12vh]">
      <button
        aria-label="Fechar captura"
        onClick={fechar}
        className="animate-backdrop absolute inset-0 bg-black/35 backdrop-blur-[2px]"
      />
      <div className="animate-sheet relative w-full max-w-[560px] rounded-t-sheet border border-hairline bg-surface p-5 pb-7 shadow-float lg:rounded-sheet lg:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="px-serif text-[19px] font-semibold leading-snug">
            O que você quer registrar?
          </h2>
          <button onClick={fechar} aria-label="Fechar" className="press -m-1 p-1 text-muted">
            <X size={19} />
          </button>
        </div>

        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Uma frase basta. Organizo depois."
          className="w-full resize-none bg-transparent text-[16.5px] leading-relaxed text-primary outline-none placeholder:text-faint"
        />

        {/* GUARDAR e sempre a acao principal e nunca depende da IA. */}
        <div className="mt-4 flex items-center gap-3 border-t border-hairline pt-4">
          <Botao variante="primario" onClick={guardar} disabled={!texto.trim()} className={cx(!texto.trim() && 'opacity-40')}>
            Guardar
          </Botao>
          {pensando && <span className="text-[12.5px] text-faint">lendo…</span>}
        </div>

        {/* A sugestao vem depois, secundaria, e sempre pode ser ignorada. */}
        {sugestao && !pensando && (
          <div className="px-entra mt-4 rounded-row border border-hairline bg-surface-2 px-4 py-3.5">
            <p className="text-[13.5px] text-secondary">{sugestao.frase}</p>

            {sugestao.especie === 'compromisso' && (
              <p className="px-serif mt-2 text-[15.5px] font-semibold">
                {sugestao.dados.titulo}
                <span className="px-hora ml-2 font-sans text-[13px] font-normal text-secondary">
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
                  className="w-[86px] rounded-control border border-hairline bg-surface px-2 py-1 text-[14px] outline-none focus:border-accent"
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
