-- ===========================================================================
-- MIGRATION 0010 — Corrige DEFAULT PRIVILEGES de TABELAS no schema public
-- ---------------------------------------------------------------------------
-- NAO EXECUTAR AUTOMATICAMENTE. Revise, depois rode no SQL Editor do Supabase.
--
-- OBJETIVO (causa raiz)
--   Impedir que TABELAS NOVAS nascam com privilegios amplos para anon/
--   authenticated. Cada migration ja concede explicitamente o minimo de que
--   sua tabela precisa (padrao `revoke all` + `grant <minimo>`, ver 0006/0008/
--   0009) — o default automatico so cria passivo silencioso.
--
-- ESCOPO — o que esta migration NAO faz:
--   * NAO altera privilegios de tabelas JA existentes. ALTER DEFAULT
--     PRIVILEGES nunca e retroativo: nenhuma ACL materializada muda. O
--     saneamento dos grants ja concedidos e trabalho SEPARADO, por tabela.
--   * NAO altera RLS, policies, dados, storage, sequences nem functions.
--   * NAO altera os defaults do papel supabase_admin (ver abaixo).
--
-- POR QUE APENAS `FOR ROLE postgres`
--   pg_default_acl e indexado por (papel criador, schema, tipo de objeto), e um
--   default so vale para objetos criados POR aquele papel. As migrations deste
--   projeto rodam como `postgres` no SQL Editor -> a entrada de `postgres` e a
--   unica que alcanca as tabelas que criamos. A entrada de `supabase_admin`
--   pertence a PLATAFORMA e so afetaria tabelas criadas pelo proprio
--   supabase_admin (o que nenhuma migration nossa faz); alem disso, `postgres`
--   normalmente nao e membro dela, entao a tentativa falharia com permission
--   denied. Por decisao de projeto: nao tentamos.
--
-- IDEMPOTENTE: `revoke` de privilegio inexistente e no-op silencioso.
--   REVOKE ALL cobre os 8 privilegios do PG17 (inclui MAINTAIN e TRUNCATE) sem
--   enumera-los, e continua correto se a lista mudar em versoes futuras.
--
-- Depende de: nenhuma migration anterior (independente).
-- ===========================================================================

begin;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;

commit;

-- ===========================================================================
-- FIM DA MIGRATION 0010
-- Verificacao: rode 0010_fix_default_table_privileges.verify.sql
-- Reverter:    LEIA 0010_fix_default_table_privileges.rollback.sql — ele e
--              documental e NAO restaura nada automaticamente (de proposito).
-- ===========================================================================
