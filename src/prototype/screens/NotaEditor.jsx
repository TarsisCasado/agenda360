import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { useProto, useAcoes, useDesktop } from '../store/contexto'
import { memoriaPorId } from '../store/reducer'
import { Botao } from '../parts/base'
import { cx } from '../../lib/utils'

// ---------------------------------------------------------------------------
// NOVA NOTA — o bloco de notas de volta.
//
// O produto atual tinha uma coisa simples que o 2.0 quase perdeu: abrir e
// ESCREVER. Nada de escolher tipo, nada de classificar, nada de perguntar para
// onde vai. Um cursor numa folha.
//
// Duas regras, e elas nao sao detalhe:
//
// 1. NOTA DELIBERADA NAO NASCE "POR ORGANIZAR". Quem abriu "Nova nota" e
//    escreveu ja decidiu o que estava fazendo. "Por organizar" e o estado de
//    quem jogou uma frase pela captura sem destino — nao um pedagio universal.
//
// 2. NOTA VAZIA ABANDONADA NAO CRIA LIXO. A nota so passa a existir quando ha
//    conteudo; abrir, olhar e voltar nao deixa nada para tras.
//
// O indicador de salvamento e simulado no tempo, mas VERDADEIRO quanto ao
// estado: quando ele diz "salvo", a nota esta mesmo no estado da sessao.
// ---------------------------------------------------------------------------
export default function NotaEditor() {
  const { id: idDaRota } = useParams()
  const navegar = useNavigate()
  const { estado } = useProto()
  const acoes = useAcoes()
  const desktop = useDesktop()

  const existente = idDaRota ? memoriaPorId(estado, idDaRota) : null
  const [id, setId] = useState(idDaRota || null)
  const [titulo, setTitulo] = useState(existente?.titulo || '')
  const [texto, setTexto] = useState(existente?.texto || '')
  const [situacao, setSituacao] = useState('parado') // parado | salvando | salvo
  const area = useRef(null)
  const relogio = useRef(null)

  useEffect(() => {
    // O cursor vai para o corpo, não para o título: o título é opcional e
    // quase sempre sai sozinho da primeira linha.
    const t = setTimeout(() => area.current?.focus(), 80)
    return () => clearTimeout(t)
  }, [])

  // Salvamento contínuo: escreve no estado da sessão depois de uma pausa curta.
  useEffect(() => {
    const vazio = !texto.trim() && !titulo.trim()
    if (vazio) { setSituacao('parado'); return undefined }
    if (existente && texto === existente.texto && titulo === existente.titulo && !id) return undefined

    setSituacao('salvando')
    relogio.current = setTimeout(() => {
      if (id) acoes.editarNota(id, { titulo, texto })
      else {
        acoes.criarNota({ titulo, texto })
        // O reducer cria com o próximo id da sequência; a tela descobre qual é
        // no render seguinte (abaixo), e daí em diante edita em vez de criar.
        setId('pendente')
      }
      setSituacao('salvo')
    }, 550)
    return () => clearTimeout(relogio.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, texto])

  // Descobre o id real da nota recém-criada (a mais recente da memória).
  useEffect(() => {
    if (id !== 'pendente') return
    const recente = estado.memoria[0]
    if (recente) setId(recente.id)
  }, [id, estado.memoria])

  const concluir = () => {
    const alvo = id && id !== 'pendente' ? id : estado.memoria[0]?.id
    if (!texto.trim() && !titulo.trim()) navegar('/prototipo/memoria')
    else navegar(alvo ? `/prototipo/memoria/${alvo}` : '/prototipo/memoria')
  }

  return (
    <div className="px-entra">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navegar('/prototipo/memoria')}
          className="press -ml-1 flex items-center gap-1.5 text-[13.5px] text-muted hover:text-primary"
        >
          <ArrowLeft size={16} /> Memória
        </button>
        <span className="px-motivo ml-auto inline-flex items-center gap-1.5" aria-live="polite">
          {situacao === 'salvando' && (<><Loader2 size={12} className="animate-spin" /> salvando…</>)}
          {situacao === 'salvo' && (<><Check size={12} className="text-positive" /> salvo</>)}
          {situacao === 'parado' && 'nada escrito ainda'}
        </span>
      </div>

      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Título (opcional)"
        aria-label="Título da nota"
        className={cx('px-editor text-[21px] font-semibold leading-snug', desktop ? 'mt-5' : 'mt-4')}
      />

      <textarea
        ref={area}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={16}
        aria-label="Conteúdo da nota"
        placeholder={desktop ? 'Escreva. Não precisa classificar nada agora.' : 'Escreva.'}
        className={cx('px-editor', desktop ? 'mt-2 min-h-[46vh]' : 'mt-1.5 min-h-[52vh]')}
      />

      {/* UX1.2.1 — no telefone o rodapé explicava duas regras que a tela já
          cumpre sozinha; sobrou a única coisa que precisa estar aqui: sair. */}
      <div className={cx('border-t border-hairline pt-4', desktop ? 'mt-4 flex flex-wrap items-center gap-2' : 'mt-2')}>
        <Botao variante="primario" onClick={concluir}>Concluir</Botao>
        {desktop && (
          <p className="text-[12px] leading-relaxed text-faint">
            Uma nota escrita de propósito não entra em “Por organizar”. Sair sem
            escrever nada não cria nota nenhuma.
          </p>
        )}
      </div>
    </div>
  )
}
