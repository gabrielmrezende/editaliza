-- Robustez do processamento de editais: timeout de cargos, custo atômico e reserva com limite.

alter table public.edital_cargos add column processando_desde timestamptz;

-- Soma atômica do custo (várias extrações do mesmo edital podem terminar ao mesmo tempo).
create function public.somar_custo_edital(p_edital uuid, p_centavos int)
returns void language sql as $$
  update public.editais
  set custo_centavos = coalesce(custo_centavos, 0) + p_centavos
  where id = p_edital;
$$;
revoke all on function public.somar_custo_edital(uuid, int) from public, anon, authenticated;
grant execute on function public.somar_custo_edital(uuid, int) to service_role;

-- Reserva atômica de um edital novo: confere o limite e insere na mesma transação,
-- serializada por usuário, antes de qualquer gasto com IA.
create function public.reservar_edital(
  p_user uuid, p_sha256 text, p_storage_path text, p_limite int, p_horas int
)
returns table (edital_id uuid, novo boolean, limite_excedido boolean)
language plpgsql as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select e.id into v_id from public.editais e where e.sha256 = p_sha256;
  if v_id is not null then
    return query select v_id, false, false;
    return;
  end if;

  if (
    select count(*) from public.editais e
    where e.enviado_por = p_user
      and e.created_at >= now() - make_interval(hours => p_horas)
  ) >= p_limite then
    return query select null::uuid, false, true;
    return;
  end if;

  insert into public.editais (sha256, storage_path, status, enviado_por, processando_desde)
  values (p_sha256, p_storage_path, 'processando', p_user, now())
  on conflict (sha256) do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, true, false;
  else
    -- Outro usuário inseriu o mesmo PDF no mesmo instante.
    select e.id into v_id from public.editais e where e.sha256 = p_sha256;
    return query select v_id, false, false;
  end if;
end;
$$;
revoke all on function public.reservar_edital(uuid, text, text, int, int) from public, anon, authenticated;
grant execute on function public.reservar_edital(uuid, text, text, int, int) to service_role;
