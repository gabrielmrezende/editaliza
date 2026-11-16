-- Ajustes finais: ordem dos cargos, usuário apagado e search_path das funções.

-- Cargos na ordem em que aparecem no edital (definida na inserção).
alter table public.edital_cargos add column posicao int not null default 0;
create index edital_cargos_edital_posicao_idx on public.edital_cargos (edital_id, posicao);

-- Apagar a conta de quem enviou o edital não apaga nem trava o edital (outros alunos o usam).
alter table public.editais drop constraint editais_enviado_por_fkey;
alter table public.editais
  add constraint editais_enviado_por_fkey
  foreign key (enviado_por) references auth.users (id) on delete set null;

-- Funções com search_path fixo (os nomes já são qualificados com o esquema).
alter function public.somar_custo_edital(uuid, int) set search_path = '';
alter function public.reservar_edital(uuid, text, text, int, int) set search_path = '';
