import {
  Sun,
  CalendarDays,
  ListTodo,
  Lightbulb,
  Sparkles,
  Inbox,
  Link2,
  BarChart3,
  Settings,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// MAPA DE NAVEGACAO — fonte unica.
//
// Barra lateral (desktop), menu de perfil (mobile) e paleta de comandos leem
// daqui. Antes cada superficie tinha a propria lista, e foi assim que o produto
// acumulou 11 destinos sem ninguem decidir que deveria ter 11.
//
// A pergunta que separa as duas listas: isto e um LUGAR ou um RECORTE?
//   Hoje, Agenda, Tarefas, Ideias  -> lugares. Primeiro nivel.
//   Mes, Semana                    -> recortes. Viraram visao dentro de Agenda
//                                     e de Tarefas, com seletor na propria tela.
//   Copiloto, Caixa, Links,
//   Relatorios, Configuracoes      -> lugares secundarios. Ficam em "Mais".
// ---------------------------------------------------------------------------
export const PRIMARY = [
  { to: '/', label: 'Hoje', icon: Sun, end: true },
  { to: '/dia', label: 'Agenda', icon: CalendarDays },
  { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
  { to: '/ideias', label: 'Ideias', icon: Lightbulb },
]

export const SECONDARY = [
  { to: '/assistente', label: 'Copiloto', icon: Sparkles },
  { to: '/caixa', label: 'Caixa de entrada', icon: Inbox },
  { to: '/links', label: 'Central de links', icon: Link2 },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/config', label: 'Configurações', icon: Settings },
]
