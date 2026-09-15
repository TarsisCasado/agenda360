import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, Smartphone, Sparkles, ChevronRight } from 'lucide-react'
import { Page, PageHeader } from '../components/layout/Page'
import { TextInput } from '../components/ui/Form'
import { cx } from '../lib/utils'
import { rotuloFuso } from '../lib/timezone'
import { useTimezone } from '../hooks/useTimezone'
import InstallGuide from '../components/pwa/InstallGuide'
import DeviceNotifications from '../components/notifications/DeviceNotifications'
import { resetPreferences } from '../lib/preferences'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { categoryService } from '../services/categoryService'
import { logService } from '../services/logService'
import { localStore } from '../services/localStore'
import { LOG_ACTION_LABELS, ROLE_LABELS, WORKSPACE_ROLE_LABELS } from '../lib/constants'

const PRESET_COLORS = [
  '#6366f1', '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981',
  '#ec4899', '#ef4444', '#14b8a6', '#84cc16', '#f97316',
]

export default function Settings() {
  const { user, isDemo } = useAuth()
  const { workspace, workspaceId, workspaces, role } = useWorkspace()
  const { categories, loadCategories } = useData()
  const { toast } = useToast()
  const [newCat, setNewCat] = useState({ name: '', color: PRESET_COLORS[0] })
  const [logs, setLogs] = useState([])
  const [installOpen, setInstallOpen] = useState(false)
  const { timezone } = useTimezone()

  const redoOnboarding = () => {
    resetPreferences(workspaceId)
    window.location.reload()
  }

  const loadLogs = useCallback(async () => {
    if (!workspaceId) return
    const data = await logService.list(workspaceId, { limit: 20 })
    setLogs(data)
  }, [workspaceId])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const addCategory = async (e) => {
    e.preventDefault()
    if (!newCat.name.trim()) return
    await categoryService.create(workspaceId, user.id, newCat)
    setNewCat({ name: '', color: PRESET_COLORS[0] })
    await loadCategories()
    toast('Categoria criada')
  }

  const removeCategory = async (id) => {
    await categoryService.remove(id)
    await loadCategories()
    toast('Categoria removida')
  }

  const resetDemo = () => {
    if (!window.confirm('Isso apaga todos os dados locais e recria o seed. Continuar?'))
      return
    localStore.reset()
    window.location.reload()
  }

  // ---------------------------------------------------------------------------
  // COMPOSICAO (CP5.7). Eram sete cartoes com borda, cada um aberto por um
  // titulo azul com icone — a gramatica de um painel administrativo. Uma tela
  // de ajustes de aplicativo se le em LINHAS: um rotulo discreto agrupa, e
  // cada ajuste e uma linha com o nome a esquerda e o valor (ou a acao) a
  // direita. Nada aqui mudou de funcao; mudou o peso.
  // ---------------------------------------------------------------------------
  return (
    <Page width="form">
      <PageHeader title="Configurações" subtitle="Sua conta, suas categorias e este aparelho" />

      <div className="space-y-6">
        <Grupo titulo="Workspace">
          <Linha rotulo="Espaço" valor={workspace?.name || 'Pessoal'} />
          <Linha rotulo="Seu papel" valor={WORKSPACE_ROLE_LABELS[role] || role} />
          <Linha rotulo="Espaços" valor={String(workspaces.length)} />
          <Nota>
            Atividades, categorias, links e histórico pertencem a este espaço. A arquitetura já
            permite criar outros (Família, Igreja, Projetos) e convidar pessoas com papéis distintos.
          </Nota>
        </Grupo>

        <Grupo titulo="Aplicativo">
          <Acao icone={Smartphone} rotulo="Instalar na tela inicial" onClick={() => setInstallOpen(true)} />
          <Acao
            icone={Sparkles}
            rotulo="Refazer a configuração da rotina"
            descricao="É ela que personaliza as sugestões do assistente."
            onClick={redoOnboarding}
          />
        </Grupo>

        <Grupo titulo="Notificações deste aparelho">
          <div className="px-3 py-3">
            <DeviceNotifications variant="card" onOpenInstall={() => setInstallOpen(true)} />
          </div>
          <Nota>
            Vale para <strong className="font-semibold text-secondary">este aparelho</strong>. No
            iPhone, as notificações exigem o app na Tela de Início, aberto pelo ícone.
          </Nota>
        </Grupo>

        <Grupo titulo="Conta">
          <Linha rotulo="Nome" valor={user?.full_name} />
          <Linha rotulo="E-mail" valor={user?.email} />
          <Linha rotulo="Perfil" valor={ROLE_LABELS[user?.role] || user?.role} />
          {/* O fuso vem do aparelho e e mostrado pela CIDADE — ninguem precisa
              saber escrever "America/Fortaleza" para o lembrete chegar na hora
              certa. O dado guardado continua sendo IANA. */}
          <Linha rotulo="Fuso horário" valor={rotuloFuso(timezone)} />
        </Grupo>

        <Grupo titulo="Categorias">
          <div className="px-3 py-3">
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <span key={c.id} className="chip group bg-surface-2 text-secondary">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                  <button
                    onClick={() => removeCategory(c.id)}
                    aria-label={`Remover ${c.name}`}
                    className="ml-0.5 text-muted transition-colors hover:text-danger"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              ))}
            </div>
            <form onSubmit={addCategory} className="mt-3 flex items-end gap-2">
              <TextInput
                label="Nova categoria"
                className="flex-1"
                value={newCat.name}
                onChange={(e) => setNewCat((c) => ({ ...c, name: e.target.value }))}
                placeholder="Nome"
              />
              <div className="flex shrink-0 items-center gap-1 pb-1">
                {PRESET_COLORS.slice(0, 5).map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Cor ${color}`}
                    onClick={() => setNewCat((c) => ({ ...c, color }))}
                    className={cx(
                      'h-7 w-7 rounded-full transition-transform',
                      newCat.color === color ? 'scale-110 ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'opacity-70',
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button type="submit" aria-label="Criar categoria" className="btn-primary press mb-0.5 !px-3">
                <Plus size={16} />
              </button>
            </form>
          </div>
        </Grupo>

        <Grupo titulo="Histórico">
          {logs.length === 0 ? (
            <p className="text-caption px-3 py-3">Sem registros ainda.</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="chip shrink-0 bg-surface-2 text-muted">
                    {LOG_ACTION_LABELS[l.action] || l.action}
                  </span>
                  <span className="truncate text-[14px] text-secondary">{l.description}</span>
                </div>
                <span className="text-caption shrink-0 tabular-nums">
                  {new Date(l.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            ))
          )}
        </Grupo>

        {isDemo && (
          <Grupo titulo="Dados locais (modo demo)">
            <Nota>
              Sem Supabase configurado, tudo fica apenas neste navegador. Defina{' '}
              <code className="text-[12px]">VITE_SUPABASE_URL</code> e{' '}
              <code className="text-[12px]">VITE_SUPABASE_ANON_KEY</code> para guardar na nuvem.
            </Nota>
            <div className="px-3 pb-3">
              <button onClick={resetDemo} className="btn-danger press">
                <Trash2 size={16} /> Apagar os dados deste navegador
              </button>
            </div>
          </Grupo>
        )}
      </div>

      <InstallGuide open={installOpen} onClose={() => setInstallOpen(false)} />
    </Page>
  )
}

// --- As pecas desta tela ------------------------------------------------------
// Um grupo e um rotulo discreto + um painel de linhas. E a mesma gramatica da
// lista do resto do produto — nao um cartao com titulo colorido.
function Grupo({ titulo, children }) {
  return (
    <section>
      <h2 className="text-section mb-1.5 px-1">{titulo}</h2>
      <div className="list-panel">{children}</div>
    </section>
  )
}

function Linha({ rotulo, valor }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="text-[15px] text-secondary">{rotulo}</span>
      <span className="truncate text-[15px] font-medium text-primary">{valor}</span>
    </div>
  )
}

function Acao({ icone: Icone, rotulo, descricao, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors active:bg-surface-2 lg:hover:bg-surface-2"
    >
      {Icone && <Icone size={17} className="shrink-0 text-muted" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-primary">{rotulo}</span>
        {descricao && <span className="text-caption block">{descricao}</span>}
      </span>
      <ChevronRight size={16} className="shrink-0 text-muted" />
    </button>
  )
}

// Explicacao de rodape do grupo: texto, sem caixa dentro de caixa.
function Nota({ children }) {
  return <p className="text-caption px-3 py-2.5 leading-relaxed">{children}</p>
}
