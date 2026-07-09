# 🏛️ Arquitetura do banco — Agenda Inteligente 360

Documento de decisões arquiteturais do banco (PostgreSQL/Supabase). O objetivo é
sustentar **milhares de usuários** e **anos de evolução** sem remodelagem.

---

## 1. De single-tenant para multi-tenant por workspace

**Antes:** cada registro estava preso a um `user_id`. Toda funcionalidade nova
(times, compartilhamento, múltiplos espaços) exigiria migração pesada.

**Agora:** o **workspace** é o tenant. Toda tabela de dados tem `workspace_id`, e
usuários se relacionam com workspaces via `workspace_members` (N:N com papel).

```
auth.users ─1:1─ profiles ─1:N─ workspaces (dono)
profiles ─N:N (workspace_members)─ workspaces
workspace ─1:N─ { categories, tasks, links, reminders,
                  activity_logs, delegations, ai_*, integrations, notifications }
```

**No cadastro** (trigger `handle_new_user`): cria o `profile` → cria o workspace
**"Pessoal"** → insere o usuário como **owner** → semeia as 10 categorias. O
primeiro usuário do sistema também vira **admin de plataforma**.

**Por que melhora:** a mesma modelagem serve para 1 pessoa ou uma equipe. Criar
"Carmais", "Família", "Igreja" é **inserir linhas**, não alterar schema.

---

## 2. Segurança (RLS) por pertencimento

As políticas usam funções `SECURITY DEFINER` marcadas `STABLE`:

- `is_workspace_member(ws)` — o usuário pertence ao workspace?
- `is_workspace_admin(ws)` — é owner/admin do workspace?
- `shares_workspace(other)` — compartilha algum workspace com outro usuário?

**Por que assim:**

1. **Evita recursão.** Uma policy de `workspace_members` que consultasse a
   própria `workspace_members` entraria em loop. Como a função é `DEFINER`, ela
   ignora RLS ao checar o pertencimento — sem recursão.
2. **Performance.** `STABLE` + `(select auth.uid())` permitem que o planner
   avalie uma vez por statement (initplan), em vez de por linha. Com o índice
   único `(workspace_id, user_id)`, a checagem é um `EXISTS` indexado.
3. **Menos duplicação.** As 10 tabelas de dados recebem a mesma policy
   ("membro do workspace") gerada por um bloco `DO`, garantindo consistência.

Resultado: **cada usuário só enxerga os workspaces dos quais participa** e os
dados desses workspaces. A base para papéis (admin/gestor/colaborador/viewer) já
está pronta — refinar por cargo é adicionar policies, não migrar dados.

---

## 3. Delegação: estado denormalizado + histórico imutável

**Decisão: híbrida (as duas coisas).**

- **Estado atual na `tasks`**: `assignee_id`, `delegated_by`, `delegated_at`.
- **Histórico na `delegations`**: um registro append-only por delegação.

**Justificativa técnica:**

- Consultas quentes como *"minhas tarefas"* (`where assignee_id = me`) precisam
  ser rápidas e **indexáveis** — colocar o responsável na própria task evita um
  JOIN e permite índice parcial (`idx_tasks_assignee`).
- Mas *"quem delegou o quê, quando e para quem"* é **auditoria** — pertence a um
  log imutável, não ao estado corrente.
- É o padrão **current-state na entidade + event-log à parte**: leituras
  rápidas sem perder rastreabilidade. Usar só a tabela de histórico obrigaria a
  reconstruir o estado atual a cada leitura (lento e frágil).

---

## 4. Auditoria da estrutura (o que foi corrigido/endurecido)

| Item | Ação |
| --- | --- |
| **Tipos** | `date`/`time`/`timestamptz` corretos; `jsonb` para `meta`/`config`/`payload`/`context`; enums para todos os domínios fechados. |
| **FKs** | `on delete cascade` no que é filho do tenant (dados morrem com o workspace); `on delete set null` no que é referência opcional (categoria, autor, task de um link/log). |
| **FK circular** | `profiles.default_workspace_id ⇄ workspaces` resolvida com `ALTER` após criar `workspaces` (coluna nula na criação do profile). |
| **Índices** | Compostos para filtros reais (`workspace_id,date` / `workspace_id,status`); parciais (`assignee_id not null`, `sent=false`, `status='pending'`); **BRIN** em `activity_logs(created_at)` para tabela append-only por tempo. |
| **Unicidade** | `workspace_members(workspace_id,user_id)`, `categories(workspace_id, lower(name))`, `workspaces.slug`. |
| **Triggers** | `updated_at` automático em profiles/workspaces/tasks/ai_conversations/integrations; `handle_new_user` com `search_path` fixo. |
| **Bug corrigido** | log de exclusão de task agora grava `task_id = null` (antes referenciava uma linha já apagada → violaria a FK no Postgres). |
| **Grants** | `authenticated` recebe DML; RLS continua sendo a barreira por linha; `anon` não acessa dados. |

---

## 5. Preparado para IA (sem uso ainda)

Três tabelas **isoladas** — nenhuma coluna de IA polui `tasks`:

- `ai_conversations` — thread por workspace/usuário, com `context jsonb`.
- `ai_messages` — mensagens (`system/user/assistant/tool`), tokens, metadata.
- `ai_actions` — **decisões propostas pela IA**, com `payload jsonb`, `status`
  (proposed/applied/dismissed) e `task_id` opcional (liga a decisão à atividade
  gerada).

Assim dá para registrar **conversas, prompts, decisões, histórico e contexto**
sem tocar nas tabelas principais.

---

## 6. Preparado para automações (sem uso ainda)

- `integrations` — conta externa conectada por workspace
  (`google_calendar`/`whatsapp`/`email`/`push`/`webhook`), com `config jsonb`.
- `notifications` — **outbox** de entregas (fila confiável): `channel`, `status`
  (pending→processing→sent/failed), `scheduled_for`, `attempts`, `last_error`.
  Uma Edge Function agendada pode varrer os pendentes e disparar.

O padrão **outbox** garante entregas assíncronas confiáveis e reprocessáveis —
essencial para Google Calendar, WhatsApp, e-mail e push no futuro.

---

## 7. Por que isso escala

- **Isolamento por tenant** com índices compostos por `workspace_id` mantém as
  consultas rápidas mesmo com milhões de linhas (o volume por workspace é o que
  importa nas queries do dia a dia).
- **RLS por função DEFINER + índice** é O(log n) por checagem, não O(n).
- **Append-only + BRIN** em logs suporta crescimento grande a custo baixo; se um
  dia necessário, `activity_logs`/`notifications` são candidatas naturais a
  **particionamento por tempo** — sem mudar a aplicação.
- **Extensões isoladas** (IA, automações) evitam “inchar” as tabelas quentes.
- **Papéis por workspace** permitem abrir para times e permissões finas apenas
  adicionando policies.

**Problemas futuros evitados:** remodelar para multi-usuário; migrar dados para
introduzir times; recursão/lentidão de RLS; perda de histórico de delegação;
acoplar IA/integrações às tabelas centrais; e reescrever a aplicação a cada novo
recurso de colaboração.
