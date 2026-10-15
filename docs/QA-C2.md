# QA C2 — Integração visual com o produto real

C2 é o commit **945a860** da branch `claude/sweet-hypatia-tzkcre`. Teste o Preview
desse commit ou de qualquer um posterior **da mesma branch** — **nunca Production**.

Este roteiro é para o **iPhone, no Safari**. Chromium já passou — ele não
reproduz gesto, teclado, `position: fixed`, safe-area nem overscroll do iOS, e
por isso nada abaixo foi "validado" por teste automatizado.

## Antes de começar

1. Confirme que o Preview que você abriu é deste commit.
2. **Preview e Production podem compartilhar o mesmo Supabase.** Enquanto você
   não confirmar que são bancos diferentes, trate tudo o que digitar aqui como
   dado real.
3. Se for criar algo para testar, **prefixe o título com `ZZTESTE `** e apague
   no fim. Nada neste roteiro pede para criar: todos os passos leem o que você
   já tem.
4. A tela do **protótipo** (`/prototipo/…`) não faz parte deste checkpoint.

---

## A · Hoje

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| A1 | Abrir o app na aba **Hoje** | Data pequena no topo, saudação como maior texto da tela, fundo com a tonalidade fria |
| A2 | Olhar o primeiro bloco | Superfície **lavanda** "Próximo compromisso", com o horário grande e o marcador vertical ligando hora e título |
| A3 | Conferir o horário | É o seu próximo compromisso **de verdade**, e o "em N min" bate com o relógio |
| A4 | Olhar "Precisa de você" | Superfície **branca**, com atrasos/remarcações/delegações reais e a evidência embaixo ("3 dias de atraso") |
| A5 | Última linha de "Precisa de você" | "N tarefas sem data" **sem círculo de concluir** — o que falta nela é data, não empurrão |
| A6 | Rolar até o fim | A sugestão (se houver janela livre) é a **última** coisa da tela, nunca a primeira |
| A7 | Tocar em **Reservar** na sugestão | Abre o Copiloto com o rascunho. **Nada é gravado** |
| A8 | Tocar no círculo de uma linha do dia | A linha marca, esmaece e some. Recarregue: continua resolvida |
| A9 | Tocar numa linha | Abre o editor do produto, com a atividade certa |

## B · Agenda — Dia

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| B1 | Barra de baixo → **Agenda** | Título "Agenda", seletor **Dia · Semana · Mês** em lavanda, "Dia" escolhido |
| B2 | Olhar a linha do tempo | Os blocos pendem de um **fio** único; a hora fica à esquerda, fora do bloco |
| B3 | Conferir as cores | Cada bloco usa a cor **da categoria que você escolheu**, não uma paleta inventada |
| B4 | Procurar uma tarefa sem horário | Aparece em **"Sem horário"**, abaixo da régua — **nunca** dentro dela |
| B5 | Procurar uma atividade com hora que não é encontro | Vem com borda **tracejada** e cadeado: "Horário reservado" |
| B6 | Se houver dois compromissos sobrepostos | Aparece o aviso em âmbar "Dois compromissos se sobrepõem neste dia" |
| B7 | Setas ‹ › | Andam um dia. Longe de hoje, aparece o botão **Hoje** e ele devolve |
| B8 | Ícone de calendário à direita | Leva ao Mês |
| B9 | "Novo compromisso neste dia" | Abre o editor **já com a data** daquele dia |
| B10 | Um dia sem nada | "Nada marcado neste dia" — frase, não caixa de erro |

## C · Agenda — Semana  *(a parte mais nova; é aqui que eu mais preciso do seu olho)*

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| C1 | Tocar em **Semana** | Faixa com os **sete** dias em cima; grade temporal com **três** dias embaixo |
| C2 | **Ler um bloco sem tocar nele** | Você reconhece o compromisso. Se precisar aproximar o olho, **isto reprovou** |
| C3 | Olhar o horário dentro do bloco | `09:30–10:30` **inteiro**. Qualquer `09:30–10:…` reprova |
| C4 | Comparar um compromisso de 1h com um de 2h | O de 2h é visivelmente o dobro. Altura é duração |
| C5 | Dois compromissos sobrepostos | **Escalonam** (um recua e fica por cima), e os dois continuam legíveis. Não ficam espremidos pela metade |
| C6 | **Deslizar o dedo na horizontal** sobre a grade | Anda um dia. Testado no iPhone no UX-M3.1; aqui é a primeira vez com dado real |
| C7 | **Rolar a grade na vertical** | Rola normal. O deslize horizontal **não pode roubar** a rolagem |
| C8 | Deslizar e soltar sobre um bloco | **Não abre** o compromisso. Arrastar não é tocar |
| C9 | Botões ‹ Hoje › embaixo da grade | Fazem o mesmo que o deslize, sem depender do gesto |
| C10 | Tocar num dia **da faixa** | O recorte se reposiciona e aquele dia fica visível. Continua na Semana |
| C11 | Tocar **de novo** no mesmo dia da faixa | Aí sim abre o Dia |
| C12 | Setas ‹ › nas pontas da faixa | Trocam de semana |
| C13 | Chegar na ponta (segunda ou domingo) e continuar andando | A grade **atravessa** para a semana vizinha, em vez de travar |
| C14 | Girar o telefone / olhar nas bordas | A grade encosta nas duas bordas de propósito — é o que dá largura ao bloco |

## D · Agenda — Mês

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| D1 | Tocar em **Mês** | Calendário limpo, **sem títulos nas células**, com até três pontos coloridos por dia |
| D2 | Primeira coluna | **SEG** (ver "Diferenças" nº 2) |
| D3 | Hoje | Número em destaque, ou cheio quando hoje também é o dia escolhido |
| D4 | Tocar num dia | A agenda dele abre **abaixo** do calendário. O mês **continua à vista** |
| D5 | Tocar noutro dia | O painel troca; o calendário não se mexe |
| D6 | Setas ‹ › | Trocam de mês |

## E · Travessias e não-regressão

| # | O que fazer | O que precisa acontecer |
|---|---|---|
| E1 | Pegar um compromisso e procurá-lo em Dia, Semana e Mês | Está nos três. Nada some entre recortes |
| E2 | Procurar uma tarefa **sem data nenhuma** | **Não** aparece na Agenda, em recorte nenhum. O lugar dela é Tarefas |
| E3 | Abrir um compromisso e **editar** o título | Salva, e a Agenda mostra o novo título |
| E4 | Abrir e conferir o **alerta** e a **delegação** | Continuam no editor, como antes |
| E5 | Abrir e **excluir** uma atividade de teste | Exclui, e some dos três recortes |
| E6 | Tarefas → **Semana** (Kanban) | Arrastar um cartão com o dedo continua funcionando como em `5049a52` |
| E7 | Trocar o tema para escuro | As quatro telas continuam legíveis; nenhum bloco vira neon |
| E8 | Girar para paisagem e voltar | Nada estoura na horizontal |
| E9 | Abrir no desktop | A Agenda do desktop está **exatamente** como estava. Nada mudou lá |

## O que eu preciso ouvir de volta

1. **C2 e C3** — dá para reconhecer o compromisso antes de tocar, e o horário
   aparece inteiro? Era isto que tinha reprovado antes.
2. **C6, C7 e C8** — o deslize é confiável, ou ele briga com a rolagem?
3. **A2** — a superfície lavanda do próximo compromisso ficou como a referência,
   ou ficou pesada demais no aparelho?
4. Qualquer tela onde você sinta que "virou outro aplicativo".
