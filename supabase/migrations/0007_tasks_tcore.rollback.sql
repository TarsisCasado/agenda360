-- ===========================================================================
-- ROLLBACK da migration 0007 (volta ao estado do 0006: date NOT NULL, sem origin)
-- ---------------------------------------------------------------------------
-- SEGURANCA (regras do T-Core):
--   * NUNCA preenche datas arbitrariamente.
--   * NUNCA apaga atividades.
--   * IMPEDE restaurar o NOT NULL de date se existir QUALQUER task com
--     date NULL, informando quantas linhas bloqueiam o rollback. Nesse caso
--     nada e alterado (a transacao aborta antes de qualquer DDL destrutivo).
--
-- Se o rollback for bloqueado, o operador deve decidir CONSCIENTEMENTE o que
-- fazer com as atividades sem data (atribuir data ou excluir) ANTES de tentar
-- de novo — este script nunca faz isso por voce.
-- ===========================================================================

begin;

-- 1) Guarda: bloqueia o rollback enquanto houver atividades sem data.
do $$
declare
  n_sem_data bigint;
begin
  select count(*) into n_sem_data from public.tasks where date is null;
  if n_sem_data > 0 then
    raise exception
      'Rollback bloqueado: % atividade(s) com date NULL. Restaurar NOT NULL '
      'apagaria/violaria esses registros. Atribua uma data ou remova essas '
      'atividades manualmente antes de reverter (este script nunca faz isso).',
      n_sem_data;
  end if;
end $$;

-- 2) So chega aqui se NAO existir nenhuma task sem data.
alter table public.tasks
  alter column date set not null;

alter table public.tasks
  drop column if exists origin;

commit;

-- ===========================================================================
-- FIM DO ROLLBACK 0007
-- ===========================================================================
