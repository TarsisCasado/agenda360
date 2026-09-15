import { useEffect, useRef, useState } from 'react'
import { X, ListTodo, CalendarDays, PenLine, Sparkles, ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cx } from '../../lib/utils'
import { useProto, useAcoes, useDesktop } from '../store/contexto'
import { interpretar, espera } from '../mock/ia'
import { somarDias, iso, rotuloDeData } from '../mock/dados'
import { Botao } from '../parts/base'

// ---------------------------------------------------------------------------
// CENTRAL DE ACAO — a porta unica do [+].
//
// A arquitetura foi aprovada no UX1.2; o UX1.2.1 mexe na APRESENTACAO. O que
// saiu foi texto que explicava o que o proprio controle ja diz: "Uma frase
// basta. Organizo depois.", "Ou crie direto", "Fechar nao cria nada". Um campo
// grande sob a pergunta "O que voce quer registrar?" ja e o convite; a frase
// abaixo dele so ocupava a metade superior do telefone.
//
// O que ficou: a pergunta, o campo, e quatro atalhos numa linha.
//
// GUARDAR so aparece quando ha o que guardar. Um botao primario desabilitado
// ocupando a tela desde o primeiro instante e ruido com aparencia de acao.
//
// E a regra que o UX1.2.1 tornou explicita: BOTTOM SHEET E PARA INTERACAO
// CURTA. Escolher "Nova tarefa" FECHA esta superficie e abre a apropriada —
// empilhar um formulario de dez campos por cima desta folha era justamente o
// "amontoado" que o QA viu.
//
// No telefone o teclado continua sem subir sozinho.
//
// ESCOPO: o UX1.2.1 congelou o desktop, e esta peça é compartilhada. Por isso a
// simplificação do §5 vale para o TELEFONE; no desktop a folha continua
// exatamente como foi aprovada no UX1.2. Duas composições no mesmo componente é
// o preço de não mexer numa tela já aprovada — e está declarado aqui em vez de
// acontecer no silêncio.
// ---------------------------------------------------------------------------
// Dois rótulos para o mesmo atalho: o longo é o que o desktop aprovou; o curto
// é o que cabe em quatro colunas no telefone.
const ATALHOS = [
  { chave: 'tarefa', rotulo: 'Tarefa', rotuloLongo: 'Nova tarefa', icone: ListTodo },
  { chave: 'compromisso', rotulo: 'Compromisso', rotuloLongo: 'Novo compromisso', icone: CalendarDays },
  { chave: 'nota', rotulo: 'Nota', rotuloLongo: 'Nova nota', icone: PenLine },
  { chave: 'copiloto', rotulo: 'Copiloto', rotuloLongo: 'Conversar com o Copiloto', icone: Sparkles },
]

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

  if (!aberto) return null

  const fechar = () => {
    // Desistir preserva o que foi escrito (durante a sessao) e NAO cria nada.
    if (texto.trim()) acoes.guardarRascunho({ texto: texto.trim() })
    aoFechar()
  }

  const guardar = () => { acoes.guardar(texto); aoFechar() }

  // Fecha ANTES de abrir a superfície longa — nunca uma sheet sobre a outra.
  const irPara = (chave) => {
    aoFechar()
    if (chave === 'tarefa') aoNovaTarefa?.()
    else if (chave === 'compromisso') aoNovoCompromisso?.()
    else if (chave === 'nota') aoNovaNota?.()
    else navegar('/prototipo/copiloto')
  }

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

  const temTexto = Boolean(texto.trim())

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
        className="animate-sheet pb-safe relative w-full max-w-[560px] rounded-t-sheet border border-hairline bg-surface p-4 shadow-float lg:rounded-sheet lg:p-6"
      >
        <div className="mb-2 flex items-start justify-between gap-4">
          <h2 className={cx('font-semibold leading-snug', desktop ? 'text-[17px]' : 'text-[16.5px]')}>
            O que você quer registrar?
          </h2>
          <button onClick={fechar} aria-label="Fechar" className="press -m-1 p-1 text-muted">
            <X size={19} />
          </button>
        </div>


        {/* O campo É a captura. */}
        <textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={temTexto ? 3 : 2}
          aria-label="O que você quer registrar?"
          placeholder={desktop ? 'Uma frase basta. Organizo depois.' : undefined}
          /* No telefone, sem placeholder: a pergunta acima já é o rótulo, e o
             campo se anuncia pela superfície — um retângulo tocável. */
          className={cx(
            'w-full resize-none text-[16px] leading-relaxed text-primary outline-none placeholder:text-faint',
            desktop
              ? 'bg-transparent'
              : 'rounded-control bg-surface-2 px-3 py-2.5 transition focus:bg-surface focus:ring-1 focus:ring-accent',
          )}
        />

        {desktop ? (
          /* DESKTOP — exatamente o que foi aprovado no UX1.2. */
          <>
            <div className="mt-3 flex items-center gap-3 border-t border-hairline pt-3.5">
              <Botao variante="primario" onClick={guardar} disabled={!temTexto} className={cx(!temTexto && 'opacity-40')}>
                Guardar
              </Botao>
              {pensando && <span className="text-[12.5px] text-faint">lendo…</span>}
            </div>

            {!temTexto && (
              <div className="mt-4 border-t border-hairline pt-4">
                <p className="px-secao mb-2">Ou crie direto</p>
                <div className="grid grid-cols-2 gap-2">
                  {ATALHOS.map((a) => (
                    <button
                      key={a.chave}
                      type="button"
                      onClick={() => irPara(a.chave)}
                      className="press flex items-center gap-2 rounded-control border border-hairline px-3 py-2 text-[13px] font-medium text-secondary transition hover:border-accent hover:text-accent-text"
                    >
                      <a.icone size={15} /> {a.rotuloLongo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* GUARDAR aparece junto do que ele guarda, e só quando há conteúdo. */}
            {temTexto && (
              <div className="px-entra mt-2.5 flex items-center gap-3">
                <Botao variante="primario" onClick={guardar}>Guardar</Botao>
                {pensando && <span className="text-[12.5px] text-faint">lendo…</span>}
              </div>
            )}

            {/* Quatro atalhos numa linha. Cada um FECHA esta folha e abre a
                superfície apropriada — nunca uma sheet sobre a outra. */}
            <div className="mt-3 grid grid-cols-4 gap-1.5 border-t border-hairline pt-3">
              {ATALHOS.map((a) => (
                <button
                  key={a.chave}
                  type="button"
                  onClick={() => irPara(a.chave)}
                  className="press flex flex-col items-center gap-1.5 rounded-control py-2.5 text-[12px] font-medium text-secondary transition hover:bg-surface-2 hover:text-accent-text"
                >
                  <a.icone size={19} />
                  {a.rotulo}
                </button>
              ))}
            </div>
          </>
        )}

        {/* A sugestao vem depois, secundaria, e sempre pode ser ignorada. */}
        {sugestao && !pensando && (
          <div className="px-entra mt-3 rounded-row border border-hairline bg-surface-2 px-3.5 py-3">
            <p className="text-[13px] text-secondary">{sugestao.frase}</p>

            {sugestao.especie === 'compromisso' && (
              <p className="mt-1.5 text-[14.5px] font-semibold leading-snug">
                {sugestao.dados.titulo}
                <span className="px-hora ml-2 text-[13px] font-normal text-secondary">
                  {rotuloDeData(sugestao.dados.data, estado.hoje)} · {hora}
                </span>
              </p>
            )}

            {ajustando && sugestao.especie === 'compromisso' && (
              <div className="mt-2.5 flex items-center gap-2">
                <label className="text-[12.5px] text-muted" htmlFor="px-hora-ajuste">Horário</label>
                <input
                  id="px-hora-ajuste"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="px-campo w-[92px] py-1"
                />
              </div>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={confirmarSugestao}
                className="press inline-flex items-center gap-1.5 rounded-control border border-hairline bg-surface px-3 py-1.5 text-[13px] font-semibold text-accent-text transition hover:border-accent"
              >
                {sugestao.acao} <ArrowRight size={13} />
              </button>
              {sugestao.especie === 'compromisso' && !ajustando && (
                <button
                  type="button"
                  onClick={() => setAjustando(true)}
                  className={cx('press rounded-control px-2.5 py-1.5 text-[13px] text-muted')}
                >
                  Ajustar
                </button>
              )}
            </div>
          </div>
        )}

        {desktop && (
          <p className="mt-4 text-[12px] leading-relaxed text-faint">
            Fechar não cria nada. O que você escreveu continua aqui.
          </p>
        )}
      </div>
    </div>
  )
}

function maisUmaHora(hhmm) {
  const [h, m] = String(hhmm || '09:00').split(':').map(Number)
  return `${String(((h || 0) + 1) % 24).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
}
