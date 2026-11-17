-- Início no estilo do legado: fila de blocos do plano e conclusão transacional de bloco.
-- fila_posicao/fila_desde só mudam pelo servidor (service role); planos não tem UPDATE para clientes.

alter table public.planos
  add column fila_posicao int not null default 0 check (fila_posicao >= 0),
  add column fila_desde date null;

-- concluir_bloco: sessão + revisões + conclusão do tópico + avanço da fila, numa transação ----
-- Trava a linha do plano; só grava se a posição e o ajuste lidos pela tela ainda valem.
create function public.concluir_bloco(
  p_user uuid,
  p_plano uuid,
  p_esperada int,
  p_ajustado_lido timestamptz,
  p_avancar boolean,
  p_sessao jsonb,
  p_revisoes jsonb,
  p_concluir boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_posicao int;
  v_ajustado timestamptz;
  v_sessao uuid;
begin
  select p.fila_posicao, p.ajustado_em into v_posicao, v_ajustado
  from public.planos p
  where p.id = p_plano and p.user_id = p_user and p.ativo
  for update;

  if not found then
    raise exception 'plano não encontrado' using errcode = 'P0002';
  end if;

  if v_posicao <> p_esperada or v_ajustado is distinct from p_ajustado_lido then
    raise exception 'fila mudou' using errcode = 'EZ409';
  end if;

  v_sessao := public.registrar_sessao(p_user, p_plano, p_sessao, p_revisoes, p_concluir);

  if p_avancar then
    update public.planos
    set fila_posicao = fila_posicao + 1, updated_at = now()
    where id = p_plano
    returning fila_posicao into v_posicao;
  end if;

  return jsonb_build_object('sessao_id', v_sessao, 'posicao', v_posicao);
end;
$$;
revoke all on function public.concluir_bloco(uuid, uuid, int, timestamptz, boolean, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.concluir_bloco(uuid, uuid, int, timestamptz, boolean, jsonb, jsonb, boolean)
  to service_role;
