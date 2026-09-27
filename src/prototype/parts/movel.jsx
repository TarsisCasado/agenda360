import { useEffect, useState } from 'react'
import { X, ChevronDown, ChevronRight, Check, MoreHorizontal } from 'lucide-react'
import { cx } from '../../lib/utils'
import { useDesktop } from '../store/contexto'
import { Folha, Botao } from './base'

// ---------------------------------------------------------------------------
// AS PECAS DO TELEFONE (UX1.2.1).
//
// O QA humano leu o mobile como "um amontoado". A causa nao era falta de
// funcao: era SIMULTANEIDADE. O desktop pode mostrar possibilidades lado a
// lado porque tem largura; o telefone tem de REVELAR uma de cada vez.
//
// Estas pecas existem para que revelar progressivamente seja o caminho facil:
//
//   Superficie   um formulario longo vira TELA, nao uma folha espremida;
//   Seletor      um eixo de escolha vira UM controle, nao uma fileira de chips;
//   Segmentos    o estado do quadro cabe numa linha so;
//   Sanfona      "3 decisoes precisam de voce ›" no lugar de tres cartoes;
//   MenuAcoes    o que e secundario sai da tela e fica a um toque.
//
// Nenhuma delas esconde capacidade. Todas adiam a exibicao ate o momento em
// que a escolha importa.
// ---------------------------------------------------------------------------

// SUPERFICIE — a mesma chamada nas duas larguras, dois corpos diferentes.
//
// No desktop continua sendo a folha central que ja estava aprovada. No
// telefone vira tela cheia com cabecalho de app: Cancelar · titulo · acao
// principal. Um formulario de dez campos dentro de uma bottom sheet e um
// formulario de desktop espremido — e foi exatamente isso que o QA viu.
export function Superficie({
  aberta, aoFechar, titulo, subtitulo, acao, rodape, children,
  largura = 'max-w-[560px]',
  // "Cancelar" numa tela que só mostra coisas sugere que algo seria desfeito.
  rotuloFechar = 'Cancelar',
}) {
  const desktop = useDesktop()

  useEffect(() => {
    if (!aberta || desktop) return undefined
    // Tela cheia trava o fundo: rolar a lista por baixo do formulario e um
    // jeito barato de perder o lugar em que se estava.
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [aberta, desktop])

  useEffect(() => {
    if (!aberta) return undefined
    const tecla = (e) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberta, aoFechar])

  if (!aberta) return null

  if (desktop) {
    return (
      <Folha aberta aoFechar={aoFechar} titulo={titulo} subtitulo={subtitulo} largura={largura} rodape={rodape}>
        {children}
      </Folha>
    )
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo} className="animate-sheet fixed inset-0 z-[60] flex flex-col bg-canvas">
      <header className="pt-safe flex flex-none items-center gap-3 border-b border-hairline bg-surface px-3 py-2.5">
        <button type="button" onClick={aoFechar} className="press -ml-1 rounded-[9px] px-2 py-1.5 text-[14px] text-secondary">
          {rotuloFechar}
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">{titulo}</span>
        <span className="flex-none">{acao}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-10">{children}</div>
    </div>
  )
}

// SELETOR — um eixo inteiro de escolha em um controle só.
//
// "Todas · Minhas · Delegadas por mim · Recebidas" ocupa uma linha inteira no
// telefone e some no scroll horizontal. Como só UMA está ativa por vez, o
// controle certo é um: mostra a escolha atual e abre o resto sob demanda.
export function Seletor({ valor, opcoes, aoEscolher, rotulo = 'Escopo', className }) {
  const [aberta, setAberta] = useState(false)
  const atual = opcoes.find((o) => o.chave === valor) || opcoes[0]
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`${rotulo}: ${atual?.label}`}
        className={cx(
          'press inline-flex items-center gap-1 rounded-control border border-hairline bg-surface px-3 py-1.5 text-[13.5px] font-medium',
          className,
        )}
      >
        {atual?.label}
        {atual?.contagem != null && <span className="text-muted">{atual.contagem}</span>}
        <ChevronDown size={14} className="text-muted" />
      </button>

      <Folha aberta={aberta} aoFechar={() => setAberta(false)} titulo={rotulo} largura="max-w-[420px]">
        <div className="space-y-1">
          {opcoes.map((o) => (
            <button
              key={o.chave}
              type="button"
              onClick={() => { aoEscolher(o.chave); setAberta(false) }}
              className={cx(
                'press flex w-full items-center gap-3 rounded-row border px-4 py-3 text-left text-[14.5px] transition',
                o.chave === valor ? 'border-accent bg-accent-soft text-accent-text' : 'border-hairline',
              )}
            >
              <span className="flex-1">{o.label}</span>
              {o.contagem != null && <span className="px-motivo">{o.contagem}</span>}
              {o.chave === valor && <Check size={16} />}
            </button>
          ))}
        </div>
      </Folha>
    </>
  )
}

// FILTROS — o que pode estar ligado ao mesmo tempo continua sendo múltipla
// escolha, mas fora do caminho até alguém precisar. O contador no botão é o
// que impede o filtro invisível.
export function BotaoDeFiltros({ opcoes, ativos, aoAlternar, aoLimpar, className }) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className={cx(
          'press inline-flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-[13.5px] font-medium transition',
          ativos.length ? 'border-accent bg-accent-soft text-accent-text' : 'border-hairline',
          className,
        )}
      >
        Filtros
        {ativos.length > 0 && <span className="opacity-80">· {ativos.length}</span>}
      </button>

      <Folha
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        titulo="Filtros"
        largura="max-w-[420px]"
        rodape={
          <>
            <Botao variante="primario" onClick={() => setAberta(false)}>Ver resultados</Botao>
            <Botao variante="fantasma" disabled={!ativos.length} onClick={aoLimpar}>Limpar</Botao>
          </>
        }
      >
        <div className="space-y-1">
          {opcoes.map((f) => {
            const on = ativos.includes(f.chave)
            return (
              <button
                key={f.chave}
                type="button"
                onClick={() => aoAlternar(f.chave)}
                aria-pressed={on}
                className={cx(
                  'press flex w-full items-center gap-3 rounded-row border px-4 py-3 text-left text-[14.5px] transition',
                  on ? 'border-accent bg-accent-soft text-accent-text' : 'border-hairline',
                )}
              >
                <span className="flex-1">{f.label}</span>
                {on && <Check size={16} />}
              </button>
            )
          })}
        </div>
      </Folha>
    </>
  )
}

// SEGMENTOS — um eixo curto (três estados) cabe numa linha e se lê inteiro.
export function Segmentos({ valor, opcoes, aoEscolher, className }) {
  return (
    <div className={cx('flex gap-0.5 rounded-control border border-hairline bg-surface p-0.5', className)}>
      {opcoes.map((o) => (
        <button
          key={o.chave}
          type="button"
          onClick={() => aoEscolher(o.chave)}
          aria-pressed={valor === o.chave}
          className={cx(
            'press min-w-0 flex-1 truncate rounded-[7px] px-2 py-2 text-[12.5px] transition',
            valor === o.chave ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted',
          )}
        >
          {o.label}
          {o.contagem != null && <span className="ml-1 text-[11px] opacity-70">{o.contagem}</span>}
        </button>
      ))}
    </div>
  )
}

// SANFONA — "3 decisões precisam de você ›". Uma linha no lugar de uma seção.
// O conteúdo continua inteiro; o que muda é quando ele ocupa a tela.
export function Sanfona({ titulo, detalhe, contagem, aberta: abertaInicial = false, children, tom }) {
  const [aberta, setAberta] = useState(abertaInicial)
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setAberta((a) => !a)}
        aria-expanded={aberta}
        className={cx(
          'press flex w-full items-center gap-2 rounded-row border px-3.5 py-2.5 text-left transition',
          tom === 'atencao' ? 'border-warning/40 bg-warning/[0.07]' : 'border-hairline',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium leading-snug">
            {contagem != null && <span className="px-hora">{contagem} </span>}{titulo}
          </span>
          {detalhe && <span className="px-motivo mt-0.5 block truncate">{detalhe}</span>}
        </span>
        <ChevronRight size={16} className={cx('flex-none text-muted transition', aberta && 'rotate-90')} />
      </button>
      {aberta && <div className="px-entra mt-1">{children}</div>}
    </div>
  )
}

// MENU DE AÇÕES — o "..." do telefone. Tira da tela o que é secundário sem
// tirar do produto.
export function MenuAcoes({ titulo, subtitulo, acoes, rotulo = 'Mais ações', gatilho }) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={rotulo}
        className="press grid h-8 w-8 flex-none place-items-center rounded-[8px] text-muted transition hover:bg-surface-2 hover:text-primary"
      >
        {gatilho || <MoreHorizontal size={17} />}
      </button>

      <Folha aberta={aberta} aoFechar={() => setAberta(false)} titulo={titulo} subtitulo={subtitulo} largura="max-w-[420px]">
        <div className="space-y-1">
          {acoes.filter(Boolean).map((a) => (
            <button
              key={a.rotulo}
              type="button"
              disabled={a.desabilitada}
              onClick={() => { setAberta(false); a.fazer() }}
              className={cx(
                'press flex w-full items-center gap-3 rounded-row border border-hairline px-4 py-3 text-left text-[14.5px] transition',
                a.perigo ? 'text-danger hover:border-danger/50' : 'hover:border-accent',
                a.desabilitada && 'opacity-40',
              )}
            >
              {a.icone && <a.icone size={16} className="flex-none" />}
              <span className="flex-1">{a.rotulo}</span>
            </button>
          ))}
        </div>
      </Folha>
    </>
  )
}

// Cabeçalho de tela no telefone: título, contagem discreta e UMA ação
// primária. Nada mais disputa a primeira linha.
export function TituloDeTela({ titulo, detalhe, acao, className }) {
  return (
    <header className={cx('flex items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="px-titulo-tela truncate">{titulo}</h1>
        {detalhe && <span className="flex-none text-[12.5px] text-muted">{detalhe}</span>}
      </div>
      {acao}
    </header>
  )
}

export { X }
