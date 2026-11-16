-- Seed SÓ do ambiente local (npx supabase db reset). Nunca roda no Supabase hospedado.
-- Segredos usados por public.limpar_envios_tmp() para chamar a Storage API de dentro do banco:
-- a URL interna do gateway local e a chave service_role de demonstração do Supabase CLI
-- (pública, a mesma de `npx supabase status`). Em produção eles são criados à mão (docs/deploy.md).
select vault.create_secret('http://kong:8000', 'editaliza_api_url');
select vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  'editaliza_service_role_key'
);
