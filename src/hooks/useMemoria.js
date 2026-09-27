import { useCallback, useEffect, useState } from 'react'
import { inboxService } from '../services/inboxService'
import { linkService } from '../services/linkService'
import { inboxTaskLinkService } from '../services/inboxTaskLinkService'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { agregarMemoria } from '../lib/memoria'

// ---------------------------------------------------------------------------
// As fontes reais da Memoria, lidas de uma vez (C3).
//
// Tres leituras EM PARALELO, todas ja existentes no produto:
//   inboxService.list          -> notas, ideias e capturas (inbox_items)
//   linkService.list           -> links
//   inboxTaskLinkService.convertedMap -> vinculo nota -> tarefa
//
// Nenhuma escrita: abrir Memoria nao marca visto, nao arquiva, nao converte e
// nao classifica nada. O unico efeito de entrar aqui e ler.
//
// O vinculo e tolerante a falha: se `convertedMap` cair, a lista ainda serve —
// perde-se a legenda "1 tarefa relacionada", nunca o conteudo. Ja notas e
// links sao a propria tela: se eles falharem, a tela mostra erro em vez de uma
// Memoria vazia que mentiria dizendo "voce nao guardou nada".
// ---------------------------------------------------------------------------
export function useMemoria() {
  const { workspaceId } = useWorkspace()
  const { reloadKey } = useData()
  const [itens, setItens] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(async () => {
    if (!workspaceId) return
    setErro(null)
    try {
      const [notas, links, vinculos] = await Promise.all([
        inboxService.list(workspaceId),
        linkService.list(workspaceId),
        inboxTaskLinkService.convertedMap(workspaceId).catch(() => ({})),
      ])
      setItens(agregarMemoria({ notas, links, vinculos }))
    } catch (err) {
      console.error('[useMemoria] falha ao carregar:', err?.message || err)
      setErro(err)
    } finally {
      setCarregando(false)
    }
  }, [workspaceId])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    carregar().finally(() => { if (!vivo) return })
    return () => { vivo = false }
  }, [carregar, reloadKey])

  return { itens, carregando, erro, recarregar: carregar }
}
