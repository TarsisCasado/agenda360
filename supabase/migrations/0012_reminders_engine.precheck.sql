-- ===========================================================================
-- PRECHECK da migration 0012 (rode ANTES; nao altera nada) — 8 checks
-- ---------------------------------------------------------------------------
-- Fundacao do MOTOR DE LEMBRETES. Este precheck existe para provar, com dados
-- REAIS de producao, que a 0012 pode ser aplicada sem violar constraint nem
-- perder linha. NAO assumimos tabela vazia so porque o codigo atual nao usa
-- estas tabelas — producao pode ter linhas de qualquer origem.
--
-- Somente leitura. Guarde o resultado: e a referencia para o rollback.
-- ===========================================================================

-- 1) VOLUME das tabelas afetadas. Se vier tudo 0, a 0012 e trivial; se houver
--    linhas, os checks 3/4/5 dizem se elas violariam as novas constraints.
select 'profiles'      as tabela, count(*) as linhas from public.profiles
union all select 'tasks',         count(*) from public.tasks
union all select 'reminders',     count(*) from public.reminders
union all select 'notifications', count(*) from public.notifications
order by tabela;

-- 2) COLUNAS que a 0012 pretende adicionar ja existem? Esperado: 0 linhas na
--    1a aplicacao. Se alguma aparecer, a 0012 e no-op para ela (add column if
--    not exists), mas confira o TIPO antes de prosseguir.
select table_name as tabela, column_name as coluna, data_type as tipo,
       is_nullable as aceita_null, column_default as padrao
from information_schema.columns
where table_schema = 'public'
  and (   (table_name = 'profiles'      and column_name = 'timezone')
       or (table_name = 'reminders'     and column_name in ('recipient_id','minutes_before','cancelled_at'))
       or (table_name = 'notifications' and column_name = 'user_id'))
order by tabela, coluna;

-- 3) DADOS que violariam o UNIQUE parcial de reminders
--    (task_id, type, minutes_before) where sent=false and cancelled_at is null.
--    Como minutes_before ainda NAO existe, todas as linhas existentes ficarao
--    com NULL — e em Postgres NULL nao colide em UNIQUE. Este check mede o
--    risco REAL: duplicatas de (task_id, type) entre lembretes pendentes.
--    Esperado: 0 linhas. Se houver, a migration ainda aplica (NULLs nao
--    colidem), mas o 1B precisara saber que esses pendentes existem.
select task_id, type, count(*) as pendentes_equivalentes
from public.reminders
where sent = false
group by task_id, type
having count(*) > 1
order by pendentes_equivalentes desc;

-- 4) DADOS que violariam o UNIQUE parcial de notifications
--    (reminder_id, channel) where reminder_id is not null.
--    Esperado: 0 linhas. Se houver, a migration FALHA ao criar o indice —
--    seria necessario decidir antes o que fazer com as duplicatas.
select reminder_id, channel, count(*) as duplicadas
from public.notifications
where reminder_id is not null
group by reminder_id, channel
having count(*) > 1
order by duplicadas desc;

-- 5) REMINDERS orfaos de destinatario: quantos nao conseguiriam derivar
--    recipient_id da task (assignee_id nulo ou task ausente)?
--    Informativo: recipient_id nasce NULL e sera preenchido pelo 1B; nenhuma
--    linha e alterada aqui. Esperado tipicamente: 0.
select
  count(*) filter (where r.task_id is null)                  as sem_task,
  count(*) filter (where t.id is not null and t.assignee_id is null) as task_sem_assignee,
  count(*)                                                   as total_reminders
from public.reminders r
left join public.tasks t on t.id = r.task_id;

-- 6) TASKS com alerta ativo mas SEM start_time.
--    Regra de produto aprovada: alert_enabled=true EXIGE start_time (o sistema
--    NAO inventa horario). A 0012 nao cria constraint sobre isso — mas estas
--    linhas sao exatamente as que o 1B/1F terao de tratar na interface.
--    Informativo. Se > 0, sao tarefas cujo alerta hoje e inexequivel.
select count(*) as tasks_alerta_sem_horario
from public.tasks
where alert_enabled = true and start_time is null;

-- 7) ESTADO ATUAL de grants e RLS das 2 tabelas do escopo (baseline da 0011).
--    A 0012 NAO altera grants nem policies — este check serve para provar,
--    comparando com o verify, que nada mudou.
--    Esperado: reminders/authenticated = DELETE,INSERT,SELECT,UPDATE;
--              notifications/authenticated = SELECT; anon ausente nas duas.
select
  g.table_name as tabela,
  g.grantee    as papel,
  string_agg(g.privilege_type, ',' order by g.privilege_type) as privilegios
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.table_name in ('reminders','notifications','profiles')
  and g.grantee in ('anon','authenticated')
group by 1, 2
order by tabela, papel;

-- 8) INDICES e CONSTRAINTS ja existentes nas 2 tabelas — para garantir que a
--    0012 nao cria nada redundante.
--    Esperado: idx_reminders_pending e idx_notifications_due (do schema base),
--    mais as PKs/FKs. Nenhum indice de idempotencia deve existir ainda.
select tablename as tabela, indexname as indice, indexdef as definicao
from pg_indexes
where schemaname = 'public'
  and tablename in ('reminders','notifications')
order by tabela, indice;
