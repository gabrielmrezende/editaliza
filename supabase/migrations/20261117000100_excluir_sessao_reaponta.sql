-- excluir_sessao: as revisões pendentes da sessão excluída passam para a sessão mais recente do
-- mesmo tópico (mesmo usuário e plano), se houver; só as sem outra sessão no tópico são apagadas.
-- Evita perder revisões que a deduplicação deixou "pertencendo" à primeira sessão.
create or replace function public.excluir_sessao(p_user uuid, p_sessao uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plano uuid;
  v_topico text;
  v_achou boolean := false;
  v_outra uuid;
begin
  select true, s.plano_id, s.topico_id into v_achou, v_plano, v_topico
  from public.sessoes_estudo s
  where s.id = p_sessao and s.user_id = p_user
  for update;
  if not coalesce(v_achou, false) then
    return false;
  end if;

  if v_topico is not null and v_plano is not null then
    select s.id into v_outra
    from public.sessoes_estudo s
    where s.user_id = p_user and s.plano_id = v_plano and s.topico_id = v_topico and s.id <> p_sessao
    order by s.data desc, s.created_at desc
    limit 1;
  end if;

  if v_outra is not null then
    update public.revisoes r
    set sessao_id = v_outra
    where r.sessao_id = p_sessao and r.user_id = p_user and r.concluida_em is null;
  else
    delete from public.revisoes r
    where r.sessao_id = p_sessao and r.user_id = p_user and r.concluida_em is null;
  end if;

  delete from public.sessoes_estudo s where s.id = p_sessao and s.user_id = p_user;
  return true;
end;
$$;
revoke all on function public.excluir_sessao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.excluir_sessao(uuid, uuid) to service_role;
