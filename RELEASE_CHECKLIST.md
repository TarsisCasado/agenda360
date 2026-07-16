# RELEASE_CHECKLIST.md — Agenda360

> Passo a passo objetivo para publicar com segurança. Complementa o
> `PRODUCTION.md`. **Regra de ouro:** migration de produção é aplicada **antes**
> (ou no mesmo momento) do deploy do frontend que depende dela — **nunca depois**.

---

## ✅ Antes do merge / deploy

- [ ] **Testes** verdes — `npm run test`
- [ ] **Lint** limpo — `npm run lint`
- [ ] **Build** ok — `npm run build`
- [ ] **Migrations novas identificadas** — há arquivos em `supabase/migrations/`
      ainda **não** aplicados em produção? (comparar com a tabela do `PRODUCTION.md §4`)
- [ ] **Precheck revisado** — para cada migration nova, ler o `.precheck.sql` e
      entender o efeito do `.sql`
- [ ] **Rollback disponível** — existe `.rollback.sql` correspondente e ele foi
      lido (sabe-se o que ele apaga)
- [ ] **Backup** — projeto Supabase com backup automático ativo (ou snapshot
      manual antes de migrations destrutivas, ex.: DROP COLUMN)
- [ ] **Variáveis de ambiente confirmadas** — `VITE_SUPABASE_URL` e
      `VITE_SUPABASE_ANON_KEY` corretas no escopo **Production** da Vercel
- [ ] **Ordem de release definida** — se o deploy depende de novo schema:
      aplicar migration **primeiro**, verificar, **depois** publicar o frontend

## 🚀 Aplicação da migration (se houver)

- [ ] Projeto Supabase = `agenda-inteligente-360` e URL = `rsqepikxfghylincnnbh.supabase.co`
- [ ] Rodar `NNNN_*.precheck.sql` → resultado esperado ok
- [ ] Rodar `NNNN_*.sql` → sem erro
- [ ] Rodar `NNNN_*.verify.sql` → tudo presente
- [ ] Repetir para cada migration, **uma por vez**, em ordem
- [ ] Rodar `supabase/production_schema_check.sql` → `all_ok = true`

## 🔎 Depois do deploy

- [ ] **Migration aplicada** e `verify` executado com sucesso
- [ ] **Smoke test** no app publicado:
  - [ ] Login / autenticação
  - [ ] **CRUD principal** — criar nota, criar checklist, marcar item
  - [ ] Mover para "Para pensar", arquivar, restaurar
  - [ ] Abrir histórico (timeline)
  - [ ] **Persistência** — recarregar a página e confirmar que tudo permaneceu
- [ ] **Console do navegador** sem erros
- [ ] **Network** sem `4xx/5xx` inesperados (atenção a `404` do PostgREST =
      tabela/coluna ausente → migration faltando)
- [ ] **Mobile** — layout e captura funcionando no celular
- [ ] **PWA** — abre a partir da tela inicial / offline básico ok
- [ ] **Não** entrou em "modo demo" (aviso amarelo no topo) — se entrou, envs
      ausentes no build

## 🛟 Se algo falhar

1. **Parar** o rollout.
2. Ler a mensagem exata (Console/Network) e cruzar com `PRODUCTION.md §8`.
3. Se foi uma migration: avaliar `.rollback.sql` (só se falha real).
4. Não presumir sucesso sem `verify` / `production_schema_check.sql`.
