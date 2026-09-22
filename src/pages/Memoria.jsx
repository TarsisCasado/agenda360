import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, Inbox, Link2, ChevronRight, Search } from 'lucide-react'
import { Page, PageHeader } from '../components/layout/Page'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { inboxService } from '../services/inboxService'
import { linkService } from '../services/linkService'
import { pluralize } from '../lib/plural'

// ---------------------------------------------------------------------------
// MEMORIA — a porta do que foi guardado (C2).
//
// ISTO NAO E A TELA MEMORIA DO 2.0. E a menor camada que faz o destino existir
// sem que nenhuma capacidade atual desapareca. As tres telas de sempre —
// Ideias, Caixa de entrada e Central de links — continuam intactas, nas rotas
// de sempre; o que muda e que agora se chega a elas por um lugar so, e esse
// lugar tem nome no primeiro nivel da navegacao.
//
// POR QUE UM HUB, E NAO A LISTA DE NOTAS DIRETO. Juntar as tres listas numa so
// exigiria reescrever as tres telas, e o C2 e navegacao: redesenhar tela
// interna esta fora do escopo. Um hub custa um toque a mais para quem ia direto
// a "Ideias" — e honesto dizer isso — e em troca nao mexe em nenhuma das
// capacidades que ja funcionam.
//
// LEITURA PURA. As contagens saem de `inboxService.list` e `linkService.list`,
// os mesmos servicos que as telas usam. Nenhum estado muda por abrir esta
// pagina: nada e convertido, arquivado, marcado como visto ou classificado.
// ---------------------------------------------------------------------------

function Area({ to, icon: Icon, titulo, descricao, contagem }) {
  return (
    <Link
      to={to}
      className="interactive flex items-center gap-3 rounded-row bg-surface px-3.5 py-3.5 hover:bg-surface-2"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-surface-2 text-accent">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-primary">{titulo}</span>
        <span className="text-caption block truncate">{descricao}</span>
      </span>
      {contagem !== null && (
        <span className="text-caption shrink-0 tabular-nums">{contagem}</span>
      )}
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </Link>
  )
}

export default function Memoria() {
  const { workspaceId } = useWorkspace()
  const { reloadKey } = useData()
  const [contagens, setContagens] = useState({ notas: null, porOrganizar: null, links: null })

  useEffect(() => {
    if (!workspaceId) return undefined
    let vivo = true
    Promise.all([inboxService.list(workspaceId), linkService.list(workspaceId)])
      .then(([itens, links]) => {
        if (!vivo) return
        setContagens({
          notas: itens.length,
          porOrganizar: itens.filter((n) => n.status === 'inbox').length,
          links: links.length,
        })
      })
      .catch(() => {
        // Sem contagem a pagina continua servindo: o que ela precisa entregar
        // e o CAMINHO para as tres areas, nao o numero.
        if (vivo) setContagens({ notas: null, porOrganizar: null, links: null })
      })
    return () => { vivo = false }
  }, [workspaceId, reloadKey])

  const rotulo = (n, singular, plural) => (n === null ? null : pluralize(n, singular, plural))

  return (
    <Page width="content">
      <PageHeader title="Memória" subtitle="O que você guardou" />

      <div className="space-y-2">
        <Area
          to="/ideias"
          icon={Lightbulb}
          titulo="Notas e ideias"
          descricao="O que você anotou para lembrar depois"
          contagem={rotulo(contagens.notas, 'item', 'itens')}
        />
        <Area
          to="/caixa"
          icon={Inbox}
          titulo="Por organizar"
          descricao="Capturas que ainda não viraram nada — e não precisam virar"
          contagem={rotulo(contagens.porOrganizar, 'item', 'itens')}
        />
        <Area
          to="/links"
          icon={Link2}
          titulo="Links e referências"
          descricao="Endereços salvos com nome"
          contagem={rotulo(contagens.links, 'link', 'links')}
        />
      </div>

      <p className="text-caption mt-5 flex items-center gap-1.5 px-2">
        <Search size={13} className="shrink-0" />
        Procure por qualquer palavra do que você guardou com
        <kbd className="rounded border hair px-1.5 font-semibold">⌘K</kbd>
      </p>
    </Page>
  )
}
