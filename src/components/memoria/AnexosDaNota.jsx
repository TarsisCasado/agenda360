import { useEffect, useRef, useState } from 'react'
import {
  Paperclip, FileText, Music, ExternalLink, Download, Trash2,
  Loader2, AlertCircle, Plus, X,
} from 'lucide-react'
import { cx } from '../../lib/utils'
import { captureService } from '../../services/captureService'
import { ACCEPT, tamanhoLegivel } from '../../lib/anexoPolitica'

// ---------------------------------------------------------------------------
// OS ANEXOS DE UMA NOTA — ver, abrir, baixar, acrescentar e remover.
//
// Toda a seguranca ja foi decidida antes de chegar aqui: `prepararAnexo` tira
// o metadado e recusa o que nao pode subir, `anexarAItem` valida o destino e
// compensa falhas, e o bucket tem o teto e a lista de tipos. Esta peca NAO
// reimplementa nenhuma dessas regras — ela mostra o resultado e, quando ha
// recusa, mostra a FRASE que veio de la.
//
// Repetir a validacao na tela criaria duas verdades que divergem no primeiro
// ajuste. A tela tem um trabalho: dizer o que esta acontecendo.
// ---------------------------------------------------------------------------

const ROTULO_KIND = { image: 'Imagem', pdf: 'PDF', audio: 'Áudio', file: 'Arquivo' }

const ETAPAS = {
  validando: 'Conferindo o arquivo…',
  preparando: 'Preparando a imagem…',
  enviando: 'Enviando…',
  gravando: 'Quase lá…',
}

function iconeDoAnexo(kind) {
  if (kind === 'pdf') return FileText
  if (kind === 'audio') return Music
  return Paperclip
}

// ---------------------------------------------------------------------------
// UM ANEXO.
//
// A URL assinada vale uma hora. Quem deixa o detalhe aberto mais que isso veria
// a imagem simplesmente parar de carregar — entao a validade viaja junto e a
// renovacao acontece em dois momentos: ao abrir/baixar (antes de usar) e
// quando a propria <img> falha (depois de quebrar, que e quando o navegador
// avisa).
// ---------------------------------------------------------------------------
function Anexo({ anexo, podeRemover, onRemover, removendo }) {
  const [ref, setRef] = useState(null)
  const [falhou, setFalhou] = useState(false)

  useEffect(() => {
    let vivo = true
    captureService.urlDeAnexoComValidade(anexo).then((r) => { if (vivo) setRef(r) })
    return () => { vivo = false }
  }, [anexo])

  // Renova ANTES de usar. Sem isto, abrir uma hora depois levaria a um link
  // morto — e o navegador mostraria um erro do Supabase, nao o nosso.
  const urlFresca = async ({ baixar = false } = {}) => {
    const novo = await captureService.renovarUrlSePreciso(anexo, baixar ? null : ref, { baixar })
    if (!baixar) setRef(novo)
    return novo?.url || null
  }

  const abrirEm = async (baixar) => {
    const url = await urlFresca({ baixar })
    if (!url) { setFalhou(true); return }
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    if (baixar) a.download = ''
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const Icone = iconeDoAnexo(anexo.kind)
  const rotulo = ROTULO_KIND[anexo.kind] || ROTULO_KIND.file
  const url = ref?.url || null
  const ehImagem = anexo.kind === 'image' && url && !falhou

  return (
    <div
      className="overflow-hidden rounded-row bg-surface-2"
      data-testid="memoria-anexo"
      data-anexo-kind={anexo.kind}
      data-anexo-id={anexo.id}
    >
      {ehImagem ? (
        <button
          type="button"
          onClick={() => abrirEm(false)}
          className="press block w-full"
          aria-label={`Abrir ${rotulo}`}
          data-testid="memoria-anexo-abrir"
        >
          <img
            src={url}
            alt=""
            loading="lazy"
            className="block max-h-64 w-full object-cover"
            // A URL venceu enquanto a folha estava aberta: renova uma vez em
            // vez de deixar o quadrado quebrado na tela.
            onError={async () => {
              const novo = await captureService.urlDeAnexoComValidade(anexo)
              if (novo?.url && novo.url !== url) setRef(novo)
              else setFalhou(true)
            }}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => abrirEm(false)}
          className="press flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
          data-testid="memoria-anexo-abrir"
        >
          <Icone size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[14px] text-secondary">
            {rotulo}
            {anexo.bytes ? ` · ${tamanhoLegivel(anexo.bytes)}` : ''}
          </span>
          <ExternalLink size={14} className="shrink-0 text-muted" aria-hidden />
        </button>
      )}

      {/* A fileira de acoes fica SEMPRE visivel, e nao atras de um menu: sao
          tres acoes, e esconder tres acoes atras de um toque extra so economiza
          pixel de quem ja sabe onde elas estao. */}
      <div className="flex items-center gap-1 border-t hair px-2 py-1.5">
        <button
          type="button"
          onClick={() => abrirEm(true)}
          className="press inline-flex min-h-[36px] items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-secondary active:bg-surface-3"
          data-testid="memoria-anexo-baixar"
        >
          <Download size={14} />
          Baixar
        </button>
        <span className="flex-1" />
        {podeRemover && (
          <button
            type="button"
            onClick={() => onRemover(anexo)}
            disabled={removendo}
            className="press inline-flex min-h-[36px] items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-danger active:bg-danger/10 disabled:opacity-45"
            data-testid="memoria-anexo-remover"
          >
            {removendo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Remover
          </button>
        )}
      </div>
    </div>
  )
}

export default function AnexosDaNota({ item, podeAnexar, onAnexar, onRemoverAnexo }) {
  const anexos = item?.anexos || []
  const entradaRef = useRef(null)
  const cancelado = useRef(false)
  const [etapa, setEtapa] = useState(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [removendo, setRemovendo] = useState(null)

  // Trocar de item no meio de um envio deixaria o estado do anterior na tela.
  useEffect(() => {
    cancelado.current = false
    setEtapa(null); setErro(''); setAviso(''); setRemovendo(null)
  }, [item?.id])

  const escolher = () => {
    setErro(''); setAviso('')
    entradaRef.current?.click()
  }

  const aoEscolher = async (e) => {
    const file = e.target.files?.[0]
    // O seletor nativo foi cancelado: nao ha arquivo, e nao ha o que fazer.
    e.target.value = ''
    if (!file) return

    cancelado.current = false
    setErro(''); setAviso(''); setEtapa('validando')
    try {
      const r = await onAnexar(file, (nome) => {
        // CANCELAR so vale ate o envio comecar. Depois disso o binario ja
        // viajou, e abortar pela metade e o que CRIA orfao em vez de evitar.
        if (!cancelado.current) setEtapa(nome)
      }, () => cancelado.current)
      if (r?.cancelado) { setEtapa(null); return }
      setAviso(r?.aviso || '')
      setEtapa(null)
    } catch (err) {
      setEtapa(null)
      setErro(err?.message || 'Não consegui anexar este arquivo.')
    }
  }

  const cancelar = () => {
    cancelado.current = true
    setEtapa(null)
  }

  const remover = async (anexo) => {
    // Confirmacao EXPLICITA, com a frase dizendo o que NAO acontece — porque o
    // medo real de quem clica e perder a nota junto.
    if (!window.confirm('Remover este anexo? A nota continua aqui, com tudo o que você escreveu.')) return
    setRemovendo(anexo.id)
    setErro('')
    try {
      await onRemoverAnexo(anexo)
    } catch (err) {
      setErro(err?.message || 'Não consegui remover este anexo.')
    } finally {
      setRemovendo(null)
    }
  }

  const ocupado = !!etapa
  if (!anexos.length && !podeAnexar && !ocupado && !erro) return null

  return (
    <div className="mt-5" data-testid="memoria-anexos">
      <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
        <p className="text-section">
          {anexos.length === 0 ? 'Anexos' : anexos.length === 1 ? 'Anexo' : `Anexos · ${anexos.length}`}
        </p>
        {podeAnexar && (
          <button
            type="button"
            onClick={escolher}
            disabled={ocupado}
            className="press inline-flex min-h-[36px] items-center gap-1.5 rounded-control bg-surface-2 px-2.5 text-[13px] font-semibold text-primary active:bg-surface-3 disabled:opacity-45"
            data-testid="memoria-anexar"
          >
            <Plus size={14} />
            Anexar
          </button>
        )}
      </div>

      {/* O seletor NATIVO, e nao um de autoria propria: e ele que o iOS abre
          com Fototeca, Tirar Foto e Arquivos, sem precisarmos de menu nenhum.
          `accept` e cortesia (filtra o que aparece), nunca seguranca — quem
          recusa de verdade e a politica, depois. */}
      <input
        ref={entradaRef}
        type="file"
        accept={ACCEPT}
        onChange={aoEscolher}
        className="hidden"
        data-testid="memoria-anexo-entrada"
      />

      {ocupado && (
        <div
          className="mb-2 flex items-center gap-2.5 rounded-row bg-surface-2 px-3 py-2.5"
          data-testid="memoria-anexo-progresso"
          data-etapa={etapa}
          role="status"
        >
          <Loader2 size={15} className="shrink-0 animate-spin text-accent" />
          <span className="min-w-0 flex-1 truncate text-[14px] text-secondary">
            {ETAPAS[etapa] || 'Enviando…'}
          </span>
          {/* So existe enquanto da para desistir sem deixar rastro. */}
          {(etapa === 'validando' || etapa === 'preparando') && (
            <button
              type="button"
              onClick={cancelar}
              className="press inline-flex h-7 items-center gap-1 rounded-control px-2 text-[13px] font-medium text-secondary active:bg-surface-3"
              data-testid="memoria-anexo-cancelar"
            >
              <X size={13} />
              Cancelar
            </button>
          )}
        </div>
      )}

      {erro && (
        <div
          className="mb-2 flex items-start gap-2.5 rounded-row bg-danger/10 px-3 py-2.5"
          data-testid="memoria-anexo-erro"
          role="alert"
        >
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <span className="min-w-0 flex-1 text-[13px] leading-snug text-danger">{erro}</span>
        </div>
      )}

      {aviso && (
        <div
          className="mb-2 rounded-row bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-secondary"
          data-testid="memoria-anexo-aviso"
        >
          {aviso}
        </div>
      )}

      {anexos.length > 0 && (
        <div className="space-y-2">
          {anexos.map((a) => (
            <Anexo
              key={a.id || a.storage_path}
              anexo={a}
              podeRemover={podeAnexar}
              removendo={removendo === a.id}
              onRemover={remover}
            />
          ))}
        </div>
      )}

      {!anexos.length && podeAnexar && !ocupado && !erro && (
        <p className={cx('text-caption px-1')}>
          Fotos, PDFs e arquivos de até 10 MB.
        </p>
      )}
    </div>
  )
}
