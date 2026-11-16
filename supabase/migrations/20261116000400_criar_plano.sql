-- Criação atômica de plano: desativa o plano ativo do usuário e insere o novo na mesma
-- transação, serializada por usuário (o índice "um ativo por usuário" nunca estoura).
create function public.criar_plano(
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
begin
  perform pg_advisory_xact_lock(hashtext('plano:' || p_user::text));

  update public.planos
  set ativo = false, updated_at = now()
  where user_id = p_user and ativo;

  insert into public.planos (
    user_id, edital_id, cargo_id, edital_versao, ativo, data_prova, minutos_por_dia, conteudo, gerado
  )
  values (p_user, p_edital, p_cargo, p_versao, true, p_data_prova, p_minutos, p_conteudo, p_gerado)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.criar_plano(uuid, uuid, uuid, int, date, int[], jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.criar_plano(uuid, uuid, uuid, int, date, int[], jsonb, jsonb)
  to service_role;
