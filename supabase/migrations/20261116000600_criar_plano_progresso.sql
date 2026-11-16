-- Novo plano do mesmo cargo leva o progresso: os tópicos concluídos do plano ativo anterior que
-- ainda existem no conteúdo novo são copiados (com a data original), na mesma transação.
create or replace function public.criar_plano(
  p_user uuid,
  p_edital uuid,
  p_cargo uuid,
  p_versao int,
  p_data_prova date,
  p_minutos int[],
  p_conteudo jsonb,
  p_gerado jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_anterior uuid;
begin
  perform pg_advisory_xact_lock(hashtext('plano:' || p_user::text));

  select p.id into v_anterior
  from public.planos p
  where p.user_id = p_user and p.ativo and p.cargo_id = p_cargo;

  update public.planos
  set ativo = false, updated_at = now()
  where user_id = p_user and ativo;

  insert into public.planos (
    user_id, edital_id, cargo_id, edital_versao, ativo, data_prova, minutos_por_dia, conteudo, gerado
  )
  values (p_user, p_edital, p_cargo, p_versao, true, p_data_prova, p_minutos, p_conteudo, p_gerado)
  returning id into v_id;

  if v_anterior is not null then
    insert into public.topicos_concluidos (plano_id, topico_id, concluido_em)
    select v_id, c.topico_id, c.concluido_em
    from public.topicos_concluidos c
    where c.plano_id = v_anterior
      and c.topico_id in (
        select t ->> 'id'
        from jsonb_array_elements(p_conteudo) as d,
             jsonb_array_elements(d -> 'topicos') as t
      );
  end if;

  return v_id;
end;
$$;
revoke all on function public.criar_plano(uuid, uuid, uuid, int, date, int[], jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.criar_plano(uuid, uuid, uuid, int, date, int[], jsonb, jsonb)
  to service_role;
