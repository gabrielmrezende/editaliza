-- Colunas internas de editais não são expostas a clientes (só service role).
revoke select on public.editais from anon, authenticated;
grant select (
  id, orgao, banca, ano, data_prova, status, erro, publicado, versao,
  edital_origem_id, created_at
) on public.editais to authenticated;

-- Bucket: apenas PDF, até 50 MB.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['application/pdf']
where id = 'editais';
