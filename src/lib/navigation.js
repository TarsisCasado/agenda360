import {
  Sun,
  CalendarDays,
  ListTodo,
  Library,
  Sparkles,
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
// A pergunta que separa as listas: isto e um LUGAR ou um RECORTE?
//   Hoje, Agenda, Tarefas, Memoria -> lugares. Primeiro nivel.
//   Mes, Semana                    -> recortes. Sao visao dentro de Agenda e
//                                     de Tarefas, com seletor na propria tela.
//
// -------------------- C2: A HIERARQUIA PASSA A SER DECLARADA ---------------
//
// Ate aqui havia duas listas ("primario" e "mais") e a ordem dentro da segunda
// era historica, nao decidida. O UX1.3.1 fechou quatro DESTINOS e um conjunto
// de capacidades que NAO sao destino — e a diferenca entre as duas coisas
// precisa estar no codigo, nao so no desenho.
//
// Por isso os grupos abaixo tem nome. Quem renderiza le a estrutura; nenhuma
// superficie precisa saber de cor que "Copiloto vem antes de Relatorios".
//
// IDEIAS VIROU MEMORIA, e isso nao e renomear um item de menu. "Ideias" e
// "Caixa de entrada" sempre foram a MESMA tabela (`inbox_items`), expostas
// como dois lugares; "Central de links" e uma tabela irma. Memoria e o lugar
// unico do que foi guardado. As tres telas antigas continuam existindo e
// continuam alcancaveis — por Memoria e pelas rotas de sempre.
//
// O QUE NAO ESTA AQUI, E POR QUE:
//   Criar/Capturar e Buscar   sao ACAO GLOBAL e UTILIDADE, nao destinos: no
//                             desktop vivem na Topbar (botao + campo de busca),
//                             no telefone vivem no `+` central e no menu
//                             pessoal. Duplica-los na lateral deixaria a barra
//                             carregada sem dar acesso novo a nada;
//   Notificacoes e Perfil     idem: cluster direito da Topbar, com o sino e o
//                             badge que ja existem;
//   Revisao                   NAO EXISTE no produto. O UX1.3.1 a classificou
//                             como capacidade a INCORPORAR, em checkpoint
//                             proprio. Um item de menu apontando para uma tela
//                             inexistente seria pior que a ausencia.
// ---------------------------------------------------------------------------

// Os quatro destinos. Primeiro nivel em toda superficie.
export const DESTINOS = [
  { to: '/', label: 'Hoje', icon: Sun, end: true },
  { to: '/dia', label: 'Agenda', icon: CalendarDays },
  { to: '/tarefas', label: 'Tarefas', icon: ListTodo },
  { to: '/memoria', label: 'Memória', icon: Library },
]

// Capacidades que nao sao destino, agrupadas pelo papel que cumprem.
export const GRUPOS_SECUNDARIOS = [
  {
    titulo: 'Assistência',
    itens: [{ to: '/assistente', label: 'Copiloto', icon: Sparkles }],
  },
  {
    titulo: 'Acompanhamento',
    itens: [{ to: '/relatorios', label: 'Relatórios', icon: BarChart3 }],
  },
]

// Base: o que sustenta o resto. Fica no RODAPE da barra, nao no meio da lista.
export const BASE = [{ to: '/config', label: 'Configurações', icon: Settings }]

// ---------------------------------------------------------------------------
// COMPATIBILIDADE. `PRIMARY` e `SECONDARY` continuam existindo porque outras
// superficies (menu pessoal do telefone) leem essas listas. Agora sao derivadas
// dos grupos, entao nao ha como um lugar do produto discordar do outro.
// ---------------------------------------------------------------------------
export const PRIMARY = DESTINOS
export const SECONDARY = [...GRUPOS_SECUNDARIOS.flatMap((g) => g.itens), ...BASE]
