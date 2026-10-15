import { useEffect, useState } from 'react'
import { StickyNote, ListChecks, Link2, Lightbulb, Paperclip } from 'lucide-react'
import { cx } from '../../lib/utils'
import { FORMATO, SIGNIFICADO, imagemDoItem, legendaDoItem, quandoGuardado } from '../../lib/memoria'
import { captureService } from '../../services/captureService'

// ---------------------------------------------------------------------------
// UMA LINHA DA MEMORIA.
//
// Tres informacoes, nessa ordem de peso: o que e (titulo), do que se trata
// (previa de uma linha) e a legenda curta (quando + UM estado relevante).
//
// O ICONE diz o FORMATO — e por isso a palavra "Nota" nunca aparece escrita ao
// lado dele. O erro que o briefing nomeia ("nao repetir Nota/Link/Ideia em
// tres lugares da mesma linha") e facil de cometer: cada eixo do modelo pede o
// seu chip, e em quatro chips ninguem le nenhum. Aqui o formato e desenho, o
// estado e texto, e o significado so aparece quando nao ha nada mais urgente a
// dizer (ver `legendaDoItem`).
//
// DUAS COMPOSICOES (UX-M1). No desktop a linha continua sendo linha: quatro
// delas tem de caber ao lado de uma coluna de leitura. No telefone ela vira
// CARTAO — a mesma peca do quadro de tarefas —, porque ali a lista e a tela
// inteira e o que a pessoa guardou e uma coisa, nao um registro de tabela.
// ---------------------------------------------------------------------------

function iconeDoItem(item) {
  if (item.formato === FORMATO.LINK) return Link2
  if (item.significado === SIGNIFICADO.IDEIA) return Lightbulb
  if (item.formato === FORMATO.CHECKLIST) return ListChecks
  return StickyNote
}

// ---------------------------------------------------------------------------
// A MINIATURA.
//
// A URL de visualizacao e pedida AQUI e so quando ha imagem de verdade: no
// Supabase ela e uma URL assinada, isto e, uma ida a rede por imagem. Pedir
// todas ao montar a lista custaria dezenas de chamadas para fotos que ninguem
// olhou.
//
// Enquanto a URL nao chega — e para sempre, se ela nao vier — o espaco fica
// com a superficie neutra. Nunca um quadrado quebrado, nunca um esqueleto
// eterno: um anexo que nao abre nao pode virar o assunto da linha.
// ---------------------------------------------------------------------------
function Miniatura({ anexo }) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let vivo = true
    captureService.urlDeAnexo(anexo).then((u) => { if (vivo) setUrl(u) })
    return () => { vivo = false }
  }, [anexo])

  return (
    <span className="am-miniatura" data-testid="memoria-miniatura">
      {url ? <img src={url} alt="" loading="lazy" /> : null}
    </span>
  )
}

export default function LinhaMemoria({ item, selecionado, telefone, onAbrir }) {
  const Icone = iconeDoItem(item)
  const legenda = legendaDoItem(item, { quando: quandoGuardado(item.atualizadoEm) })
  const imagem = imagemDoItem(item)
  const outrosAnexos = (item.anexos || []).length - (imagem ? 1 : 0)

  return (
    <button
      type="button"
      data-testid="memoria-item"
      data-item-id={item.id}
      data-selecionado={selecionado ? 'sim' : 'nao'}
      aria-current={selecionado ? 'true' : undefined}
      onClick={() => onAbrir(item)}
      className={cx(
        telefone
          ? cx('am-item', selecionado && 'am-item-aberto')
          : cx(
            'flex w-full items-start gap-3 px-3.5 py-3 text-left',
            // O item aberto e marcado por SUPERFICIE, como o destino ativo da
            // barra lateral — nao por borda colorida. Mesma gramatica em todo o
            // produto, entao "selecionado" nao precisa ser aprendido duas vezes.
            selecionado ? 'bg-surface-2' : 'tapavel bg-surface',
          ),
      )}
    >
      <Icone
        size={16}
        className={cx('mt-0.5 shrink-0', selecionado ? 'text-accent' : 'text-muted')}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span
          className={cx(
            'block truncate text-primary',
            telefone ? 'am-item-titulo' : 'text-[15px] font-semibold',
          )}
        >
          {item.titulo}
        </span>
        {item.previa && (
          <span
            className={cx(
              'mt-0.5 block truncate',
              telefone ? 'am-item-previa' : 'text-[13px] text-secondary',
            )}
          >
            {item.previa}
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5">
          {legenda && <span className="text-caption min-w-0 truncate">{legenda}</span>}
          {/* O clipe so aparece quando ha anexo que a miniatura NAO ja mostra —
              um PDF, um audio, uma segunda foto. Repetir o aviso ao lado da
              propria imagem seria dizer duas vezes a mesma coisa. */}
          {outrosAnexos > 0 && (
            <span className="text-caption inline-flex shrink-0 items-center gap-0.5">
              <Paperclip size={12} aria-hidden />
              {outrosAnexos}
            </span>
          )}
        </span>
      </span>
      {imagem && <Miniatura anexo={imagem} />}
    </button>
  )
}
