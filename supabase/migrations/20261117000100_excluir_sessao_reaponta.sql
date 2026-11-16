-- excluir_sessao: cada revisão pendente da sessão excluída passa para a sessão mais recente
-- (data desc, created_at desc) do mesmo usuário e plano cujo tópico é o da REVISÃO, se houver;
-- só as revisões sem outra sessão no tópico são apagadas. Evita perder revisões que a
-- deduplicação deixou "pertencendo" à primeira sessão (a edição de uma sessão não muda as revisões).
create or replace function public.excluir_sessao(p_user uuid, p_sessao uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_achou boolean := false;
begin
  select true into v_achou
  from public.sessoes_estudo s
  where s.id = p_sessao and s.user_id = p_user
  for update;
  if not coalesce(v_achou, false) then
    return false;
  end if;

  -- sem outra sessão no tópico da revisão: apaga
  delete from public.revisoes r
  where r.sessao_id = p_sessao and r.user_id = p_user and r.concluida_em is null
    and not exists (
      select 1 from public.sessoes_estudo o
      where o.user_id = p_user and o.plano_id = r.plano_id and o.topico_id = r.topico_id and o.id <> p_sessao
    );

  -- as demais passam para a sessão mais recente do tópico da revisão
  update public.revisoes r
  set sessao_id = (
    select o.id
    from public.sessoes_estudo o
    where o.user_id = p_user
      and o.plano_id = r.plano_id
      and o.topico_id = r.topico_id
      and o.id <> p_sessao
    order by o.data desc, o.created_at desc
    limit 1
  )
  where r.sessao_id = p_sessao and r.user_id = p_user and r.concluida_em is null;

  delete from public.sessoes_estudo s where s.id = p_sessao and s.user_id = p_user;
  return true;
end;
$$;
revoke all on function public.excluir_sessao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.excluir_sessao(uuid, uuid) to service_role;
