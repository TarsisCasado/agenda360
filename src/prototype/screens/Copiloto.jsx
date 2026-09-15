import { useState, useRef, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Sparkles, Send, BookmarkPlus, ExternalLink } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { inicioDaSemana, somarDias, iso, nomeDoDia } from '../mock/dados'
import { responder, revisar, espera, ATALHOS } from '../mock/ia'
import { Botao } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// COPILOTO — DOIS MODOS DA MESMA ASSISTENCIA.
//
//   A. CONTEXTUAL   mora dentro de Hoje, Agenda, Tarefa, Nota. Uma sugestao
//                   curta, junto do que ela propoe. (Essas vivem nas telas.)
//   B. AMPLIADO     esta tela: quando a pergunta nao cabe num botao.
//
// O UX1.1.1 abria isto VAZIO, com um botao no meio — parecia uma tela quebrada.
// Agora ele abre como uma conversa comeca: cumprimento, campo pronto, e quatro
// sugestoes pequenas para quem nao sabe o que pedir.
//
// TRES REGRAS QUE ESTA TELA EXISTE PARA DEMONSTRAR:
//
//   1. PERGUNTAR NAO PEDE CONFIRMACAO; ESCREVER PEDE, SEMPRE. Consultar o que
//      esta atrasado responde direto. Reservar um horario vira proposta.
//   2. REVISAR ALTERA A MESMA PROPOSTA. "Nao e bem isso" nao pode jogar fora o
//      trabalho e recomecar do zero.
//   3. A CONVERSA NAO VIRA MEMORIA SOZINHA. Guardar e uma acao explicita, com
//      botao proprio — historico de conversa nao e conhecimento guardado.
//
// E a conversa vive no ESTADO, nao no componente: sair para conferir uma tarefa
// e voltar encontra a conversa onde estava. Reiniciar em silencio seria a pior
// forma de perder contexto.
// ---------------------------------------------------------------------------
export default function Copiloto() {
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const { estado } = useProto()
  const acoes = useAcoes()

  const contextoTipo = params.get('contexto')
  const contextoId = params.get('id')
  const contexto = contextoTipo ? { tipo: contextoTipo, id: contextoId } : null

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const terca = iso(somarDias(seg, 1))
  const quinta = iso(somarDias(seg, 3))

  const { turnos, proposta } = estado.copiloto
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [escolhidas, setEscolhidas] = useState([])
  const [revisando, setRevisando] = useState(false)
  const [pedidoDeRevisao, setPedidoDeRevisao] = useState('')
  const fim = useRef(null)

  const tarefaEmFoco = contextoId ? estado.tarefas.find((t) => t.id === contextoId) : null

  // Entrar por um contexto ANUNCIA o contexto, em vez de abrir uma recepção
  // genérica: quem pediu ajuda olhando uma tarefa está falando daquela tarefa.
  useEffect(() => {
    if (contexto && estado.copiloto.contexto !== contextoId) {
      acoes.copilotoContexto(contextoId || contextoTipo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextoTipo, contextoId])

  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }) }, [turnos.length, proposta, pensando])

  const enviar = async (pergunta) => {
    const texto0 = String(pergunta || '').trim()
    if (!texto0) return
    setTexto('')
    acoes.copilotoTurno({ de: 'pessoa', texto: texto0 })
    setPensando(true)
    await espera(720)
    const r = responder(texto0, { ...estado, terca, quinta }, contexto)
    if (r.especie === 'proposta') {
      acoes.copilotoProposta(r)
      setEscolhidas(r.mudancas.map((m) => m.rotulo))
    } else {
      acoes.copilotoTurno({ de: 'ia', texto: r.texto, fontes: r.fontes, referencias: r.referencias })
    }
    setPensando(false)
  }

  const alternar = (rotulo) =>
    setEscolhidas((s) => (s.includes(rotulo) ? s.filter((x) => x !== rotulo) : [...s, rotulo]))

  const confirmar = () => {
    const mudancas = proposta.mudancas.filter((m) => escolhidas.includes(m.rotulo)).map((m) => m.acao)
    acoes.aplicarPlano(mudancas)
    acoes.copilotoProposta(null)
    acoes.copilotoTurno({
      de: 'ia',
      texto: `Feito. Apliquei ${mudancas.length} ${mudancas.length === 1 ? 'mudança' : 'mudanças'}.`,
    })
  }

  const desistir = () => {
    acoes.copilotoProposta(null)
    acoes.copilotoTurno({ de: 'ia', texto: 'Sem problema — não mudei nada.' })
  }

  const aplicarRevisao = () => {
    const nova = revisar(proposta, pedidoDeRevisao)
    acoes.copilotoProposta(nova)
    setEscolhidas(nova.mudancas.map((m) => m.rotulo))
    setRevisando(false)
    setPedidoDeRevisao('')
  }

  const voltar = () => navegar(contextoTipo === 'semana' ? '/prototipo/agenda' : -1)
  const vazio = turnos.length === 0 && !proposta && !pensando

  return (
    // Com conversa, a tela cresce e o campo fica no rodapé. SEM conversa, ela
    // não se estica: um vão de 400px entre "Olá" e o campo é a mesma tela vazia
    // do UX1.1.1 com outro texto.
    <div className={cx('px-entra flex flex-col', turnos.length > 0 && 'min-h-[calc(100dvh-190px)]')}>
      {contexto && (
        <button onClick={voltar} className="press -ml-1 mb-4 flex items-center gap-1.5 text-[13.5px] text-muted">
          <ArrowLeft size={16} /> {contextoTipo === 'semana' ? 'Voltar para a agenda' : 'Voltar'}
        </button>
      )}

      <header>
        <p className="px-secao">Copiloto</p>
        {contexto ? (
          <>
            <h1 className="px-titulo-tela mt-1">
              Sobre: {tarefaEmFoco ? tarefaEmFoco.titulo : 'esta semana'}
            </h1>
            <p className="mt-1.5 text-[13.5px] text-muted">
              {tarefaEmFoco
                ? 'A conversa começa nesta tarefa — o que for proposto vale para ela.'
                : `Vendo ${nomeDoDia(iso(seg))} a domingo · ${estado.compromissos.length} compromissos · ${estado.tarefas.filter((t) => t.estado !== 'feito').length} tarefas abertas`}
            </p>
          </>
        ) : (
          <>
            <h1 className="px-titulo-tela mt-1">Olá, {estado.pessoa} 👋</h1>
            <p className="mt-1.5 text-[14.5px] text-secondary">Como posso te ajudar hoje?</p>
          </>
        )}
      </header>

      {/* HISTÓRICO VISUAL — e ele sobrevive a sair e voltar nesta sessão. */}
      <div className={cx('mt-5 space-y-3', turnos.length > 0 && 'flex-1')}>
        {turnos.map((t, i) => (
          <div key={i} className={cx('px-balao', t.de === 'pessoa' ? 'px-balao-pessoa' : 'px-balao-ia')}>
            <p>{t.texto}</p>

            {/* As FONTES da Memória podem ser abertas: conferir de onde veio é
                parte de confiar na resposta. */}
            {t.fontes?.length > 0 && (
              <div className="mt-2.5 space-y-1 border-t border-hairline pt-2.5">
                {t.fontes.map((f) => (
                  <Link
                    key={f.id}
                    to={`/prototipo/memoria/${f.id}`}
                    className="flex items-start gap-1.5 text-[12.5px] text-accent-text hover:underline"
                  >
                    <ExternalLink size={12} className="mt-0.5 flex-none" />
                    <span>
                      {f.titulo}
                      {f.resumo && <span className="block text-secondary">{f.resumo}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}

            {t.referencias?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.referencias.map((r) => (
                  <Link key={r.id} to={`/prototipo/tarefas/${r.id}`} className="px-chip text-[11.5px]">
                    {r.titulo}
                  </Link>
                ))}
              </div>
            )}

            {/* GUARDAR é ação explícita. Conversa não vira Memória sozinha. */}
            {t.de === 'ia' && t.texto.length > 60 && (
              <button
                type="button"
                onClick={() => acoes.guardarReferencia(t.texto, 'Resposta do Copiloto')}
                className="press mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-accent-text hover:underline"
              >
                <BookmarkPlus size={13} /> Guardar na Memória
              </button>
            )}
          </div>
        ))}

        {pensando && <p className="text-[13.5px] text-faint">pensando…</p>}

        {/* PROPOSTA — o único lugar onde algo espera decisão. */}
        {proposta && (
          <div className="px-proposta px-entra p-4">
            <p className="text-[14.5px] leading-relaxed text-secondary">{proposta.resumo}</p>
            {proposta.revisada && (
              <p className="mt-1.5 text-[12.5px] text-accent-text">Revisado — {proposta.revisada}.</p>
            )}
            <div className="mt-3">
              {proposta.mudancas.map((m) => (
                <button key={m.rotulo} onClick={() => alternar(m.rotulo)} className="px-linha w-full items-start text-left">
                  <span className={cx(
                    'mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-[6px] border',
                    escolhidas.includes(m.rotulo) ? 'border-accent bg-accent text-white' : 'border-hairline',
                  )}>
                    {escolhidas.includes(m.rotulo) && (
                      <svg viewBox="0 0 12 12" className="h-3 w-3"><path d="M2.5 6.2 4.7 8.4 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    )}
                  </span>
                  <span className="flex-1 text-[14.5px]">{m.rotulo}</span>
                </button>
              ))}
            </div>

            {revisando ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={pedidoDeRevisao}
                  onChange={(e) => setPedidoDeRevisao(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') aplicarRevisao() }}
                  placeholder="Ex.: deixe para mais tarde"
                  className="px-campo flex-1"
                />
                <Botao variante="secundario" onClick={aplicarRevisao}>Revisar</Botao>
                <Botao variante="fantasma" onClick={() => setRevisando(false)}>Cancelar</Botao>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                <Botao variante="primario" onClick={confirmar} disabled={!escolhidas.length} className={cx(!escolhidas.length && 'opacity-40')}>
                  Aplicar {escolhidas.length} {escolhidas.length === 1 ? 'mudança' : 'mudanças'}
                </Botao>
                <Botao variante="secundario" onClick={() => setRevisando(true)}>Não é bem isso…</Botao>
                <Botao variante="fantasma" onClick={desistir}>Desistir</Botao>
              </div>
            )}
            <p className="mt-3 text-[12px] text-faint">Nada acontece enquanto você não aplicar.</p>
          </div>
        )}

        <div ref={fim} />
      </div>

      {/* Sugestões pequenas — e só quando a conversa ainda não começou. */}
      {vazio && (
        <div className="mt-1">
          <div className="flex flex-wrap gap-1.5">
            {ATALHOS.map((a) => (
              <button key={a} type="button" onClick={() => enviar(a)} className="px-chip press">
                <Sparkles size={12} /> {a}
              </button>
            ))}
          </div>

          {/* O contrato, dito antes de alguém precisar descobrir sozinho. */}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-row border border-hairline px-4 py-3">
              <p className="px-secao">Perguntar</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-secondary">
                Consultas respondem na hora e não mudam nada — o que está atrasado,
                o que está com quem, o que você anotou. As fontes ficam abertas
                para conferir.
              </p>
            </div>
            <div className="rounded-row border border-hairline px-4 py-3">
              <p className="px-secao">Pedir uma mudança</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-secondary">
                Qualquer alteração vira proposta, item por item, e espera você.
                Dá para revisar sem recomeçar, e desistir não escreve nada.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* O CAMPO fica disponível desde o primeiro instante. */}
      <form
        onSubmit={(e) => { e.preventDefault(); enviar(texto) }}
        className="sticky bottom-[84px] mt-4 flex items-center gap-2 rounded-control border border-hairline bg-surface px-3 py-2 focus-within:border-accent lg:bottom-4"
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={contexto ? 'Pergunte sobre isto…' : 'Escreva o que você precisa…'}
          aria-label="Mensagem para o Copiloto"
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          disabled={!texto.trim()}
          aria-label="Enviar"
          className="press grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-accent text-white transition disabled:opacity-35"
        >
          <Send size={15} />
        </button>
      </form>

      <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
        Protótipo: as respostas são fixas, não há modelo de linguagem. Perguntas
        respondem direto; qualquer alteração vira proposta e espera você.
      </p>
    </div>
  )
}
