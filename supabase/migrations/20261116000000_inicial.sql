-- Esquema inicial do Editaliza: tabelas, RLS e bucket de storage.

create table public.editais (
  id uuid primary key default gen_random_uuid(),
  sha256 text unique not null,
  storage_path text not null,
  anthropic_file_id text,
  orgao text,
  banca text,
  ano int,
  data_prova date,
  status text not null check (status in ('processando', 'pronto', 'erro')),
  erro text,
  publicado boolean default false,
  versao int default 1,
  edital_origem_id uuid null references public.editais (id),
  enviado_por uuid references auth.users (id),
  custo_centavos int default 0,
  created_at timestamptz default now()
);

create table public.edital_cargos (
  id uuid primary key default gen_random_uuid(),
  edital_id uuid references public.editais (id) on delete cascade,
  nome text not null,
  status_conteudo text default 'pendente'
    check (status_conteudo in ('pendente', 'processando', 'pronto', 'erro')),
  conteudo jsonb, -- ConteudoCargo
  erro text
);
create index edital_cargos_edital_id_idx on public.edital_cargos (edital_id);

create table public.edital_acessos (
  user_id uuid references auth.users (id) on delete cascade,
  edital_id uuid references public.editais (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, edital_id)
);

create table public.planos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  edital_id uuid references public.editais (id),
  cargo_id uuid references public.edital_cargos (id),
  edital_versao int,
  ativo boolean default true,
  data_prova date null,
  minutos_por_dia int[7] not null check (array_length(minutos_por_dia, 1) = 7),
  conteudo jsonb not null, -- DisciplinaPlano[]
  gerado jsonb not null, -- PlanoGerado
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create unique index planos_um_ativo_por_usuario on public.planos (user_id) where ativo;

create table public.topicos_concluidos (
  plano_id uuid references public.planos (id) on delete cascade,
  topico_id text,
  concluido_em timestamptz default now(),
  primary key (plano_id, topico_id)
);

-- RLS ---------------------------------------------------------------------
alter table public.editais enable row level security;
alter table public.edital_cargos enable row level security;
alter table public.edital_acessos enable row level security;
alter table public.planos enable row level security;
alter table public.topicos_concluidos enable row level security;

-- Editais e cargos: leitura se publicado ou com acesso; escrita só service role.
create policy editais_select on public.editais for select to authenticated
  using (
    publicado
    or exists (
      select 1 from public.edital_acessos a
      where a.edital_id = editais.id and a.user_id = (select auth.uid())
    )
  );

create policy edital_cargos_select on public.edital_cargos for select to authenticated
  using (
    exists (
      select 1 from public.editais e
      where e.id = edital_cargos.edital_id
        and (
          e.publicado
          or exists (
            select 1 from public.edital_acessos a
            where a.edital_id = e.id and a.user_id = (select auth.uid())
          )
        )
    )
  );

create policy edital_acessos_select on public.edital_acessos for select to authenticated
  using (user_id = (select auth.uid()));

create policy planos_select on public.planos for select to authenticated
  using (user_id = (select auth.uid()));
create policy planos_insert on public.planos for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy planos_update on public.planos for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy planos_delete on public.planos for delete to authenticated
  using (user_id = (select auth.uid()));

create policy topicos_concluidos_all on public.topicos_concluidos for all to authenticated
  using (
    exists (
      select 1 from public.planos p
      where p.id = topicos_concluidos.plano_id and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.planos p
      where p.id = topicos_concluidos.plano_id and p.user_id = (select auth.uid())
    )
  );

-- Storage -------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('editais', 'editais', false)
on conflict (id) do nothing;

-- Único acesso de clientes: enviar PDF para tmp/{uid}/ (leitura só via service role).
create policy editais_upload_tmp on storage.objects for insert to authenticated
  with check (
    bucket_id = 'editais'
    and (storage.foldername(name))[1] = 'tmp'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
