import { useNavigate } from 'react-router-dom'
import {
  X, Pencil, Lightbulb, StickyNote, Inbox, ListChecks, Archive, ArchiveRestore,
  Trash2, ExternalLink, ArrowRight, Loader2,
} from 'lucide-react'
import { cx } from '../../lib/utils'
import {
  FORMATO, SIGNIFICADO, ORGANIZACAO, acoesDoItem, dominio, quandoGuardado,
} from '../../lib/memoria'
import { SUPERFICIE } from '../../lib/copilotoContexto'
import AcaoCopiloto from '../copiloto/AcaoCopiloto'

// ---------------------------------------------------------------------------
// DETALHE DE UM ITEM DA MEMORIA.
//
// A mesma peca serve os dois tamanhos: no desktop ela e a coluna da direita,
// no telefone ela e a folha que cobre a tela. Nao ha duas implementacoes — a
// diferenca e so a moldura que a envolve (ver Memoria.jsx), porque a decisao
// de "o que esta aberto" mora na pagina, nao aqui.
//
// POR QUE NAO MANDAR PARA A TELA ANTIGA. Abrir um item e pular para /ideias/:id
// ou /links seria confessar que Memoria continua sendo um menu. O conteudo se
// le AQUI. So EDITAR sai daqui, e sai para o editor em tela cheia que a pessoa
// ja gosta — que e uma superficie de escrita, nao um modulo antigo.
//
// AS ACOES SAO HUMANAS E CONDICIONAIS. Quem decide quais aparecem e
// `acoesDoItem` (lib/memoria), a partir do que o item REALMENTE e. Por isso um
// link nunca mostra "Tratar como ideia": nao ha onde guardar essa decisao na
// tabela `links`, e um botao que nao pode cumprir o que diz e pior que a
// ausencia dele.
// ---------------------------------------------------------------------------

function Acao({ icon: Icon, children, onClick, tom = 'normal', ocupado }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className={cx(
        'press inline-flex items-center gap-1.5 rounded-control px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-45',
        tom === 'perigo'
          ? 'text-danger active:bg-danger/10 hover:bg-danger/10'
          : 'bg-surface-2 text-primary active:bg-surface-3 hover:bg-surface-3',
      )}
    >
      {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {children}
    </button>
  )
}

function Relacoes({ tarefas }) {
  const navigate = useNavigate()
  if (!tarefas.length) return null
  return (
    <div className="mt-5" data-testid="memoria-relacoes">
      <p className="text-section px-1 pb-1.5">Levou a</p>
      <ul className="list">
        {tarefas.map((t) => (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => navigate('/tarefas', { state: { destacar: t.id } })}
              className="flex w-full items-center gap-2.5 bg-surface px-3 py-2.5 text-left active:bg-surface-2 hover:bg-surface-2"
            >
              <ListChecks size={15} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-primary">
                {t.title}
              </span>
              <ArrowRight size={14} className="shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function DetalheMemoria({
  item, tarefas = [], ocupado, filtro, onFechar, onEditar, onDecidir,
  onCriarTarefa, onArquivar, onRestaurar, onExcluir,
}) {
  if (!item) return null
  const acoes = acoesDoItem(item)
  const pode = (a) => acoes.includes(a)

  // Uma linha de contexto, nao uma tabela de metadados. Data sempre; estado so
  // quando ele significa alguma coisa agora.
  const contexto = [
    quandoGuardado(item.criadoEm),
    item.arquivado
      ? 'Arquivado'
      : item.organizacao === ORGANIZACAO.POR_ORGANIZAR
        ? 'Por organizar'
        : item.significado === SIGNIFICADO.IDEIA
          ? 'Ideia'
          : item.formato === FORMATO.LINK
            ? 'Referência'
            : null,
    item.capturadoPor === 'photo' ? 'Capturado por foto' : null,
  ].filter(Boolean)

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="memoria-detalhe" data-item-id={item.id}>
      <div className="flex items-start gap-2 px-1 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-page break-words">{item.titulo}</h2>
          <p className="text-caption mt-1">{contexto.join(' · ')}</p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="icon-btn -mt-1 shrink-0"
          aria-label="Fechar detalhe"
          data-testid="memoria-fechar-detalhe"
        >
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="press mb-4 flex items-center gap-2 rounded-row bg-surface-2 px-3 py-2.5 text-[14px] font-medium text-accent"
          >
            <ExternalLink size={15} className="shrink-0" />
            <span className="min-w-0 truncate">{dominio(item.url)}</span>
          </a>
        )}

        {item.conteudo ? (
          // `whitespace-pre-wrap`: a nota foi escrita com as quebras que a
          // pessoa escolheu. Reflui-las aqui transformaria uma lista em paragrafo.
          <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-secondary">
            {item.conteudo}
          </p>
        ) : (
          <p className="text-caption italic">Sem conteúdo escrito.</p>
        )}

        <Relacoes tarefas={tarefas} />
      </div>

      {/* ----------------------------------------------------------------
          AS ACOES. Agrupadas pelo que significam, nao por ordem historica:
          primeiro o que se faz COM o conteudo, depois o que se decide SOBRE
          ele, e so no fim o que o tira da frente. Excluir fica separado por
          um respiro — nunca encostado em "Arquivar", que e o vizinho perigoso.
          ---------------------------------------------------------------- */}
      <div className="border-t hair px-1 pt-3">
        {pode('marcar_ideia') && (
          <p className="text-caption pb-2">
            Guardado e ainda sem destino. Decida quando quiser — ou nunca.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {pode('editar') && (
            <Acao icon={Pencil} onClick={onEditar} ocupado={ocupado}>Editar</Acao>
          )}
          {pode('marcar_ideia') && (
            <Acao icon={Lightbulb} onClick={() => onDecidir('ideia')} ocupado={ocupado}>
              Tratar como ideia
            </Acao>
          )}
          {pode('manter_nota') && (
            <Acao icon={StickyNote} onClick={() => onDecidir('nota')} ocupado={ocupado}>
              Manter como nota
            </Acao>
          )}
          {pode('devolver_por_organizar') && (
            <Acao icon={Inbox} onClick={() => onDecidir('por_organizar')} ocupado={ocupado}>
              Voltar para Por organizar
            </Acao>
          )}
          {pode('criar_tarefa') && (
            <Acao icon={ListChecks} onClick={onCriarTarefa} ocupado={ocupado}>
              Criar tarefa
            </Acao>
          )}
          {pode('arquivar') && (
            <Acao icon={Archive} onClick={onArquivar} ocupado={ocupado}>Arquivar</Acao>
          )}
          {pode('restaurar') && (
            <Acao icon={ArchiveRestore} onClick={onRestaurar} ocupado={ocupado}>Restaurar</Acao>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <AcaoCopiloto
            superficie={SUPERFICIE.MEMORIA}
            extra={{ item, filtro }}
            rotulo="Me ajude com isto"
            className="!px-2"
          />
          <Acao icon={Trash2} tom="perigo" onClick={onExcluir} ocupado={ocupado}>Excluir</Acao>
        </div>
      </div>
    </div>
  )
}
