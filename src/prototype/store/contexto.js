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
      limparAviso: () => dispatch({ tipo: 'limparAviso' }),
    }),
    [dispatch],
  )
}
