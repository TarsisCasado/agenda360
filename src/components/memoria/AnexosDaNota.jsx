import { useEffect, useRef, useState } from 'react'
import {
  Paperclip, FileText, Music, ExternalLink, Download, Trash2,
  Loader2, AlertCircle, Plus, X,
} from 'lucide-react'
import { cx } from '../../lib/utils'
import { captureService } from '../../services/captureService'
import {
  ACCEPT, MARGEM_RENOVACAO_SEGUNDOS, tamanhoLegivel, urlExpirada,
} from '../../lib/anexoPolitica'

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
function Anexo({ anexo, titulo, podeRemover, onRemover, removendo }) {
  const [ref, setRef] = useState(null)
  const [falhou, setFalhou] = useState(false)
  const [renovando, setRenovando] = useState(false)
  const [recado, setRecado] = useState('')

  useEffect(() => {
    let vivo = true
    captureService.urlDeAnexoComValidade(anexo).then((r) => { if (vivo) setRef(r) })
    return () => { vivo = false }
  }, [anexo])

  // -------------------------------------------------------------------------
  // RENOVACAO ANTECIPADA (UX-M2.5a).
  //
  // Isto existe para que o caminho normal de abrir e baixar NUNCA precise
  // esperar a rede. A URL vale uma hora; o temporizador acorda um pouco antes
  // disso e troca a URL em segundo plano, enquanto ninguem esta tocando em
  // nada. Quando a pessoa toca, a URL ja esta fresca e o link abre no mesmo
  // instante — que e exatamente o que o iOS Safari exige para nao tratar a
  // abertura como pop-up.
  //
  // `MARGEM_RENOVACAO_SEGUNDOS` nao e repetido aqui: `urlExpirada` ja decide
  // com margem, e esta conta so escolhe QUANDO acordar.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!ref?.expiraEm) return undefined
    const faltam = ref.expiraEm - Date.now() - MARGEM_RENOVACAO_SEGUNDOS * 1000
    // Ja venceu (aba dormiu, aparelho ficou guardado): renova agora.
    const quando = Math.max(0, faltam)
    const t = setTimeout(async () => {
      const novo = await captureService.urlDeAnexoComValidade(anexo)
      if (novo?.url) setRef(novo)
    }, quando)
    return () => clearTimeout(t)
  }, [anexo, ref?.expiraEm])

  const nome = captureService.nomeDeDownload(titulo, anexo.mime)

  // O clique no link, sem nenhum `await` antes dele. Separado em funcao
  // propria porque e usado nos dois caminhos — o sincrono e o de excecao.
  const abrirUrl = (url, { baixar = false } = {}) => {
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener noreferrer'
    if (baixar) {
      // `download` no `<a>` e IGNORADO em link de outra origem, e a URL do
      // Storage e sempre de outra origem. Quem faz o arquivo ser SALVO e o
      // `Content-Disposition: attachment` que o parametro `download=` da URL
      // provoca no servidor. O atributo fica como cortesia para o dia em que a
      // origem for a mesma, e o nome serve de dica ao navegador.
      a.download = nome
    } else {
      a.target = '_blank'
    }
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // -------------------------------------------------------------------------
  // BAIXAR — sincrono quando pode, e so entao assincrono.
  //
  // O caminho normal nao vai a rede: `urlDeDownload` DERIVA a URL de download
  // da URL de exibicao que ja esta em mao (o parametro `download` nao entra na
  // assinatura — ver `captureService.urlDeDownload`). Toque e abertura
  // acontecem no mesmo tique, e o Safari nao tem o que bloquear.
  //
  // So se a URL tiver vencido — aba aberta ha mais de uma hora e o
  // temporizador nao acordou, porque o aparelho esteve dormindo — e que se vai
  // a rede. Nesse caso NAO se tenta abrir janela depois do `await`, porque e
  // isso que o Safari recusa: renova-se a URL e pede-se o segundo toque, com
  // uma frase que explica. Um toque extra e um preco honesto; um botao que nao
  // faz nada, nao.
  // -------------------------------------------------------------------------
  const baixar = () => {
    const direto = captureService.urlDeDownload(ref, { titulo, mime: anexo.mime })
    if (direto) { setRecado(''); abrirUrl(direto, { baixar: true }); return }
    if (renovando) return
    setRenovando(true)
    setRecado('')
    captureService.urlDeAnexoComValidade(anexo)
      .then((novo) => {
        if (novo?.url) {
          setRef(novo)
          setRecado('O link expirou e foi renovado. Toque em Baixar outra vez.')
        } else {
          // NAO marca `falhou`: isso esconderia a imagem. Um download que nao
          // deu nao e motivo para a foto sair da tela.
          setRecado('Não consegui preparar o download deste anexo agora.')
        }
      })
      .catch(() => {
        setRecado('Não consegui preparar o download deste anexo agora.')
      })
      .finally(() => setRenovando(false))
  }

  // ABRIR — mesma logica, sem a parte do download. Imagem e PDF continuam
  // abrindo em aba nova como antes.
  const abrir = () => {
    if (ref?.url && !urlExpirada(ref.expiraEm)) { setRecado(''); abrirUrl(ref.url); return }
    if (renovando) return
    setRenovando(true)
    setRecado('')
    captureService.urlDeAnexoComValidade(anexo)
      .then((novo) => {
        if (novo?.url) {
          setRef(novo)
          setRecado('O link expirou e foi renovado. Toque outra vez para abrir.')
        } else {
          setFalhou(true)
        }
      })
      .catch(() => { setFalhou(true) })
      .finally(() => setRenovando(false))
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
          onClick={abrir}
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
          onClick={abrir}
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
          onClick={baixar}
          className="press inline-flex min-h-[36px] items-center gap-1.5 rounded-control px-2.5 text-[13px] font-medium text-secondary active:bg-surface-3"
          data-testid="memoria-anexo-baixar"
        >
          {renovando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
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

      {/* O recado so existe no caminho de excecao (link vencido depois de uma
          hora de folha aberta). Nenhum pixel novo no estado normal — e o que
          mantem a tela aprovada do UX-M2.4 intacta. */}
      {recado && (
        <p
          className="border-t hair px-3 py-2 text-[12px] leading-snug text-secondary"
          data-testid="memoria-anexo-recado"
          role="status"
        >
          {recado}
        </p>
      )}
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
              titulo={item?.titulo || ''}
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
