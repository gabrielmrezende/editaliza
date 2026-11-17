# Deploy do Editaliza (Vercel + Supabase hospedado)

Checklist para colocar o Plano 1 no ar. Vale para cada ambiente (produção e preview/staging):
cada um tem o seu projeto Supabase e as suas variáveis na Vercel.

## 1. Variáveis de ambiente na Vercel

Configure em *Project → Settings → Environment Variables*, separadas por ambiente
(Production, Preview, Development):

| Variável | Onde é usada | Observação |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | navegador e servidor | URL do projeto Supabase daquele ambiente |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador e servidor | chave anon (pública) do mesmo projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | só servidor | **segredo**; nunca com prefixo `NEXT_PUBLIC_` |
| `ANTHROPIC_API_KEY` | só servidor | **segredo**; chave da API da Anthropic |
| `EXTRACAO_MODELO` | só servidor | opcional; modelo da leitura de editais: `claude-haiku-5-5` (padrão se ausente), `claude-sonnet-5-5` ou `claude-opus-5-5`. Valor fora da lista faz a leitura falhar com erro claro. O modelo usado aparece no log `[extracao]` de cada chamada |
| `NEXT_PUBLIC_SITE_URL` | links de login | URL pública daquele ambiente, sem barra no final (ex.: `https://editaliza.com.br`; no preview, a URL do preview/staging) |

**Nunca** defina `EXTRACAO_MODO` na Vercel. Ele só existe para testes locais (`fake`); em produção o
app se recusa a ler editais com `EXTRACAO_MODO=fake` (toda leitura falha).

## 2. Banco (Supabase hospedado)

1. Vincule o projeto: `npx supabase link --project-ref <ref-do-projeto>`.
2. Aplique as migrações: `npx supabase db push`.
   - O `supabase/seed.sql` é só do ambiente local e **não** roda no `db push`.
   - O Plano 2 traz duas migrações novas, aplicadas na ordem pelo mesmo `db push`:
     `20261117000000_acompanhamento.sql` (sessões de estudo, revisões e ajustes do plano, com RLS só de leitura
     para o dono e escrita só pelo servidor) e `20261117000100_excluir_sessao_reaponta.sql` (exclusão de sessão
     que re-aponta as revisões pendentes). Nenhuma variável de ambiente nova.
3. Confira em *Database → Extensions* que `pg_cron` e `pg_net` ficaram ativas (as migrações as criam).

### Limpeza de envios esquecidos em `tmp/` (pg_cron)

A migração `20261116000700_endurecer_storage_e_rls.sql` agenda o job `limpar-envios-tmp`
(`*/15 * * * *`, a cada 15 minutos), que apaga pela Storage API os PDFs que estão em `tmp/` há mais
de 1 hora. Para chamar a Storage API de dentro do banco, a função lê dois segredos do Vault, que
precisam ser criados **à mão em cada ambiente** (SQL Editor do painel):

```sql
select vault.create_secret('https://<ref-do-projeto>.supabase.co', 'editaliza_api_url');
select vault.create_secret('<SUPABASE_SERVICE_ROLE_KEY do projeto>', 'editaliza_service_role_key');
```

Sem esses segredos o job roda mas não apaga nada (registra um aviso no log do Postgres).
Para conferir:

```sql
select jobname, schedule, command from cron.job;                      -- o job existe
select * from cron.job_run_details order by start_time desc limit 5;  -- últimas execuções
select public.limpar_envios_tmp(60);                                  -- dispara na hora; devolve quantos enviou para apagar
```

Para mudar o horário: `select cron.alter_job((select jobid from cron.job where jobname = 'limpar-envios-tmp'), schedule := '0 * * * *');`

## 3. Auth (Supabase hospedado)

Em *Authentication → URL Configuration*:

- **Site URL**: a mesma `NEXT_PUBLIC_SITE_URL` do ambiente (ex.: `https://editaliza.com.br`).
- **Redirect URLs**: `https://<dominio>/auth/callback` de cada domínio usado (produção, domínio
  `www` se houver, e o padrão dos previews, ex.: `https://*-<time>.vercel.app/auth/callback`).

### SMTP próprio para o link mágico

O SMTP padrão do Supabase serve só para testes (poucos e-mails por hora, só para membros do time).
Em *Authentication → Emails → SMTP Settings*, configure um provedor (Resend, SES, Postmark, etc.):
host, porta, usuário, senha e remetente (ex.: `Editaliza <nao-responda@editaliza.com.br>`), com SPF/DKIM
do domínio configurados no provedor. Depois ajuste *Authentication → Rate Limits → emails por hora*.
Revise os textos do e-mail de "Magic Link" em português em *Emails → Templates*.

### Login com Google

1. No [Google Cloud Console](https://console.cloud.google.com/): crie (ou escolha) um projeto,
   configure a *Tela de consentimento OAuth* (tipo Externo, nome "Editaliza", e-mail de suporte,
   domínio autorizado `editaliza.com.br` e `supabase.co`) e publique-a.
2. Em *APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth*, tipo
   **Aplicativo da Web**:
   - *Origens JavaScript autorizadas*: `https://<dominio>`.
   - *URIs de redirecionamento autorizados*: `https://<ref-do-projeto>.supabase.co/auth/v1/callback`
     (a URL de callback que o painel do Supabase mostra no provedor Google).
3. No Supabase, *Authentication → Sign In / Providers → Google*: ative, cole o *Client ID* e o
   *Client Secret* e salve.
4. Teste o login em produção; o app volta por `/auth/callback`, que já está nas Redirect URLs.

## 4. Depois do deploy

- Faça um envio de edital real e confira em `editais.custo_centavos` que o custo foi gravado.
- Limites em vigor (no servidor): 5 editais novos por usuário em 24 h, 15 leituras de IA por usuário
  em 24 h, 20 URLs de envio por usuário por hora.

## 5. Ainda não neste plano

Pagamentos (Asaas: assinatura, webhooks e chaves `ASAAS_*`) entram no **Plano 3**; nada a configurar agora.
