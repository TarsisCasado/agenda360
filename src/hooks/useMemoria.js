import { useCallback, useEffect, useState } from 'react'
import { inboxService } from '../services/inboxService'
import { linkService } from '../services/linkService'
import { inboxTaskLinkService } from '../services/inboxTaskLinkService'
import { captureService } from '../services/captureService'
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
// E, desde UX-M1, uma QUARTA, em segunda etapa:
//   captureService.anexosDeItens -> descritores de anexo das notas lidas
//
// Nenhuma escrita: abrir Memoria nao marca visto, nao arquiva, nao converte e
// nao classifica nada. O unico efeito de entrar aqui e ler.
//
// DUAS CLASSES DE LEITURA, E A DIFERENCA E DELIBERADA.
//
// Notas e links sao a propria tela: se eles falharem, a tela mostra erro em
// vez de uma Memoria vazia que mentiria dizendo "voce nao guardou nada".
//
// Vinculos e anexos sao ENFEITE INFORMATIVO: tolerantes a falha. Se
// `convertedMap` cair perde-se a legenda "levou a..."; se `anexosDeItens`
// cair, perdem-se miniaturas e a secao de anexos. Em nenhum dos dois casos o
// que a pessoa escreveu some da tela.
//
// No caso dos anexos essa tolerancia nao e zelo abstrato: a migration 0009
// (tabela `inbox_attachments` + bucket `captures`) e marcada para execucao
// MANUAL no SQL Editor, entao o ambiente pode legitimamente nao te-la. Uma
// leitura obrigatoria ali transformaria "ainda nao rodei a 0009" em "Memoria
// nao abre". Por isso ela e a segunda etapa e nao entra no `Promise.all`
// principal: os ids das notas so existem depois da primeira leitura, e o custo
// de errar aqui e zero.
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
      const anexos = await captureService
        .anexosDeItens(workspaceId, notas.map((n) => n.id))
        .catch(() => ({}))
      setItens(agregarMemoria({ notas, links, vinculos, anexos }))
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
