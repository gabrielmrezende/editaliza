-- aplicar_ajuste refaz a fila: grava fila_posicao/fila_desde (null = manter) no lugar de ciclo_inicio
-- e só grava se a posição lida pelo ajuste ainda é a do banco (p_fila_lida), além de ajustado_em.
-- A coluna ciclo_inicio fica até a Task 6 (ninguém mais a escreve).
drop function public.aplicar_ajuste(uuid, timestamptz, jsonb, jsonb, jsonb, date, date, jsonb, jsonb, jsonb, timestamptz);

create function public.aplicar_ajuste(
  p_plano uuid,
  p_ajustado_lido timestamptz,
  p_fila_lida int,
  p_gerado jsonb,
  p_ajustes jsonb,
  p_fila_posicao int,
  p_fila_desde date,
  p_janela_inicio date,
  p_janela_fim date,
  p_resumo jsonb,
  p_gerado_anterior jsonb,
  p_multiplicadores jsonb,
  p_agora timestamptz
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_atualizou uuid;
begin
  update public.planos
  set gerado = p_gerado,
      ajustes = p_ajustes,
      fila_posicao = coalesce(p_fila_posicao, fila_posicao),
      fila_desde = coalesce(p_fila_desde, fila_desde),
      ajustado_em = p_agora,
      updated_at = p_agora
  where id = p_plano
    and ativo
    and ajustado_em is not distinct from p_ajustado_lido
    and fila_posicao = p_fila_lida
  returning id into v_atualizou;

  if v_atualizou is null then
    return null;
  end if;

  insert into public.ajustes_plano (
    plano_id, janela_inicio, janela_fim, multiplicadores, resumo, gerado_anterior
  )
  values (p_plano, p_janela_inicio, p_janela_fim, p_multiplicadores, p_resumo, p_gerado_anterior)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.aplicar_ajuste(uuid, timestamptz, int, jsonb, jsonb, int, date, date, date, jsonb, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.aplicar_ajuste(uuid, timestamptz, int, jsonb, jsonb, int, date, date, date, jsonb, jsonb, jsonb, timestamptz)
  to service_role;
