-- Plano 2: acompanhamento (sessões de estudo, revisões espaçadas) e ajuste do plano.
-- Clientes só leem (RLS: SELECT do dono); toda escrita é pela API com a service role.

-- Colunas novas em planos --------------------------------------------------------------------
alter table public.planos
  add column ajustado_em timestamptz null,
  add column ajustes jsonb not null default '{}',
  add column ciclo_inicio jsonb null;

-- Sessões de estudo --------------------------------------------------------------------------
create table public.sessoes_estudo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plano_id uuid null references public.planos (id) on delete set null,
  data date not null,
  disciplina_id text not null,
  disciplina_nome text not null,
  topico_id text null,
  topico_nome text null,
  minutos int not null check (minutos between 0 and 1440),
  acertos int not null default 0 check (acertos >= 0),
  erros int not null default 0 check (erros >= 0),
  tipo text null check (
    tipo in ('teoria', 'questoes', 'revisao', 'simulado', 'lei_seca', 'jurisprudencia', 'discursiva')
  ),
  observacao text null check (length(observacao) <= 1000),
  origem text not null check (origem in ('cronometro', 'manual', 'rapido')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (minutos > 0 or acertos + erros > 0)
);
create index sessoes_estudo_user_data_idx on public.sessoes_estudo (user_id, data desc);
create index sessoes_estudo_plano_data_idx on public.sessoes_estudo (plano_id, data);

-- Revisões -----------------------------------------------------------------------------------
create table public.revisoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plano_id uuid not null references public.planos (id) on delete cascade,
  disciplina_id text not null,
  disciplina_nome text not null,
  topico_id text not null,
  topico_nome text not null,
  data_estudo date not null,
  data_revisao date not null,
  intervalo int not null check (intervalo > 0),
  -- a revisão concluída sobrevive à exclusão da sessão que a originou
  sessao_id uuid null references public.sessoes_estudo (id) on delete set null,
  origem text not null check (origem in ('sessao', 'conclusao')),
  concluida_em timestamptz null,
  created_at timestamptz not null default now()
);
create unique index revisoes_pendente_unica_idx
  on public.revisoes (plano_id, topico_id, intervalo) where concluida_em is null;
create index revisoes_plano_data_idx on public.revisoes (plano_id, data_revisao);
create index revisoes_user_data_idx on public.revisoes (user_id, data_revisao);
create index revisoes_sessao_idx on public.revisoes (sessao_id);

-- Ajustes do plano ---------------------------------------------------------------------------
create table public.ajustes_plano (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos (id) on delete cascade,
  created_at timestamptz not null default now(),
  janela_inicio date not null,
  janela_fim date not null,
  multiplicadores jsonb not null,
  resumo jsonb not null,
  gerado_anterior jsonb not null,
  visto boolean not null default false
);
create index ajustes_plano_plano_idx on public.ajustes_plano (plano_id, created_at desc);

-- RLS: o dono só lê -------------------------------------------------------------------------
alter table public.sessoes_estudo enable row level security;
alter table public.revisoes enable row level security;
alter table public.ajustes_plano enable row level security;

create policy sessoes_estudo_select on public.sessoes_estudo for select to authenticated
  using (user_id = (select auth.uid()));
create policy revisoes_select on public.revisoes for select to authenticated
  using (user_id = (select auth.uid()));
create policy ajustes_plano_select on public.ajustes_plano for select to authenticated
  using (
    exists (
      select 1 from public.planos p
      where p.id = ajustes_plano.plano_id and p.user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.sessoes_estudo from anon, authenticated;
revoke insert, update, delete on public.revisoes from anon, authenticated;
revoke insert, update, delete on public.ajustes_plano from anon, authenticated;

-- registrar_sessao: sessão + revisões + conclusão do tópico, numa transação -----------------
create function public.registrar_sessao(
  p_user uuid,
  p_plano uuid,
  p_sessao jsonb,
  p_revisoes jsonb,
  p_concluir boolean
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  s public.sessoes_estudo;
begin
  if not exists (select 1 from public.planos p where p.id = p_plano and p.user_id = p_user) then
    raise exception 'plano não encontrado' using errcode = 'P0002';
  end if;

  s := jsonb_populate_record(null::public.sessoes_estudo, p_sessao);

  insert into public.sessoes_estudo (
    user_id, plano_id, data, disciplina_id, disciplina_nome, topico_id, topico_nome,
    minutos, acertos, erros, tipo, observacao, origem
  )
  values (
    p_user, p_plano, s.data, s.disciplina_id, s.disciplina_nome, s.topico_id, s.topico_nome,
    s.minutos, coalesce(s.acertos, 0), coalesce(s.erros, 0), s.tipo, s.observacao, s.origem
  )
  returning id into v_id;

  if s.topico_id is not null then
    insert into public.revisoes (
      user_id, plano_id, disciplina_id, disciplina_nome, topico_id, topico_nome,
      data_estudo, data_revisao, intervalo, sessao_id, origem
    )
    select p_user, p_plano, s.disciplina_id, s.disciplina_nome, s.topico_id, coalesce(s.topico_nome, s.topico_id),
           s.data, (r ->> 'data_revisao')::date, (r ->> 'intervalo')::int, v_id, 'sessao'
    from jsonb_array_elements(coalesce(p_revisoes, '[]'::jsonb)) as r
    on conflict (plano_id, topico_id, intervalo) where concluida_em is null do nothing;

    if p_concluir then
      insert into public.topicos_concluidos (plano_id, topico_id)
      values (p_plano, s.topico_id)
      on conflict (plano_id, topico_id) do nothing;
    end if;
  end if;

  return v_id;
end;
$$;
revoke all on function public.registrar_sessao(uuid, uuid, jsonb, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.registrar_sessao(uuid, uuid, jsonb, jsonb, boolean) to service_role;

-- excluir_sessao: apaga as revisões pendentes da sessão e a própria sessão ------------------
create function public.excluir_sessao(p_user uuid, p_sessao uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_achou boolean;
begin
  select true into v_achou
  from public.sessoes_estudo s
  where s.id = p_sessao and s.user_id = p_user
  for update;
  if v_achou is null then
    return false;
  end if;

  delete from public.revisoes r
  where r.sessao_id = p_sessao and r.user_id = p_user and r.concluida_em is null;
  delete from public.sessoes_estudo s where s.id = p_sessao and s.user_id = p_user;
  return true;
end;
$$;
revoke all on function public.excluir_sessao(uuid, uuid) from public, anon, authenticated;
grant execute on function public.excluir_sessao(uuid, uuid) to service_role;

-- aplicar_ajuste: grava o plano ajustado só se ninguém ajustou antes (otimista) -------------
create function public.aplicar_ajuste(
  p_plano uuid,
  p_ajustado_lido timestamptz,
  p_gerado jsonb,
  p_ajustes jsonb,
  p_ciclo_inicio jsonb,
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
      ciclo_inicio = p_ciclo_inicio,
      ajustado_em = p_agora,
      updated_at = p_agora
  where id = p_plano and ativo and ajustado_em is not distinct from p_ajustado_lido
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
revoke all on function public.aplicar_ajuste(uuid, timestamptz, jsonb, jsonb, jsonb, date, date, jsonb, jsonb, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.aplicar_ajuste(uuid, timestamptz, jsonb, jsonb, jsonb, date, date, jsonb, jsonb, jsonb, timestamptz)
  to service_role;

-- criar_plano: o novo plano do mesmo cargo leva também sessões e revisões pendentes ---------
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

    -- Sessões das matérias que continuam no conteúdo novo passam para o plano novo.
    update public.sessoes_estudo s
    set plano_id = v_id
    where s.plano_id = v_anterior
      and s.disciplina_id in (select d ->> 'id' from jsonb_array_elements(p_conteudo) as d);

    -- Revisões pendentes de tópicos que continuam passam para o plano novo; as concluídas ficam.
    update public.revisoes r
    set plano_id = v_id
    where r.plano_id = v_anterior
      and r.concluida_em is null
      and r.topico_id in (
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
