# ARCHITECTURE.md — Agenda Inteligente 360

> **Constituição técnica do projeto.** Este é um ADR (Architecture Decision
> Record) **congelado**. Toda implementação futura é obrigada a respeitá-lo.
> Nenhuma feature pode contrariar as decisões marcadas como **FROZEN**.
>
> **Status:** FASE DE ARQUITETURA ENCERRADA · **Congelado em:** 2026-07-27
> **Precede:** `VISION.md` (produto), `PRODUCTION.md` (operação),
> `RELEASE_CHECKLIST.md` (release).
>
> Derivado das análises **T1.3** e **T1.3.1**. A partir daqui: apenas
> implementação incremental — sem reabrir conceitos fundamentais.

---

## 0. Como ler e alterar este documento

- **FROZEN** = decisão congelada. Não se rediscute durante o desenvolvimento.
  Só muda por **RFC escrita** com justificativa técnica forte, aprovada
  explicitamente pelo dono do produto, registrada como um novo ADR que
  **supersede** o item.
- **OPEN** = deliberadamente em aberto; será decidido na fase que o exigir.
- **REVISITABLE** = congelado hoje, mas pode ser reavaliado se surgir
  evidência técnica concreta (não estética, não preferência).
- Cada decisão tem: **Decisão · Racional · Consequências · Status**.

Nenhuma implementação que contrarie um item **FROZEN** deve ser aceita em
revisão de código. Divergência = abrir RFC antes, nunca "resolver no PR".

---

## 1. Princípios diretores (a espinha)

1. **O domínio não muda quando um canal novo entra.** Canais entram como
   *adapters* na borda; o núcleo (Capture, Tasks) permanece intacto.
2. **Captura ≠ Ação.** Nada vira Task sem passar por captura + confirmação.
3. **A IA propõe; o usuário decide; só a conversão escreve.**
4. **Reuso sobre reescrita.** Consolidar conceitos reaproveitando o modelo
   físico existente (`inbox_items`, `tasks`), sem migração de dados.
5. **Evolução aditiva.** Preferir `ADD COLUMN`/nova tabela a renomear/mover.

---

## 2. Bounded Contexts oficiais

Cinco contextos independentes. Um contexto **não** conhece o schema interno
de outro; trocam DTOs.

| Contexto | Responsabilidade | Tabela(s) física(s) hoje |
|---|---|---|
| **Capture** | Centro universal de captura (qualquer canal) | `inbox_items`, `inbox_checklist_items`, `inbox_events` |
| **Tasks** | Domínio operacional (execução/agenda) | `tasks`, `reminders`, `delegations`, `activity_logs` |
| **Calendar** | Integração de calendário (canal + sink) | *(futuro)* |
| **Assistant** | Interpretação/raciocínio/IA (produz Suggestion) | `agent/*` (allowlist, interpret) |
| **Notification** | Saída: lembretes, push, outbox | `notifications`, `reminders` |

`Inbox` **não** é um contexto — é uma **VIEW** do contexto **Capture**.

---

## 3. Decisões congeladas (o núcleo do ADR)

### ADR-01 — Capture é o domínio; Inbox é uma view · **FROZEN**
- **Decisão:** "Capture" é o domínio conceitual do sistema. "Inbox" é apenas
  uma **projeção/visão** (filtro por status/canal) sobre Capture. A tabela
  física continua sendo `inbox_items`. **Não haverá migração/renome de dados.**
- **Racional:** `inbox_items` já é uma tabela de captura genérica; renomear o
  conceito (não os dados) entrega a consolidação sem retrabalho.
- **Consequências:** telas "Caixa de Entrada" são views; `inboxService` evolui
  para/é encapsulado por `captureService`. Evolução de schema é **aditiva**
  (ver ADR-16), o que **não** conflita com "sem migração de dados": não há
  backfill destrutivo nem renome de tabela.

### ADR-02 — Tasks é o domínio operacional; sem domínio "Activity" · **FROZEN**
- **Decisão:** toda evolução operacional acontece sobre `tasks`. **Não** será
  criado um domínio/tabela `activities`.
- **Racional:** decidido e validado em T1.1; `tasks` já carrega origem,
  status, datas opcionais, delegação.
- **Consequências:** novos "tipos executáveis" evoluem `tasks` ou entram como
  **outros Artifacts** (Event/Note/Project), nunca como um "Activity" paralelo.

### ADR-03 — Capture e Tasks 100% desacoplados via conversionService · **FROZEN**
- **Decisão:** `captureService`/`inboxService` e `taskService` **nunca** se
  importam. Toda comunicação entre os dois passa pelo **composition root**
  `conversionService`.
- **Racional:** baixo acoplamento comprovado (T1.2B/T1.2C).
- **Consequências:** `conversionService` é o **único** ponto de escrita
  cruzada (Artifact + proveniência) e o único lugar que conhece os dois lados.

### ADR-04 — Pipeline obrigatório de captura · **FROZEN**
- **Decisão:** toda captura passa, sem exceção, por:
  `Capture → Normalization → Interpretation → Reasoning → Suggestion →
  Confirmation → Conversion → Artifact`. **Nenhum canal cria Task diretamente.**
- **Racional:** auditabilidade, reversibilidade, offline, e um único ponto de
  regra por estágio.
- **Consequências:** um canal server-side (e-mail) que "só quer criar tarefa"
  ainda cria uma Capture primeiro. Estágios antes de Confirmation são **puros**
  (não escrevem no domínio).

### ADR-05 — Suggestion é polimórfica; não é uma Task · **FROZEN** 🔒 (crítico)
- **Decisão:** `Suggestion` representa uma **proposta**, não uma Task. É
  **polimórfica**: `suggestedType ∈ {task, event, project, note, checklist,
  document, …}` + `payload` tipado por tipo. `conversionService` despacha por
  tipo.
- **Racional:** modelar Suggestion como proto-Task é o maior risco de
  refatoração futura (identificado em T1.3.1). Quando a IA sugerir um Evento,
  o núcleo não pode quebrar.
- **Consequências:** `TaskModal` é a **tela de confirmação do tipo `task`**;
  outros tipos terão suas próprias confirmações no futuro, todas consumindo o
  mesmo envelope de Suggestion.

### ADR-06 — A IA nunca escreve no domínio · **FROZEN**
- **Decisão:** a IA/Assistant produz **apenas** `Suggestion`. Toda escrita
  depende de **confirmação do usuário** (política já existente em `agent/tools.js`).
- **Racional:** segurança, confiança, reversibilidade.
- **Consequências:** não há "IA executando ação" sem confirmação; ações de IA
  sempre `requiredConfirmation`.

### ADR-07 — Conceitos obrigatórios de Capture · **FROZEN** (schema OPEN)
- **Decisão:** o domínio Capture **possui como conceitos obrigatórios**:
  `raw` (imutável), `normalized`, `sourceRef` (idempotência por canal),
  `processingStatus` (máquina de estados), `attachments`, `metadata` — mesmo
  que ainda não implementados fisicamente.
- **Racional:** `raw` imutável + `sourceRef` são não-negociáveis para
  auditoria e deduplicação (T1.3.1); precisam nascer com o modelo.
- **Consequências:** `raw` **nunca** é sobrescrito; `normalized` é derivado;
  o **schema exato** dessas colunas é **OPEN** (ADR-16) e será definido na
  Fase 1 via migração aditiva.

### ADR-08 — Interpretation e Reasoning são estágios independentes · **FROZEN**
- **Decisão:** Interpretation (extração de fatos/entidades) e Reasoning
  (decisão de tipo/categoria/prioridade/split) são **estágios distintos do
  contrato**, mesmo que um único provider os execute numa só chamada.
- **Racional:** testabilidade e troca de política sem mexer na extração.
- **Consequências:** desenhar a costura; **não** obrigar dois round-trips.

### ADR-09 — Confidence é conceito de primeira classe · **FROZEN**
- **Decisão:** `Suggestion` carrega um **envelope de confiança** obrigatório:
  `confidence`, `reason`, `warnings[]`, `missingInformation[]`,
  `requiredConfirmation`.
- **Racional:** o usuário precisa saber **por que** a IA sugeriu; habilita UX
  graduada.
- **Consequências:** toda Suggestion — de qualquer tipo — inclui o envelope.

### ADR-10 — Ports & Adapters é o padrão oficial · **FROZEN**
- **Decisão:** novos canais entram **somente** como *adapters* na borda,
  produzindo o DTO canônico de Capture. Interpretação e Storage também são
  **ports** com implementações intercambiáveis (determinística/LLM;
  local/Storage).
- **Consequências:** adicionar canal = adicionar adapter. **Nunca** alterar o
  domínio para acomodar um canal.

### ADR-11 — Pipeline Processing é o padrão oficial da captura · **FROZEN**
- **Decisão:** a captura é modelada como um pipeline de **estágios
  componíveis** (funções puras até Confirmation), não como serviços/deployables
  separados.
- **Consequências:** estágios podem rodar client-side ou em Edge/worker
  (assíncrono) sem mudar o contrato.

### ADR-12 — Bounded Contexts oficiais · **FROZEN**
- **Decisão:** Capture, Tasks, Calendar, Assistant, Notification — cada um
  independente (ver §2).
- **Consequências:** dependências apontam **para dentro** (adapter →
  application → domínio); nenhum contexto conhece o schema interno de outro.

### ADR-13 — CQRS rejeitado · **FROZEN**
- **Decisão:** CQRS não será adotado.
- **Racional:** não há assimetria leitura/escrita que o justifique;
  complexidade desnecessária nesta escala.

### ADR-14 — Event Sourcing completo rejeitado; event-log parcial permitido · **FROZEN**
- **Decisão:** sem ES completo. Usa-se **event-log parcial** onde agrega valor
  — hoje já existe (`inbox_events`, append-only) para timeline/derivações.
- **Consequências:** o estado atual é a fonte de verdade; o log serve auditoria
  e proveniência, não reconstrução total de estado.

### ADR-15 — Integrações futuras entram só como adapters · **FROZEN**
- **Decisão:** Google Calendar, WhatsApp, E-mail, API, OCR, PDF, Foto, Voz,
  Push etc. **apenas adicionam adapters**; nunca alteram o núcleo do domínio.
- **Consequências:** se uma integração exigir mudar Tasks/Capture, é sinal de
  fronteira errada — abrir RFC antes de codar.

### ADR-16 — Evolução de schema é aditiva; proveniência genérica é o alvo · **FROZEN (princípio) / OPEN (forma)**
- **Decisão (princípio, FROZEN):** evolução de dados é **aditiva** (`ADD
  COLUMN`, nova tabela, backfill não-destrutivo) — sem renome/migração
  destrutiva. O **modelo mental de proveniência** é uma **aresta direcional
  genérica** `capture → artifact{type,id}`; `inbox_task_links` é seu primeiro
  caso especial.
- **Decisão (forma, OPEN):** a tabela genérica `derivations` só será
  introduzida quando surgir o **2º tipo de Artifact** (previsivelmente Event,
  na fase Calendar). Até lá, `inbox_task_links` permanece.

---

## 4. Glossário canônico (vocabulário obrigatório)

- **Capture** — objeto canônico produzido por **qualquer** canal. Campos
  conceituais: `id, workspaceId, createdBy, createdAt, channel, sourceRef,
  raw(imutável), normalized, attachments[], metadata, processingStatus, type?`.
- **Channel** — origem da captura (`text, assistant, voice, photo, ocr, pdf,
  email, whatsapp, google_calendar, api, share`).
- **Normalization** — estágio que converte `raw` heterogêneo em `normalized`
  canônico (OCR/transcrição vivem aqui).
- **Interpretation** — extração de fatos/entidades a partir de `normalized`.
- **Reasoning** — decisão de organização (tipo/categoria/prioridade/split).
- **Suggestion** — proposta **polimórfica** + envelope de confiança. Não é Task.
- **Confirmation** — ponto onde o usuário aprova (reusa `TaskModal` para o
  tipo `task`).
- **Conversion** — `conversionService`; único ponto de escrita cruzada;
  despacha por `suggestedType`.
- **Artifact** — resultado confirmado (Task hoje; Event/Note/Project/… no
  futuro).
- **Derivation/Proveniência** — aresta `capture → artifact` (`inbox_task_links`
  é o primeiro caso).

**processingStatus** (máquina de estados; transições exatas OPEN):
`captured → normalizing → interpreting → suggested → confirmed → converted`
(+ ramos `failed`, `discarded`).

---

## 5. O que está congelado vs. o que evolui

### 🔒 Congelado — NÃO reabrir durante o desenvolvimento
- Capture como domínio / Inbox como view / `inbox_items` como tabela (ADR-01).
- Tasks como domínio operacional, sem "Activity" (ADR-02).
- Desacoplamento Capture↔Tasks via `conversionService` (ADR-03).
- Pipeline obrigatório; nenhum canal cria Task direto (ADR-04).
- **Suggestion polimórfica, não é Task (ADR-05).**
- IA nunca escreve; só Suggestion + confirmação (ADR-06).
- Conceitos obrigatórios de Capture: `raw`/`normalized`/`sourceRef`/
  `processingStatus`/`attachments`/`metadata` (ADR-07).
- Interpretation e Reasoning como estágios (ADR-08).
- Envelope de confiança em toda Suggestion (ADR-09).
- Ports & Adapters (ADR-10) · Pipeline Processing (ADR-11).
- Os 5 Bounded Contexts (ADR-12).
- CQRS rejeitado (ADR-13) · ES completo rejeitado (ADR-14).
- Integrações só como adapters (ADR-15).
- Evolução aditiva; proveniência genérica como alvo mental (ADR-16, princípio).

### 🔄 Aberto — decidir na fase que exigir (OPEN)
- **Schema físico exato** das colunas de enriquecimento de `inbox_items`
  (nomes/tipos/índices) — Fase 1.
- **Transições exatas** da máquina de estados `processingStatus`.
- **Forma física** da proveniência genérica (`derivations`) — só no 2º Artifact.
- **Provider de LLM** e formato do prompt/So — Fase 3.
- **Layout de buckets/Storage** e RLS de anexos — Fase 4.
- **Atomicidade transacional** (RPC/Edge) — quando escrita server-side crescer.
- **Concorrência otimista** (`row_version`) — quando multi-canal/multi-device
  ativo justificar.
- **Retenção/privacidade** (GDPR-like) por canal — antes de e-mail/foto reais.

### ⚖️ Revisitável — só com justificativa técnica forte (REVISITABLE)
- Rejeição de CQRS/ES completo (ADR-13/14): reabrir apenas se surgir escala
  real que os justifique — não por preferência.
- Manter `inbox_task_links` até o 2º Artifact (ADR-16, forma).
- Reuso de `TaskModal` como confirmação do tipo `task`.

---

## 6. Governança

- Este documento é **referência obrigatória** em toda revisão de código.
- Contrariar um item **FROZEN** exige **RFC + aprovação explícita** do dono do
  produto + novo ADR que supersede o item (com data). Sem isso, o PR é rejeitado.
- Itens **OPEN** são decididos na fase correspondente e **registrados aqui**.
- **Ordem de trabalho oficial:** primeiro **Fase 0 (deploy correto do que já
  existe)**, depois Fase 1. Arquitetura excelente com produto não publicado é
  o único risco que importa hoje.

---

## 7. Roadmap de implementação (referência; detalhe em cada fase)

- **Fase 0** — Publicar T1.2 corretamente (deploy/branch/cache). Pré-requisito.
- **Fase 1** — `captureService` (funil único) + enriquecer `inbox_items`
  (aditivo); Inbox vira view; comportamento inalterado.
- **Fase 2** — `Suggestion` polimórfica + envelope de confiança; conversão
  despacha por tipo; interpretação determinística (agent atual) no fluxo.
- **Fase 3** — Interpretation/Reasoning via LLM em Edge (mesmo port).
- **Fase 4** — Storage + Normalization assíncrona → Foto/OCR/PDF/Voz.
- **Fase 5** — Canais de entrada (share-target, e-mail, WhatsApp) como adapters;
  idempotência por `sourceRef`.
- **Fase 6** — Google Calendar (2 vias) com anti-loop; 2º Artifact → introduzir
  `derivations`.
- **Fase 7** — Endurecimento: RPC transacional, concorrência, retenção/privacidade.

---

_Fim do ADR. Fase de arquitetura encerrada. A partir da aprovação: apenas
implementação incremental que respeite integralmente este documento._
