# QA UX-M1 — Memória no telefone

UX-M1 traz Memória para a mesma linguagem visual já aprovada em Hoje (UX-M2),
Agenda (UX-M3.1) e Tarefas (UX-T1). Ela era a última das quatro telas de
primeiro nível que ainda falava a língua antiga.

Este roteiro é para o **iPhone, no Safari**. Chromium já passou — ele não
reproduz gesto, teclado, `position: fixed`, safe-area nem overscroll do iOS, e
por isso **nada abaixo foi validado** por teste automatizado.

## Antes de começar

1. Confirme que o Preview que você abriu é deste commit, na branch
   `claude/sweet-hypatia-tzkcre`. **Nunca Production.**
2. **Preview e Production podem compartilhar o mesmo Supabase.** Enquanto você
   não confirmar que são bancos diferentes, trate tudo o que digitar aqui como
   dado real.
3. Nenhum passo abaixo pede para criar dado. Se criar algo para testar,
   prefixe o título com `ZZTESTE ` e apague no fim.
4. A tela do **protótipo** (`/prototipo/…`) não faz parte deste checkpoint.

---

## A · A lista

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| A1 | Abrir **Memória** | Fundo com a mesma tonalidade fria de Hoje e Agenda; linha de contexto pequena ("N itens guardados"), **"Memória"** como maior texto da tela |
| A2 | Olhar os itens | Cada item é um **cartão** com respiro entre eles — não linhas coladas separadas por fio |
| A3 | Ler um cartão | Título em destaque, prévia de uma linha abaixo, legenda discreta no rodapé. A palavra "Nota" **não** aparece escrita ao lado do ícone de nota |
| A4 | Vir de **Tarefas** e voltar para **Memória** | Deve parecer a mesma tela de antes trocando de conteúdo, não outro aplicativo |
| A5 | Rolar até o fim | Nada vaza para os lados; a barra inferior continua única e intacta |

## B · Busca

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| B1 | Olhar o topo | O campo de busca está **visível sempre**, não escondido atrás de um ícone |
| B2 | Tocar no campo | Abre o teclado sem empurrar o cabeçalho para fora; o campo continua visível |
| B3 | Digitar algo que você guardou | A lista filtra enquanto digita; a linha de contexto passa a dizer "N resultados para …" |
| B4 | Tocar no **×** | Limpa a busca e devolve a lista inteira |
| B5 | Buscar palavra com acento, sem digitar o acento | Encontra assim mesmo ("reuniao" acha "Reunião") |

## C · Filtros

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| C1 | Olhar a fileira de chips | **Cinco** recortes: Tudo · Por organizar · Notas · Ideias · Links. O quinto aparece **cortado na borda**, sinalizando que há mais ao lado |
| C2 | Arrastar a fileira para o lado | Rola na horizontal sem arrastar a página junto |
| C3 | Tocar em **Por organizar** | Fica violeta sólido; a lista passa a mostrar só o que ainda não foi decidido |
| C4 | Tocar em **Links** | Só links. Nenhum deles aparece como "por organizar" — é limitação conhecida do modelo, não bug (ver "O que este checkpoint não faz") |

## D · Estado vazio

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| D1 | Buscar algo que não existe | Cartão branco: "Nada encontrado", com a dica sobre título e conteúdo. **Sem** botão de criar |
| D2 | Num filtro sem nenhum item | Cartão branco com o convite **"Escrever uma nota"** |
| D3 | Tocar em "Escrever uma nota" | Abre o editor de nota em tela cheia — o mesmo de sempre |

## E · Detalhe

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| E1 | Tocar num item | Abre uma folha cobrindo a tela, com o conteúdo num **cartão branco** |
| E2 | Olhar o topo da folha | O **×** fica à **esquerda**, ao alcance do polegar; ao lado dele, a linha de contexto (quando · estado) |
| E3 | Olhar o rodapé | As ações ficam numa barra ancorada embaixo — não no fim do texto |
| E4 | Conferir as ações | São as mesmas de sempre e **variam conforme o item**: um link nunca oferece "Tratar como ideia" |
| E5 | Tocar em **×** | Volta à lista com o **mesmo filtro, a mesma busca e a mesma rolagem** |
| E6 | Abrir um **link** | Mostra o domínio como botão; tocar abre em nova aba |
| E7 | Abrir um item que **levou a uma tarefa** | Seção "Levou a" com o título real da tarefa; tocar leva até ela |
| E8 | Tocar em **Excluir** | Pede confirmação explícita antes de qualquer coisa |

## F · Anexos

Esta parte só tem o que ver se você tiver alguma captura de foto guardada e se
a migration `0009_inbox_attachments.sql` estiver aplicada neste ambiente.

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| F1 | Olhar um item com foto na lista | Miniatura quadrada à direita do cartão, com a imagem de verdade |
| F2 | Abrir esse item | Seção **"Anexo"** com a imagem em tamanho de leitura |
| F3 | Tocar na imagem | Abre em nova aba |
| F4 | Abrir um item **sem** anexo | **Nenhuma** seção de anexos, nenhum espaço reservado, nenhum quadrado cinza |
| F5 | Se a 0009 **não** estiver aplicada | Memória abre normalmente, só sem miniaturas. Se ela não abrir, isso **é** um defeito — reporte |

## G · Tema escuro

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| G1 | Trocar para escuro | Fundo profundo (não preto chapado); cartões sobem um nível em vez de clarear por transparência |
| G2 | Olhar o chip ativo | Violeta claro legível sobre o fundo escuro |
| G3 | Abrir o detalhe no escuro | Cartão e barra de ações continuam separados do fundo |

## H · Desktop (conferência rápida)

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| H1 | Abrir Memória no computador | **Nada mudou**: lista à esquerda, leitura à direita, pílulas de filtro, cabeçalho em linha única |
| H2 | Abrir um item | Abre na coluna da direita, sem trocar de página |

---

## O que este checkpoint NÃO faz

- **Não captura anexo.** Escolher arquivo, enviar binário e gravar descritor
  são escritas no banco compartilhado, que este checkpoint não autoriza. A
  tela **exibe** o que já existe; ela não oferece nenhum botão de anexar.
- **Não existe filtro "Imagens".** Ele aparece na referência visual, mas
  dependeria de uma leitura opcional (a migration 0009 é de execução manual) e
  viria vazio sem explicar por quê.
- **Não corrige a lacuna dos links.** A tabela `links` não tem coluna de
  status, então um link nunca aparece como "Por organizar". Corrigir isso
  exigiria migration.
- **Não toca no desktop**, nem em Supabase, migrations, RLS, variáveis, Vercel
  ou Edge Functions.

## Medidas tiradas no Chromium (layout, não validação de iPhone)

| Largura | Busca | Chips | Vazamento horizontal |
|---|---|---|---|
| 375 | 335 × 44 px | 36 px de altura, trilho de 457 px em 351 visíveis | nenhum |
| 390 | 350 × 44 px | 36 px de altura, trilho de 457 px em 366 visíveis | nenhum |
| 430 | 390 × 44 px | 36 px de altura, trilho de 457 px em 406 visíveis | nenhum |

Os chips têm **36 px** de altura, e não 44. É exatamente a medida do chip já
aprovado em Tarefas (UX-T1) — eles são a mesma peça. Aumentá-los aqui mudaria
uma tela já aprovada, então não foi feito. Se você quiser 44 px, é uma decisão
que vale para as duas telas e precisa de um checkpoint próprio.
