import { createContext, useContext, useMemo, useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// O estado do prototipo vive no PrototypeStore e em lugar nenhum mais: sem
// Supabase, sem localStorage, sem servico. Recarregar a pagina recomeca a
// historia — correto para uma peca de avaliacao, e a garantia de que nada do
// prototipo escape para o produto real.
//
// Este arquivo guarda o contexto e os ganchos. O provider fica no .jsx ao lado
// (arquivo de componente exporta componente; o resto mora aqui).
// ---------------------------------------------------------------------------
export const ProtoCtx = createContext(null)

export function useProto() {
  const ctx = useContext(ProtoCtx)
  if (!ctx) throw new Error('useProto fora do PrototypeStore')
  return ctx
}

// Feedback discreto: aparece, informa, sai. Nunca navega sozinho — quem captura
// continua onde estava (e a diferenca entre uma interrupcao curta e um desvio).
export function useAviso() {
  const { estado, dispatch } = useProto()
  useEffect(() => {
    if (!estado.aviso) return undefined
    const t = setTimeout(() => dispatch({ tipo: 'limparAviso' }), 4500)
    return () => clearTimeout(t)
  }, [estado.aviso, dispatch])
  return estado.aviso
}

// Media query sem dependencia: o prototipo precisa SABER se esta no telefone
// para escolher o layout, nao apenas para encolher o de desktop.
export function useDesktop() {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const ouvir = (e) => setDesktop(e.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])
  return desktop
}

// ---------------------------------------------------------------------------
// TEMA — resolvido DENTRO do protótipo.
//
// O protótipo não mexe na classe do <html>: se mexesse, sair para o produto
// deixaria o tema trocado atrás dele. Em vez disso a raiz do protótipo carrega
// a própria escala de cor, e "Sistema" escuta a preferência do aparelho ao
// vivo. Não persiste depois do reload — e o briefing diz que não precisa.
// ---------------------------------------------------------------------------
export function useTema() {
  const { estado } = useProto()
  const [sistemaEscuro, setSistemaEscuro] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const ouvir = (e) => setSistemaEscuro(e.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])
  const escolhido = estado.tema || 'sistema'
  const escuro = escolhido === 'escuro' || (escolhido === 'sistema' && sistemaEscuro)
  return { escolhido, escuro, classe: escuro ? 'px-escuro' : 'px-claro' }
}

export function useAcoes() {
  const { dispatch } = useProto()
  return useMemo(
    () => ({
      guardar: (texto) => dispatch({ tipo: 'guardar', texto }),
      guardarReferencia: (texto, titulo) => dispatch({ tipo: 'guardarReferencia', texto, titulo }),
      guardarRascunho: (rascunho) => dispatch({ tipo: 'guardarRascunho', rascunho }),
      descartarRascunho: () => dispatch({ tipo: 'descartarRascunho' }),
      criarCompromisso: (dados) => dispatch({ tipo: 'criarCompromisso', dados }),
      criarTarefa: (dados) => dispatch({ tipo: 'criarTarefa', dados }),
      mudarEstado: (id, estadoNovo) => dispatch({ tipo: 'mudarEstado', id, estado: estadoNovo }),
      editarTarefa: (id, patch) => dispatch({ tipo: 'editarTarefa', id, patch }),
      excluirTarefa: (id) => dispatch({ tipo: 'excluirTarefa', id }),
      editarCompromisso: (id, patch) => dispatch({ tipo: 'editarCompromisso', id, patch }),
      excluirCompromisso: (id) => dispatch({ tipo: 'excluirCompromisso', id }),
      moverTarefa: (id, paraEstado, antesDe) => dispatch({ tipo: 'moverTarefa', id, paraEstado, antesDe }),
      escolherParaHoje: (id, valor) => dispatch({ tipo: 'escolherParaHoje', id, valor }),
      planejarPara: (id, data) => dispatch({ tipo: 'planejarPara', id, data }),
      retirarPlanejamento: (id) => dispatch({ tipo: 'retirarPlanejamento', id }),
      reservarHorario: (id, data, inicio, fim) =>
        dispatch({ tipo: 'reservarHorario', id, data, inicio, fim }),
      retirarReserva: (id) => dispatch({ tipo: 'retirarReserva', id }),
      reagendar: (id, data) => dispatch({ tipo: 'reagendar', id, data }),
      adicionarSubtarefas: (id, titulos) => dispatch({ tipo: 'adicionarSubtarefas', id, titulos }),
      alternarSubtarefa: (id, subId) => dispatch({ tipo: 'alternarSubtarefa', id, subId }),
      organizarMemoria: (id, tipoNovo) => dispatch({ tipo: 'organizarMemoria', id, tipoNovo }),
      aplicarPlano: (mudancas) => dispatch({ tipo: 'aplicarPlano', mudancas }),
      // notas
      criarNota: (dados) => dispatch({ tipo: 'criarNota', ...dados }),
      editarNota: (id, patch) => dispatch({ tipo: 'editarNota', id, patch }),
      arquivarMemoria: (id, valor) => dispatch({ tipo: 'arquivarMemoria', id, valor }),
      excluirMemoria: (id) => dispatch({ tipo: 'excluirMemoria', id }),
      // delegação
      delegar: (id, paraId) => dispatch({ tipo: 'delegar', id, paraId }),
      aceitar: (id, porId) => dispatch({ tipo: 'aceitarResponsabilidade', id, porId }),
      devolver: (id, motivo, porId) => dispatch({ tipo: 'devolverResponsabilidade', id, motivo, porId }),
      retomar: (id) => dispatch({ tipo: 'retomarTarefa', id }),
      bloquear: (id, motivo, porId) => dispatch({ tipo: 'bloquearTarefa', id, motivo, porId }),
      comentar: (id, texto, porId) => dispatch({ tipo: 'comentarTarefa', id, texto, porId }),
      alternarAcompanhar: (id) => dispatch({ tipo: 'alternarAcompanhar', id }),
      // notificações
      lerNotificacao: (id) => dispatch({ tipo: 'lerNotificacao', id }),
      lerTodasNotificacoes: () => dispatch({ tipo: 'lerTodasNotificacoes' }),
      // copiloto (a conversa é estado da sessão, não do componente)
      copilotoTurno: (turno, contexto) => dispatch({ tipo: 'copilotoTurno', turno, contexto }),
      copilotoProposta: (proposta) => dispatch({ tipo: 'copilotoProposta', proposta }),
      copilotoContexto: (contexto) => dispatch({ tipo: 'copilotoContexto', contexto }),
      // tema
      definirTema: (tema) => dispatch({ tipo: 'definirTema', tema }),
      limparAviso: () => dispatch({ tipo: 'limparAviso' }),
    }),
    [dispatch],
  )
}
