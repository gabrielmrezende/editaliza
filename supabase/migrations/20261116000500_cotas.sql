-- Cotas por usuário (chamadas de IA, URLs de envio): uma linha por uso, contada numa janela móvel.

create table public.cotas_uso (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null,
  criado_em timestamptz not null default now()
);
create index cotas_uso_user_tipo_criado_idx on public.cotas_uso (user_id, tipo, criado_em);

-- Só o servidor (service role) lê e grava.
alter table public.cotas_uso enable row level security;
revoke all on public.cotas_uso from anon, authenticated;

-- Consome uma unidade da cota se ainda houver: conferência e registro atômicos, serializados por
-- usuário e tipo. Devolve false (sem registrar) quando o limite da janela já foi atingido.
create function public.consumir_cota(p_user uuid, p_tipo text, p_limite int, p_janela_minutos int)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('cota:' || p_tipo || ':' || p_user::text));

  -- Limpeza: usos muito antigos não contam mais em janela nenhuma.
  delete from public.cotas_uso c
  where c.user_id = p_user and c.tipo = p_tipo
    and c.criado_em < now() - make_interval(mins => greatest(p_janela_minutos, 0)) - interval '1 day';

  if (
    select count(*) from public.cotas_uso c
    where c.user_id = p_user and c.tipo = p_tipo
      and c.criado_em > now() - make_interval(mins => p_janela_minutos)
  ) >= p_limite then
    return false;
  end if;

  insert into public.cotas_uso (user_id, tipo) values (p_user, p_tipo);
  return true;
end;
$$;
revoke all on function public.consumir_cota(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.consumir_cota(uuid, text, int, int) to service_role;
