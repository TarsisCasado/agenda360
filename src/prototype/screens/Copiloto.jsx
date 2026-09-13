import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useProto, useAcoes } from '../store/contexto'
import { inicioDaSemana, somarDias, iso, nomeDoDia } from '../mock/dados'
import { planejarSemana, espera } from '../mock/ia'
import { Botao } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// COPILOTO AMPLIADO — a conversa longa, quando a pergunta nao cabe num botao.
//
// Ele abre COM CONTEXTO declarado ("Sobre esta semana") e sabe voltar ao ponto
// de origem: quem pediu ajuda olhando a semana precisa voltar para a mesma
// semana, nao para o inicio do produto.
//
// E a regra que vale em todo lugar vale aqui em voz alta: as mudancas
// propostas aparecem uma a uma, com nome; desistir nao aplica nada; e so o que
// foi confirmado acontece.
// ---------------------------------------------------------------------------
export default function Copiloto() {
  const [params] = useSearchParams()
  const navegar = useNavigate()
  const { estado } = useProto()
  const acoes = useAcoes()
  const contexto = params.get('contexto')

  const seg = inicioDaSemana(new Date(`${estado.hoje}T12:00:00`))
  const terca = iso(somarDias(seg, 1))
  const quinta = iso(somarDias(seg, 3))

  const [turnos, setTurnos] = useState([])
  const [plano, setPlano] = useState(null)
  const [escolhidas, setEscolhidas] = useState([])
  const [pensando, setPensando] = useState(false)
  const [aplicado, setAplicado] = useState(false)

  const pedirPlano = async () => {
    setTurnos((t) => [...t, { de: 'pessoa', texto: 'Me ajude a organizar minha próxima semana.' }])
    setPensando(true)
    await espera(800)
    const p = planejarSemana({ ...estado, quinta }, terca)
    setPlano(p)
    setEscolhidas(p.mudancas.map((m) => m.rotulo))
    setPensando(false)
  }

  const alternar = (rotulo) =>
    setEscolhidas((s) => (s.includes(rotulo) ? s.filter((x) => x !== rotulo) : [...s, rotulo]))

  const confirmar = () => {
    const mudancas = plano.mudancas.filter((m) => escolhidas.includes(m.rotulo)).map((m) => m.acao)
    acoes.aplicarPlano(mudancas)
    setPlano(null)
    setAplicado(true)
    setTurnos((t) => [...t, { de: 'ia', texto: `Feito. Apliquei ${mudancas.length} ${mudancas.length === 1 ? 'mudança' : 'mudanças'}.` }])
  }

  const voltar = () => navegar(contexto === 'semana' ? '/prototipo/agenda' : -1)

  return (
    <div className="px-entra">
      <button onClick={voltar} className="press -ml-1 mb-5 flex items-center gap-1.5 text-[13.5px] text-muted">
        <ArrowLeft size={16} /> {contexto === 'semana' ? 'Voltar para a agenda' : 'Voltar'}
      </button>

      <header>
        <p className="px-secao">Copiloto</p>
        <h1 className="px-serif px-titulo mt-1.5">
          {contexto === 'semana' ? 'Sobre esta semana' : 'Conversa'}
        </h1>
        {contexto === 'semana' && (
          <p className="mt-2 text-[13.5px] text-muted">
            Vendo {nomeDoDia(iso(seg))} a domingo · {estado.compromissos.length} compromissos ·{' '}
            {estado.tarefas.filter((t) => t.estado !== 'feito').length} tarefas abertas
          </p>
        )}
      </header>

      <div className="mt-7 space-y-4">
        {turnos.map((t, i) => (
          <p
            key={i}
            className={cx(
              'max-w-[85%] rounded-row px-4 py-3 text-[15px] leading-relaxed',
              t.de === 'pessoa'
                ? 'ml-auto bg-accent-soft text-accent-text'
                : 'bg-surface-2 text-primary',
            )}
          >
            {t.texto}
          </p>
        ))}

        {pensando && <p className="text-[13.5px] text-faint">pensando…</p>}

        {plano && (
          <div className="px-proposta px-entra p-4">
            <p className="text-[14.5px] leading-relaxed text-secondary">{plano.resumo}</p>
            <div className="mt-3">
              {plano.mudancas.map((m) => (
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
            <div className="mt-4 flex flex-wrap gap-2">
              <Botao variante="primario" onClick={confirmar} disabled={!escolhidas.length} className={cx(!escolhidas.length && 'opacity-40')}>
                Aplicar {escolhidas.length} {escolhidas.length === 1 ? 'mudança' : 'mudanças'}
              </Botao>
              <Botao variante="fantasma" onClick={() => { setPlano(null); setTurnos((t) => [...t, { de: 'ia', texto: 'Sem problema — não mudei nada.' }]) }}>
                Desistir
              </Botao>
            </div>
            <p className="mt-3 text-[12px] text-faint">Nada acontece enquanto você não aplicar.</p>
          </div>
        )}

        {!plano && !pensando && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Botao variante="secundario" onClick={pedirPlano}>
              <Sparkles size={15} /> {aplicado ? 'Rever a semana' : 'Planejar esta semana'}
            </Botao>
            <Botao variante="fantasma" onClick={voltar}>Voltar à agenda</Botao>
          </div>
        )}
      </div>
    </div>
  )
}
