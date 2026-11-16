-- Momento em que o edital entrou em 'processando' (detecta processamento travado).
alter table public.editais add column processando_desde timestamptz default now();
