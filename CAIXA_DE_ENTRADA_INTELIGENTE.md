# 📥 Caixa de Entrada Inteligente — Especificação de Produto (revisada)

> Documento de produto (alto nível) do módulo que materializa os pilares
> **Capturar** e **Organizar** da Agenda360. Alinhado ao `VISION.md`.
> Incorpora as decisões de julho/2026. **A arquitetura técnica já aprovada
> permanece inalterada** — este documento adiciona a camada de produto e
> referencia o plano técnico (modelo de dados, RLS, Storage, Edge Functions,
> providers, testes) sem reescrevê-lo.
>
> Escopo desta revisão: **documentação**. Nada de código, SQL, migrations ou
> componentes.

---

## 1. Posicionamento

A Caixa de Entrada Inteligente é a **porta de entrada oficial** da Agenda360 e a
sucessora definitiva do antigo "Bloco de Notas". **Tudo chega primeiro nela** e
depois segue seu fluxo. Ela não é um bloco de notas comum: é o ponto onde a
promessa de "segundo cérebro" começa — captura sem atrito, decisão depois,
execução no tempo certo, evolução por padrões.

Ela conecta os quatro pilares:
- **Capturar** → o item nasce aqui.
- **Organizar** → o usuário (com sugestão da IA) decide o destino.
- **Executar** → conversão alimenta Hoje/Agenda/Calendário/Kanban/Alertas.
- **Evoluir** → origem, estados e histórico viram matéria-prima de Insights e da
  Revisão Semanal.

## 2. Princípios do módulo

1. **Velocidade de captura é o objetivo nº 1.** Nenhum campo obrigatório além do
   conteúdo. Sem data, sem prioridade, sem organização forçada.
2. **Capturar ≠ organizar.** A organização é um segundo momento, opcional.
3. **A IA sugere, o usuário decide.** Nunca salvar/converter automaticamente.
4. **Nada se perde.** Toda captura tem **origem**, **estado de processamento** e
   **timeline**. Converter/arquivar/delegar preserva o rastro.
5. **Privacidade por padrão.** Imagem bruta não retida por padrão; arquivos
   privados; chaves só no servidor.
6. **Reuso, não duplicação.** Categorias, workspaces, tasks e padrões de RLS já
   existentes são reaproveitados.

## 3. Tipos de captura

Texto simples (o mais usado) · Checklist (itens marcáveis) · Foto · PDF · Link ·
**Áudio (futuro)**. Além de entradas por **compartilhamento**, **IA** e
**integrações** futuras. Nada exige data, prioridade ou organização imediata.

## 4. Origem (proveniência)

Toda captura registra **de onde veio** — usado futuramente para estatísticas e
IA:

`manual` · `checklist` · `foto` · `pdf` · `áudio` · `assistente` ·
`compartilhado` · `integração` · `importado` · `convertido de atividade`.

> Decisão de hoje: a lista de origens foi **ampliada** (inclui `importado` e
> `convertido de atividade`) em relação ao rascunho anterior. Tecnicamente,
> continua sendo o campo de origem já previsto no modelo (enum extensível), sem
> mudar a arquitetura.

## 5. Estado de processamento (ciclo de vida)

Cada captura carrega um **estado de processamento**, e o **histórico preserva
todo o fluxo**:

`Novo` → `Precisa decidir` → `Em processamento` → `Processado` → `Arquivado` /
`Convertido em atividade`.

- **Novo:** acabou de entrar.
- **Precisa decidir:** aguarda o usuário escolher destino.
- **Em processamento:** há análise em andamento (ex.: OCR/visão de uma foto).
- **Processado:** análise concluída, pronto para decisão/uso.
- **Arquivado / Convertido:** destinos finais (com rastro preservado).

> Relação com o modelo técnico: este "estado de processamento" é a leitura de
> **produto** sobre os campos de status/estado já previstos (status do item +
> metadados de processamento). Não introduz novas tabelas além das já
> planejadas.

## 6. Visto (controle visual)

"Visto" é **apenas visual, sem notificações**. Alimenta a visão **Não vistas**.
É **por usuário** (importante quando houver compartilhamento), conforme já
previsto no plano técnico.

## 7. Visões

Caixa de Entrada · **Não vistas** · **Fixadas** · **Compartilhadas comigo** ·
**Delegadas** · **Para pensar** · **Arquivadas** · **Convertidas em atividades**
· **Atividades em andamento originadas de notas** · **Atividades concluídas
originadas de notas**.

As três últimas derivam do vínculo nota↔tarefa cruzando o status da atividade.

## 8. "Para pensar" — o incubador

**Não é arquivo morto. É um incubador de ideias**: projetos, negócios, viagens,
investimentos, melhorias e sonhos. Mover para lá **não cria tarefa nem data**.

**Identidade visual própria e distinta da Caixa de Entrada** — deve transmitir
**criatividade e possibilidade** (não a estética "lista de pendências"). É um
lugar para o pensamento respirar. A diferenciação é de UX/visual; o modelo de
dados é o mesmo item de captura em outro estado.

## 9. Categorias

Reutilizam **integralmente** as categorias já existentes da Agenda360. **Não há
segundo sistema de categorias.**

## 10. Destino Inteligente (IA que sugere, nunca decide)

Quando a IA analisa uma captura (foto, PDF, áudio ou texto), ela **nunca salva
automaticamente**. Ela apresenta uma sugestão de destino, por exemplo:

> "Percebi que isso parece:
> ○ Nota ○ Checklist ○ Compromisso ○ Ideia ○ Projeto
> Onde deseja salvar?"

A decisão é **sempre** do usuário. Isso vale para toda entrada analisada por IA.

## 11. Conversão em atividade

Ao transformar uma nota em atividade, abre-se uma **prévia** pedindo: data,
horário, prioridade, responsável, lembrete e categoria. Após confirmar:
- cria a atividade;
- retira a nota da Caixa de Entrada;
- **preserva a nota no histórico** (estado "convertido");
- **mantém nota e atividade vinculadas**;
- acompanha o status da atividade;
- alimenta o **resumo**: convertidas · em andamento · concluídas · canceladas.

## 12. Compartilhamento e delegação

Notas escopadas por **workspace**. Suporte a: **privada**, **compartilhada no
workspace**, **atribuída a um responsável**, com **histórico de alterações** e
visibilidade de **quem criou / quem é responsável**. RLS por workspace e
identidade por `auth.uid()` conforme o plano técnico aprovado.

## 13. Captura por foto — **compreensão, não OCR puro**

Fluxo:

```
Imagem → OCR/Visão → Entendimento por IA → Prévia editável
       → Sugestão de destino → Confirmação → Salvar
```

- **Queremos compreensão do conteúdo**, não apenas extração de texto: a IA
  interpreta se aquilo parece nota, checklist, compromisso, ideia ou projeto.
- **Prévia editável** antes de qualquer gravação.
- **Salvar só após confirmação.**
- Processamento no servidor (Edge Function), com **provider mock** para
  desenvolvimento; providers de visão avaliados conforme o plano técnico.

## 14. Captura Universal (visão futura)

Rumo a **uma única tela** capaz de receber: texto, colar conteúdo, imagem, foto,
PDF, áudio, links e compartilhamentos. Será **o principal ponto de entrada do
sistema**. Previsto na arquitetura; construído de forma incremental.

## 15. Timeline / Histórico

Toda captura tem histórico e **nunca perde contexto**:
`Criada · Editada · Compartilhada · Delegada · Movida para "Para pensar" ·
Convertida em atividade · Concluída · Arquivada`. Registrado de forma
append-only, conforme o padrão de histórico já aprovado.

## 16. Privacidade

- Por padrão, **a imagem original não é armazenada permanentemente** — guarda-se
  **somente a transcrição estruturada**.
- O usuário pode **optar por manter o anexo**.
- **Nunca** armazenar imagem sensível sem confirmação.
- **Nunca** enviar chaves de IA ao frontend; **nunca** registrar imagem bruta em
  logs.
- Exclusão definitiva do anexo é possível e explícita.
- Aviso ao usuário para evitar dados sensíveis/clínicos identificáveis.

## 17. Revisão Semanal (prevista, não implementada agora)

Rotina em que a IA **sugere** (nunca executa): notas esquecidas, ideias antigas,
itens em "Para pensar", notas nunca processadas. Fica **prevista na arquitetura**
(origem + estado + timeline dão a base). Construída num épico posterior de
**Evoluir**.

## 18. Integração com o Assistente (prevista)

O Assistente deverá, no futuro, entender comandos como: "Salve isso como nota",
"Mande para Para pensar", "Transforme essa nota em atividade", "Mostre minhas
notas não vistas", "Quais notas viraram tarefas?", "Compartilhe essa nota com
Rafael". As ferramentas correspondentes são **apenas definidas** no Tool Registry
(allowlist), sem implementação nesta fase, mantendo a política de confirmação por
origem.

## 19. Experiência mobile

Captura **extremamente rápida** no celular: botão flutuante com Texto ·
Checklist · Tirar foto · Escolher arquivo · Link (Áudio futuro). A Caixa de
Entrada deve funcionar muito bem como **PWA no iPhone**.

## 20. Camada técnica (referência — inalterada)

O plano técnico já aprovado permanece a fonte de verdade para: modelo de dados
(itens, checklist, anexos, vínculos nota↔tarefa, leituras "visto" por usuário,
eventos de histórico), **RLS por workspace** com helper de acesso, **Storage
privado** com URLs assinadas e não-retenção por padrão, **Edge Functions**
(visão/PDF) com chaves só no servidor, **providers** (mock + visão), **variáveis
de ambiente** server-side, **estratégia de segurança e testes**. Este documento
**não altera** nada disso — apenas fixa as decisões de produto acima.

## 21. Milestones (mantidos)

- **A — Fundação:** banco + RLS + services + **texto** + **checklist** + Caixa de
  Entrada + **Para pensar** (com identidade visual própria) + "visto/não visto" +
  fixar + arquivar + timeline básica + estados de processamento.
- **B — Fluxo:** conversão em atividade + resumo sintético + compartilhamento +
  delegação + histórico completo.
- **C — Foto:** Storage + upload/compressão + Edge de visão (mock→provider) +
  **compreensão** + prévia editável + Destino Inteligente + confirmação +
  retenção opt-in.
- **D — Expansão:** PDF + integração com o Assistente (ferramentas ativas) +
  preparação para áudio + base para a Revisão Semanal.

*Não implementar tudo de uma vez. Cada milestone entra pequeno, estável e
testado.*

## 22. Fora do escopo inicial

Áudio; PDF real (planejado no D); execução dos comandos do Assistente (só
definição); compartilhamento granular pessoa-a-pessoa além de
visibilidade+responsável; busca full-text avançada; Revisão Semanal (prevista);
Captura Universal como tela única (evolução incremental); OCR sem confirmação;
retenção permanente por padrão.

---

*Alinhado ao `VISION.md`. Em conflito de decisão, a visão prevalece.*
