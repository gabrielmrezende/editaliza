-- Endurecimento: clientes só leem planos/concluídos (a escrita é pela API), envio ao storage só
-- por URL assinada e limpeza periódica dos envios esquecidos em tmp/.

-- Planos: o cliente lê e apaga o próprio; criar e alterar só pela API (service role). ----------
drop policy planos_insert on public.planos;
drop policy planos_update on public.planos;
revoke insert, update on public.planos from anon, authenticated;

-- Tópicos concluídos: o dono só lê; marcar/desmarcar só pela API. ------------------------------
drop policy topicos_concluidos_all on public.topicos_concluidos;
create policy topicos_concluidos_select on public.topicos_concluidos for select to authenticated
  using (
    exists (
      select 1 from public.planos p
      where p.id = topicos_concluidos.plano_id and p.user_id = (select auth.uid())
    )
  );
revoke insert, update, delete on public.topicos_concluidos from anon, authenticated;

-- Storage: o envio usa URL assinada criada pelo servidor, que dispensa política de INSERT. -----
drop policy editais_upload_tmp on storage.objects;

-- Limpeza de tmp/ ------------------------------------------------------------------------------
-- Apagar direto em storage.objects deixaria os arquivos órfãos (e é bloqueado pelo Storage):
-- a função chama a Storage API (pg_net) com a URL e a chave service role guardadas no Vault
-- (segredos 'editaliza_api_url' e 'editaliza_service_role_key', criados por ambiente; ver docs/deploy.md).
create extension if not exists pg_net;
create extension if not exists pg_cron;

create function public.limpar_envios_tmp(p_minutos int default 60, p_prefixo text default 'tmp/')
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nomes text[];
  v_url text;
  v_chave text;
begin
  if p_prefixo is null or left(p_prefixo, 4) <> 'tmp/' then
    raise exception 'prefixo deve estar dentro de tmp/';
  end if;

  select array_agg(o.name) into v_nomes
  from (
    select o.name from storage.objects o
    where o.bucket_id = 'editais'
      and left(o.name, length(p_prefixo)) = p_prefixo
      and o.created_at <= now() - make_interval(mins => greatest(p_minutos, 0))
    order by o.created_at
    limit 1000
  ) o;
  if v_nomes is null then
    return 0;
  end if;

  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'editaliza_api_url';
  select s.decrypted_secret into v_chave from vault.decrypted_secrets s where s.name = 'editaliza_service_role_key';
  if v_url is null or v_chave is null then
    raise warning 'limpar_envios_tmp: segredos editaliza_api_url/editaliza_service_role_key ausentes no Vault';
    return 0;
  end if;

  perform net.http_delete(
    url := rtrim(v_url, '/') || '/storage/v1/object/editais',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_chave,
      'apikey', v_chave,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('prefixes', to_jsonb(v_nomes)),
    timeout_milliseconds := 30000
  );
  return coalesce(array_length(v_nomes, 1), 0);
end;
$$;
revoke all on function public.limpar_envios_tmp(int, text) from public, anon, authenticated;
grant execute on function public.limpar_envios_tmp(int, text) to service_role;

-- A cada 15 minutos, apaga o que está em tmp/ há mais de 1 hora.
select cron.schedule('limpar-envios-tmp', '*/15 * * * *', 'select public.limpar_envios_tmp(60)');
