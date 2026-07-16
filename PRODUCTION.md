# PRODUCTION.md — Agenda360

> Documento operacional de **produção**. Descreve o ambiente publicado, a ordem
> oficial das migrations, como aplicá-las com segurança e como diagnosticar os
> erros mais comuns. Complementa o `VISION.md` (produto) e o `RELEASE_CHECKLIST.md`
> (passo a passo de release).
>
> Última atualização: checkpoint **Inbox operacional em produção** (julho/2026).

---

## 1. Arquitetura resumida de produção

```
Navegador (PWA)
  │  React 18 + Vite 5 + Tailwind 3 (build estatico)
  │  Camada de sync otimista no cliente (src/lib/sync/*)
  ▼
Vercel  ──────────────►  Hospeda o frontend estatico (SPA/PWA)
  │  chamadas HTTPS (supabase-js)
  ▼
Supabase (projeto agenda-inteligente-360)
  ├─ PostgREST  (REST /rest/v1/*)  ← RLS por workspace
  ├─ GoTrue     (Auth por e-mail/senha)
  └─ Postgres   (schema public, RLS habilitada em todas as tabelas)
```

- **Sem backend proprio**: o frontend fala direto com o Supabase; a segurança é
  garantida por **RLS** (pertencimento ao workspace) + identidade `auth.uid()`.
- **Fallback demo**: sem `VITE_SUPABASE_URL`/`ANON_KEY`, o app roda em **modo
  demo** (localStorage). Em produção isso **não** deve acontecer.
- **Chaves de IA**: nunca no frontend. Ficam em Edge Functions/secrets (ainda
  não usadas em produção).

## 2. Endereços oficiais

| Item | Valor |
|---|---|
| **Frontend (Vercel)** | `<PREENCHER: URL de produção da Vercel, ex.: https://agenda360.vercel.app>` |
| **Projeto Supabase** | `agenda-inteligente-360` |
| **Supabase URL** | `https://rsqepikxfghylincnnbh.supabase.co` |
| **Banco** | Postgres principal de produção do projeto acima |

## 3. Variáveis de ambiente obrigatórias (Vercel)

Definidas em **Vercel → Project → Settings → Environment Variables** (escopo
**Production**). São embutidas no build (`import.meta.env`), então **exigem novo
build/deploy** ao mudar.

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | `https://rsqepikxfghylincnnbh.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Chave **anon/publishable** do projeto (Supabase → Settings → API) |

> `VITE_AI_PROVIDER` / `VITE_AI_API_KEY` existem no `.env.example` por herança e
> **não são lidos** pelo frontend — **não** configure chave de IA na Vercel.

## 4. Ordem oficial das migrations

Aplicar **sempre nesta ordem**, uma por vez, no **SQL Editor** do Supabase:

| # | Migration | O que faz | Status em produção |
|---|---|---|---|
| 0002 | `identity_hardening` | DEFAULT `auth.uid()` + policies por-comando | ✅ aplicada |
| 0003 | `inbox_a1` | cria `inbox_items` (nota de texto) + RLS | ✅ aplicada |
| 0004 | `inbox_title_updatedby` | add `title`, `updated_by` | ✅ aplicada |
| 0005 | `inbox_a21` | add `type/status/seen`, remove `archived`, cria `inbox_checklist_items` | ✅ aplicada |
| 0006 | `inbox_a22` | add `origin`, cria `inbox_events` (timeline) | ✅ aplicada |

> **Não reexecutar nem modificar** essas migrations. Todas são **idempotentes**
> (`if not exists` / `drop policy if exists` / `add column if not exists`), mas o
> registro acima é a fonte de verdade do que já está em produção.

## 5. Como aplicar uma migration (padrão do projeto)

Cada migration tem 4 arquivos: `.precheck.sql`, `.sql`, `.verify.sql`,
`.rollback.sql`. Para cada uma:

1. **Supabase → SQL Editor → New query.**
2. **Precheck**: cole o conteúdo de `NNNN_*.precheck.sql`, **Run**. Confere
   pré-requisitos e que a mudança ainda não existe. **Só é leitura.**
3. **Migration**: nova query, cole `NNNN_*.sql`, **Run**. Aplica a mudança
   (dentro de `begin;`/`commit;`).
4. **Verify**: nova query, cole `NNNN_*.verify.sql`, **Run**. Confirma tabelas/
   colunas/RLS/policies/índices/triggers.
5. Só então passe para a **próxima** migration.

**Regras:** nunca rodar tudo de uma vez; nunca juntar migrations num bloco; uma
por vez; validar antes de avançar; parar imediatamente em qualquer erro.

## 6. Rollback (só em caso de falha real)

Cada migration tem `NNNN_*.rollback.sql`. Use **apenas** se uma aplicação falhar
ou precisar ser revertida. Reverta na **ordem inversa** (0006 → 0005 → 0004 →
0003). ⚠️ Rollbacks que removem colunas/tabelas **apagam dados** daquele recurso
(ex.: rollback do 0005 remove `inbox_checklist_items`). Não execute rollback por
precaução — só diante de falha comprovada.

## 7. Checklist antes/depois do deploy

Ver **`RELEASE_CHECKLIST.md`** (passo a passo objetivo). Regra de ouro:
**migration de produção é aplicada ANTES (ou no mesmo momento) do deploy do
frontend que depende dela** — nunca depois.

## 8. Erros comuns e diagnóstico

### Caso real — `Could not find the table 'public.inbox_items' in the schema cache`
- **Sintoma:** a Caixa de Entrada abre, mas mostra "Não foi possível carregar…";
  no Console, `GET /rest/v1/inbox_items…` retorna **404** com essa mensagem.
- **Causa:** o **frontend novo foi publicado antes de aplicar a migration** —
  a tabela não existe no banco / não está no schema cache do PostgREST.
- **Correção:** aplicar as migrations pendentes (§4–§5). Após o DDL, o PostgREST
  do Supabase recarrega o schema cache automaticamente; se persistir por alguns
  segundos, force com `notify pgrst, 'reload schema';` (SQL Editor) ou
  **Settings → API → Reload schema**.
- **Prevenção:** ver §Regra de ouro (§7).

### Outros
| Erro | Causa provável | Ação |
|---|---|---|
| `401 Invalid API key` no login | `VITE_SUPABASE_ANON_KEY` errada/desatualizada na Vercel | corrigir env + **rebuild** |
| App entra em "modo demo" em produção | envs ausentes no build | conferir envs (Production) + rebuild |
| `new row violates row-level security` | insert com `created_by ≠ auth.uid()` | usar a sessão do próprio usuário |
| `403/permission denied` numa tabela | RLS/policy ausente para aquela operação | rodar o `verify` da migration correspondente |

## 9. Orientação essencial (nunca esquecer)

> **Nunca publique um frontend que dependa de um schema ainda não aplicado.**
> A ordem segura é: (1) aplicar migration em produção → (2) verificar (`verify`)
> → (3) publicar o frontend que usa o novo schema. Isso evita exatamente o 404
> "schema cache" documentado acima.

## 10. Verificação de schema (read-only)

Para conferir o estado do banco a qualquer momento **sem alterá-lo**, rode
`supabase/production_schema_check.sql` no SQL Editor. Ele retorna, no último
resultado, um resumo com `all_ok = true` quando tudo está no lugar.
