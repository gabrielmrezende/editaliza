# Editaliza — Plano 1: Núcleo (edital → plano) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um aluno cria conta, envia o PDF de qualquer edital, escolhe o cargo, revisa o conteúdo extraído pela IA, informa data da prova, horas por dia e nível por matéria, e recebe um plano de estudos (hoje / semana / progresso).

**Architecture:** App Next.js (App Router, TypeScript) novo, com Supabase (Auth, Postgres com RLS, Storage). O PDF vai do navegador direto para o Storage (URL assinada); o servidor calcula o hash, reaproveita editais já lidos e chama a API do Claude em segundo plano (`after()`), gravando o status no banco — o navegador consulta o status. O plano é gerado por um módulo puro de TypeScript (sem IA), testado com Vitest.

**Tech Stack:** Next.js (versão atual do `create-next-app@latest`) + TypeScript + Tailwind; `@supabase/supabase-js` + `@supabase/ssr`; Supabase CLI via `npx supabase` (local em Docker); `@anthropic-ai/sdk` + `zod`; `pdf-lib` (contar páginas); Vitest; Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-editaliza-saas-design.md`

### Divisão em planos

O design cobre três subsistemas independentes. Este é o **Plano 1**. Os outros serão escritos depois que este estiver rodando:
- **Plano 2 — Acompanhamento e ajuste:** cronômetro, registros, revisões espaçadas (1, 7, 21, 30 dias), histórico, relatório, tema, ajuste semanal (spec 7.5, 7.6).
- **Plano 3 — Negócio:** teste de 7 dias, Asaas, landing/preços, termos/LGPD, catálogo público com aprovação, versões/retificações, painel admin, pré-carga (spec 7.3, 7.7, 7.8).

Este plano já cria o esquema que os outros usam (versão de edital, `publicado`, custo) para evitar migração cara depois.

## Global Constraints

- Toda a interface em português do Brasil; datas `dd/mm/aaaa` na tela, ISO `aaaa-mm-dd` no código e no banco.
- Nenhum edital escrito no código: todo conteúdo vem do edital enviado.
- A IA roda **uma vez por edital** (listar cargos) e **uma vez por cargo** (extrair conteúdo); resultado guardado e reaproveitado por hash SHA-256 do arquivo.
- Modelo: `claude-opus-5-5`, `output_config.effort: "medium"`, saída validada por schema zod, com `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`).
- Cada plano guarda **cópia própria** do conteúdo (editável); o edital-base nunca muda por edição do aluno.
- Toda checagem de dono/acesso acontece no servidor ou em RLS — nunca só no navegador.
- Limites de envio: PDF ≤ 50 MB, ≤ 600 páginas, ≤ 5 envios de edital **novo** por usuário a cada 24 h (reaproveitamento por hash não conta).
- Fatores de nível: `nunca_vi` 1.5, `basico` 1.0, `domino` 0.6. Reserva final: `max(7, round(0.15 × dias))` dias quando houver ≥ 14 dias até a prova; senão 0.
- Chaves secretas (`ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) só no servidor; nunca com prefixo `NEXT_PUBLIC_`.

## Review Focus

1. **PDF que não é edital ou extração que falha/expira** → status `erro` com mensagem e botão "tentar de novo"; nunca uma tela de "lendo…" infinita. (Task 6)
2. **Data da prova hoje ou no passado** → onboarding recusa com mensagem; o gerador devolve aviso `data_invalida` e usa modo ciclo. (Tasks 7, 9)
3. **Todas as horas da semana zeradas** → não deixa gerar; o gerador devolve aviso `sem_tempo` e nenhum bloco. (Tasks 7, 9)
4. **Mesmo PDF enviado duas vezes ao mesmo tempo** (corrida no `sha256` único) → as duas chamadas terminam no mesmo edital, sem erro 500 nem duplicata. (Task 6)
5. **Aluno apaga todos os tópicos de uma matéria ou todas as matérias na revisão** → matéria vazia é ignorada pelo gerador; a tela não deixa salvar sem ao menos 1 tópico. (Tasks 7, 9)

---

### Task 1: Repositório e projeto Next.js

**Files:**
- Move: `index.html`, `index-etapa2.html`, `index-etapa3.html`, `original.html` → `legado/`
- Create: projeto Next.js na raiz (`src/`, `package.json`, …), `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `.gitignore`
- Modify: `.claude/launch.json`

- [ ] **Step 1:** `git init`; mover os HTMLs para `legado/`.
- [ ] **Step 2:** `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (se reclamar de pasta não vazia, gerar em pasta temporária e mover). Instalar: `@supabase/supabase-js @supabase/ssr @anthropic-ai/sdk zod pdf-lib`; dev: `vitest @playwright/test supabase`.
- [ ] **Step 3:** Scripts no `package.json`: `"test": "vitest run"`, `"test:e2e": "playwright test"`, `"db:reset": "supabase db reset"`. `vitest.config.ts` com alias `@` → `src`, ambiente `node`, incluindo `tests/**/*.test.ts`.
- [ ] **Step 4:** `.env.example` com `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `EXTRACAO_MODO` (`claude` | `fake`). `.gitignore` inclui `.env*.local`.
- [ ] **Step 5:** `.claude/launch.json`: configuração `editaliza` → `npm run dev`, porta 3000 (remover a que aponta para outra pasta).
- [ ] **Step 6:** Teste-sentinela `tests/unit/sanidade.test.ts` (`expect(1+1).toBe(2)`); rodar `npm test` → PASS; `npm run build` → sucesso.
- [ ] **Step 7:** Commit `chore: projeto Next.js e legado movido`.

### Task 2: Banco de dados, Storage e RLS

**Files:**
- Create: `supabase/` (via `npx supabase init`), `supabase/migrations/20261116000000_inicial.sql`, `src/lib/supabase/admin.ts`, `tests/integracao/rls.test.ts`, `tests/integracao/ajuda.ts`

**Interfaces:**
- Produces: tabelas abaixo; `criarClienteAdmin(): SupabaseClient` (service role, só servidor); helper de teste `criarUsuarioTeste(email): Promise<{ id: string; cliente: SupabaseClient }>`.

Esquema (decisões fixas):

| Tabela | Colunas |
|---|---|
| `editais` | `id uuid pk`, `sha256 text unique not null`, `storage_path text not null`, `anthropic_file_id text`, `orgao text`, `banca text`, `ano int`, `data_prova date`, `status text check in ('processando','pronto','erro') not null`, `erro text`, `publicado bool default false`, `versao int default 1`, `edital_origem_id uuid null references editais`, `enviado_por uuid references auth.users`, `custo_centavos int default 0`, `created_at timestamptz default now()` |
| `edital_cargos` | `id uuid pk`, `edital_id uuid references editais on delete cascade`, `nome text not null`, `status_conteudo text check in ('pendente','processando','pronto','erro') default 'pendente'`, `conteudo jsonb` (`ConteudoCargo`), `erro text` |
| `edital_acessos` | `user_id uuid`, `edital_id uuid`, `created_at`, pk (`user_id`,`edital_id`) |
| `planos` | `id uuid pk`, `user_id uuid not null references auth.users`, `edital_id uuid`, `cargo_id uuid`, `edital_versao int`, `ativo bool default true`, `data_prova date null`, `minutos_por_dia int[7] not null`, `conteudo jsonb not null` (`DisciplinaPlano[]`), `gerado jsonb not null` (`PlanoGerado`), `created_at`, `updated_at`; índice único parcial `(user_id) where ativo` |
| `topicos_concluidos` | `plano_id uuid references planos on delete cascade`, `topico_id text`, `concluido_em timestamptz default now()`, pk (`plano_id`,`topico_id`) |

RLS: ligado em todas. `editais`/`edital_cargos`: SELECT se `publicado` ou existe `edital_acessos` do `auth.uid()`; sem INSERT/UPDATE para clientes (só service role). `edital_acessos`: SELECT do próprio. `planos`: SELECT/INSERT/UPDATE/DELETE só `user_id = auth.uid()`. `topicos_concluidos`: via dono do plano. Bucket privado `editais` (sem políticas para clientes, exceto INSERT em `tmp/{auth.uid()}/*`).

- [ ] **Step 1: Teste que falha** — `tests/integracao/rls.test.ts` (exige `npx supabase start`):
  - `usuario B nao le plano de A` → select em `planos` por B retorna `[]`.
  - `usuario nao le edital sem acesso` → edital inserido via admin, não publicado, sem acesso → `[]`; após inserir `edital_acessos` → 1 linha.
  - `edital publicado e visivel a todos`.
  - `cliente nao consegue inserir em editais` → erro.
  - `so um plano ativo por usuario` → segundo insert ativo falha.
- [ ] **Step 2:** `npx supabase start` e `npm test -- tests/integracao` → FAIL (tabelas não existem).
- [ ] **Step 3:** Escrever a migração; `npm run db:reset`.
- [ ] **Step 4:** `npm test -- tests/integracao` → PASS.
- [ ] **Step 5:** Commit `feat: esquema inicial com RLS`.

### Task 3: Login (e-mail e Google)

**Files:**
- Create: `src/lib/supabase/servidor.ts`, `src/lib/supabase/navegador.ts`, `src/proxy.ts` (ou `src/middleware.ts`, conforme a versão do Next instalada), `src/app/entrar/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/app/layout.tsx`, `src/app/app/page.tsx`, `src/app/page.tsx`, `e2e/login.spec.ts`

**Interfaces:**
- Produces: `criarClienteServidor(): Promise<SupabaseClient>` (cookies), `criarClienteNavegador(): SupabaseClient`, `exigirUsuario(): Promise<User>` (redireciona para `/entrar` se não logado); helper e2e `entrar(page: Page, email: string): Promise<void>` em `e2e/ajuda.ts` (faz o login pelo Mailpit).

Decisões: login por **link mágico no e-mail** e **Google** (OAuth do Supabase). Tudo sob `/app/*` exige login. `/app` redireciona para `/app/plano` se houver plano ativo, senão `/app/novo`. A configuração do Google (client ID) é feita pelo dono no painel do Supabase; localmente só o e-mail é testado. Consultar a doc atual de `@supabase/ssr` para Next (context7) antes de escrever.

- [ ] **Step 1: Teste e2e que falha** — `e2e/login.spec.ts`: visitar `/app` → redireciona para `/entrar`; preencher e-mail, enviar; ler o link no Mailpit local (`http://127.0.0.1:54324`, API de mensagens); abrir o link → chega em `/app/novo`.
- [ ] **Step 2:** `npm run test:e2e -- login` → FAIL.
- [ ] **Step 3:** Implementar clientes, proxy de sessão, página `/entrar` (campo e-mail + botão Google), callback e layout protegido.
- [ ] **Step 4:** `npm run test:e2e -- login` → PASS.
- [ ] **Step 5:** Commit `feat: login por e-mail e Google`.

### Task 4: Tipos de domínio e schemas

**Files:**
- Create: `src/lib/dominio/tipos.ts`, `src/lib/dominio/esquemas.ts`, `tests/unit/esquemas.test.ts`

**Interfaces — Produces** (usados por todas as tasks seguintes):

```ts
export type Nivel = 'nunca_vi' | 'basico' | 'domino';
export interface Topico { id: string; nome: string }
export interface Disciplina { id: string; nome: string; questoes: number | null; pontos: number | null; topicos: Topico[] }
export interface ConteudoCargo { disciplinas: Disciplina[]; tipoProva: 'multipla_escolha' | 'certo_errado' | 'discursiva' | 'mista'; pesosInformados: boolean }
export interface EditalResumo { orgao: string; banca: string | null; ano: number | null; dataProva: string | null; cargos: { nome: string }[] }
export interface DisciplinaPlano extends Disciplina { nivel: Nivel }
export type MinutosPorDia = [number, number, number, number, number, number, number]; // índice = Date.getDay() (0 = domingo)
export interface EntradaPlano { disciplinas: DisciplinaPlano[]; dataProva: string | null; hoje: string; minutosPorDia: MinutosPorDia; concluidos: string[] }
export interface BlocoEstudo { disciplinaId: string; topicoId: string | null; tipo: 'estudo' | 'revisao_geral' | 'simulado'; minutos: number }
export interface DiaPlano { data: string; blocos: BlocoEstudo[] }
export type Aviso = { tipo: 'nao_cabe'; topicosFora: string[] } | { tipo: 'pesos_assumidos' } | { tipo: 'sem_tempo' } | { tipo: 'data_invalida' };
export type PlanoGerado =
  | { modo: 'prazo'; dias: DiaPlano[]; inicioReserva: string | null; avisos: Aviso[] }
  | { modo: 'ciclo'; ciclo: { disciplinaId: string; minutos: number }[]; avisos: Aviso[] };
```

`esquemas.ts` exporta zod: `EsquemaEditalResumo`, `EsquemaConteudoCargoIA` (formato que a IA devolve: disciplinas com `nome`, `questoes`, `pontos`, `topicos: string[]` — **sem ids**), `EsquemaDisciplinaPlano`, `EsquemaEntradaCriarPlano`. E `atribuirIds(ia: ConteudoCargoIA): ConteudoCargo` — ids estáveis `d{i}` e `d{i}-t{j}`.

- [ ] **Step 1: Teste que falha** — `atribuirIds` gera `d0`, `d0-t0`, `d0-t1`, `d1-t0`; `EsquemaConteudoCargoIA` rejeita `questoes: -1`; `EsquemaEntradaCriarPlano` rejeita `minutosPorDia` com 6 itens ou valor > 1440.
- [ ] **Step 2:** `npm test -- esquemas` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test -- esquemas` → PASS.
- [ ] **Step 5:** Commit `feat: tipos e schemas do domínio`.

### Task 5: Leitura do edital pela IA

**Files:**
- Create: `src/lib/extracao/index.ts`, `src/lib/extracao/claude.ts`, `src/lib/extracao/fake.ts`, `src/lib/extracao/prompts.ts`, `tests/fixtures/extracao-fake.json`, `tests/unit/extracao-fake.test.ts`

**Interfaces:**
- Consumes: `EsquemaEditalResumo`, `EsquemaConteudoCargoIA` (Task 4).
- Produces:
```ts
export interface Extrator {
  enviarArquivo(pdf: Buffer): Promise<string>; // devolve file_id
  listarCargos(fileId: string): Promise<{ resumo: EditalResumo; custoCentavos: number }>;
  extrairConteudo(fileId: string, cargo: string): Promise<{ conteudo: ConteudoCargoIA; custoCentavos: number }>;
}
export function obterExtrator(): Extrator; // EXTRACAO_MODO=fake → fake; senão claude
export class EditalInvalidoError extends Error {} // PDF não parece edital / nenhum cargo
```

Decisões:
- **Duas chamadas** (econômico e alinhado ao fluxo): `listarCargos` lê o edital e devolve o resumo com os cargos; `extrairConteudo` lê o conteúdo programático só do cargo escolhido.
- PDF enviado pela **Files API** (`client.files.upload` com `toFile(buffer, 'edital.pdf', { type: 'application/pdf' })`, sem beta) e referenciado como `{ type: 'document', source: { type: 'file', file_id } }` — evita o limite de 32 MB por requisição.
- Chamada: `client.beta.messages.stream({ model: 'claude-opus-5-5', max_tokens: 64000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: zodOutputFormat(Esquema) }, ... })` → `finalMessage()`; checar `stop_reason` (`refusal`/`max_tokens` → erro) e validar o texto com o schema zod. Se os tipos do SDK reclamarem, ajustar pelo erro do compilador.
- Prompts (em `prompts.ts`) exigem: só o que está no edital, nada inventado; tópicos na ordem do edital; `questoes`/`pontos` `null` quando o edital não informa; `cargos: []` se o documento não for um edital → `EditalInvalidoError`.
- `custoCentavos` calculado de `usage` (US$ 4 / 1M entrada, US$ 20 / 1M saída; câmbio fixo em constante `DOLAR_EM_CENTAVOS = 550`).
- Fake: lê `tests/fixtures/extracao-fake.json` (1 edital, 2 cargos "Cargo A" e "Cargo B", 3 disciplinas com 2–4 tópicos, pesos informados). `enviarArquivo` devolve `fake-invalido` quando o título do PDF (metadado lido com `pdf-lib`) é `INVALIDO`, senão `fake-ok`; `listarCargos('fake-invalido')` lança `EditalInvalidoError`.
- Sem teste automatizado contra a API real (custa dinheiro). Validação manual na Task 10 com um edital real, com permissão do dono.

- [ ] **Step 1: Teste que falha** — com `EXTRACAO_MODO=fake`, `obterExtrator().listarCargos('x')` devolve 2 cargos; `extrairConteudo('x','Cargo A')` passa em `EsquemaConteudoCargoIA`.
- [ ] **Step 2:** `npm test -- extracao` → FAIL.
- [ ] **Step 3:** Implementar fake, prompts e `claude.ts`.
- [ ] **Step 4:** `npm test -- extracao` → PASS; `npx tsc --noEmit` → sem erros.
- [ ] **Step 5:** Commit `feat: extração de edital via Claude`.

### Task 6: Envio do edital, reaproveitamento e processamento

**Files:**
- Create: `src/lib/editais/hash.ts`, `src/lib/editais/servico.ts`, `src/lib/editais/limites.ts`, `src/app/api/editais/url-envio/route.ts`, `src/app/api/editais/route.ts`, `src/app/api/editais/[id]/route.ts`, `src/app/api/editais/[id]/cargos/[cargoId]/route.ts`, `tests/integracao/editais.test.ts`, `tests/fixtures/edital-exemplo.pdf` e `tests/fixtures/edital-invalido.pdf` (PDFs de 1 página criados com `pdf-lib` por `tests/fixtures/gerar-pdfs.ts`; o inválido tem título `INVALIDO`)

**Interfaces:**
- Consumes: `obterExtrator`, `EditalInvalidoError` (Task 5); `criarClienteAdmin` (Task 2); `exigirUsuario` (Task 3).
- Produces (HTTP):
  - `POST /api/editais/url-envio` → `{ caminho: string; url: string }` (upload assinado para `tmp/{userId}/{uuid}.pdf`).
  - `POST /api/editais` body `{ caminho }` → `202 { editalId, status }`.
  - `GET /api/editais/:id` → `{ status, erro, resumo: { orgao, banca, ano, dataProva }, cargos: { id, nome, statusConteudo }[] }`.
  - `POST /api/editais/:id/cargos/:cargoId` → `202` (dispara extração do conteúdo se `pendente` ou `erro`; se `pronto`, devolve `200`).
  - `GET /api/editais/:id/cargos/:cargoId` → `{ statusConteudo, erro, conteudo: ConteudoCargo | null }`.
  - `POST /api/editais/:id/tentar-novamente` → refaz `listarCargos` se `status = 'erro'`.
- Funções de serviço: `receberEdital(userId, caminho): Promise<{ editalId: string; novo: boolean }>`, `processarCargos(editalId): Promise<void>`, `processarConteudo(cargoId): Promise<void>`.

Decisões:
- O PDF **nunca passa pelo corpo da requisição do Next** (limite de ~4,5 MB na Vercel): o navegador sobe direto para o Storage com a URL assinada.
- `receberEdital`: baixa de `tmp/`, valida ≤ 50 MB e ≤ 600 páginas (`pdf-lib`; arquivo que não abre como PDF → 400 "arquivo não é um PDF válido"), calcula SHA-256. Se o hash já existe → grava `edital_acessos` e devolve o existente (`novo: false`), sem contar no limite. Se não → checa limite de 5 novos/24 h (429 com mensagem), move para `editais/{sha256}.pdf`, `enviarArquivo`, insere com `status 'processando'` usando `insert ... on conflict (sha256) do nothing` e relê pelo hash (resolve a corrida do Review Focus 4), grava acesso, e agenda `processarCargos` com `after()` de `next/server`. Apaga o arquivo de `tmp/`.
- Rotas de processamento: `export const maxDuration = 300`.
- Falha da IA ou timeout → `status 'erro'` e `erro` em português ("Não conseguimos ler este edital. Tente de novo ou envie outro arquivo."). `EditalInvalidoError` → "Este arquivo não parece ser um edital de concurso."
- Edital `processando` há mais de 10 min é tratado como `erro` no `GET` (evita espera infinita se a função morrer).
- `custo_centavos` acumulado no edital a cada chamada.

- [ ] **Step 1: Testes que falham** — `tests/integracao/editais.test.ts` (Supabase local, `EXTRACAO_MODO=fake`, chamando as funções de serviço):
  - `mesmo pdf duas vezes reaproveita` → segundo `receberEdital` devolve o mesmo id com `novo: false`.
  - `envios simultaneos do mesmo pdf geram um edital` → `Promise.all` de duas chamadas → mesmo id, 1 linha em `editais`.
  - `processarCargos grava cargos e status pronto`.
  - `pdf invalido marca erro com mensagem` (fake com edital marcado inválido) → `status 'erro'`, `erro` preenchido.
  - `sexto edital novo em 24h e recusado`.
  - `arquivo que nao e pdf e recusado`.
- [ ] **Step 2:** `npm test -- editais` → FAIL.
- [ ] **Step 3:** Implementar serviço e rotas.
- [ ] **Step 4:** `npm test -- editais` → PASS.
- [ ] **Step 5:** Commit `feat: envio e processamento de editais`.

### Task 7: Gerador do plano

**Files:**
- Create: `src/lib/plano/constantes.ts`, `src/lib/plano/prioridade.ts`, `src/lib/plano/gerar.ts`, `tests/unit/gerar-plano.test.ts`

**Interfaces:**
- Consumes: tipos da Task 4.
- Produces: `gerarPlano(entrada: EntradaPlano): PlanoGerado`; `prioridade(d: DisciplinaPlano, pesosInformados: boolean): number`.

Algoritmo (decidido aqui):
- `peso = pesosInformados ? (questoes ?? pontos ?? 1) : 1`; `prioridade = peso × FATOR[nivel]` (1.5 / 1.0 / 0.6). Se nenhuma disciplina tem `questoes` nem `pontos`, aviso `pesos_assumidos`.
- Disciplinas sem tópicos pendentes (vazias ou todas concluídas) são ignoradas.
- Soma de `minutosPorDia` = 0 → `{ modo: dataProva ? 'prazo' : 'ciclo', …vazio, avisos: [sem_tempo] }`.
- `dataProva` nula → **modo ciclo**: `minutos = arredondar para múltiplo de 15 (totalSemanal × prio / Σprio)`, mínimo 30; ordenado por prioridade desc.
- `dataProva <= hoje` → aviso `data_invalida` e modo ciclo.
- **Modo prazo:** dias de `hoje` até `dataProva - 1`. Reserva = últimos `max(7, round(0.15 × nDias))` dias se `nDias ≥ 14`, senão 0. Nos dias de reserva: o último dia de cada bloco de 7 é `simulado` (todos os minutos do dia); os demais são `revisao_geral`, um bloco por dia, alternando disciplinas por ordem de prioridade.
- Fase de estudo: `alvo(d) = minutosEstudo × prio(d) / Σprio`; `minutosTopico = max(45, alvo(d) / nTopicosPendentes(d))`. Se `Σ minutosTopico > minutosEstudo` → remove tópicos do fim (ordem do edital) das disciplinas de **menor** prioridade, um por vez, até caber; os removidos vão em `nao_cabe.topicosFora`.
- Agenda: cada tópico vira pedaços de até 60 min. Para cada dia, enquanto houver minutos livres: escolher a disciplina com maior déficit relativo `(alvo − alocado) / alvo`, evitando repetir a disciplina do bloco anterior quando houver outra; pegar o próximo pedaço do tópico atual dela; se não couber inteiro, divide e o resto vai para o dia seguinte. Dias com 0 minutos ficam com `blocos: []`.

- [ ] **Step 1: Testes que falham** — `tests/unit/gerar-plano.test.ts` (datas fixas, sem `Date.now()`):
  - `nunca excede os minutos do dia` → para cada dia, Σ blocos ≤ `minutosPorDia[getDay]`.
  - `nenhum bloco na data da prova ou depois`.
  - `materia nunca_vi recebe mais tempo que domino com mesmo peso`.
  - `peso maior recebe mais tempo com mesmo nivel`.
  - `reserva final tem pelo menos 7 dias e so revisao ou simulado` (prova em 60 dias).
  - `sem reserva quando faltam menos de 14 dias`.
  - `todo topico aparece quando ha tempo de sobra`.
  - `quando nao cabe avisa e corta da materia de menor prioridade` (prova em 5 dias, 1 h/dia).
  - `topicos concluidos nao entram no plano`.
  - `sem data de prova gera ciclo proporcional e multiplo de 15`.
  - `data da prova hoje ou no passado gera aviso data_invalida e ciclo` (Review Focus 2).
  - `semana toda zerada gera aviso sem_tempo e nenhum bloco` (Review Focus 3).
  - `materia sem topicos e ignorada sem erro` (Review Focus 5).
  - `sem pesos informados usa peso igual e avisa`.
  - `mesma entrada gera o mesmo plano` (determinismo).
- [ ] **Step 2:** `npm test -- gerar-plano` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test -- gerar-plano` → PASS.
- [ ] **Step 5:** Commit `feat: gerador de plano por regras`.

### Task 8: Consultas do plano (hoje, semana, progresso)

**Files:**
- Create: `src/lib/plano/consultas.ts`, `tests/unit/consultas.test.ts`

**Interfaces:**
- Consumes: `PlanoGerado`, `DisciplinaPlano` (Task 4).
- Produces:
```ts
export function tarefasDoDia(plano: PlanoGerado, data: string, posicaoCiclo?: number): BlocoEstudo[];
export function semana(plano: PlanoGerado, inicio: string): DiaPlano[]; // 7 dias a partir de inicio
export function progresso(disciplinas: DisciplinaPlano[], concluidos: string[]): { total: number; concluidos: number; porDisciplina: Record<string, { total: number; concluidos: number }> };
```
No modo ciclo, `tarefasDoDia` devolve o item do ciclo em `posicaoCiclo` (padrão 0) como um bloco `estudo` com `topicoId: null`; a tela mostra o primeiro tópico pendente daquela disciplina.

- [ ] **Step 1: Testes que falham** — dia sem estudo → `[]`; data fora do plano → `[]`; `semana` sempre 7 itens; `progresso` conta corretamente e ignora ids concluídos que não existem mais no conteúdo.
- [ ] **Step 2:** `npm test -- consultas` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test -- consultas` → PASS.
- [ ] **Step 5:** Commit `feat: consultas do plano`.

### Task 9: Telas de entrada e do plano

**Files:**
- Create: `src/app/app/novo/page.tsx`, `src/components/onboarding/EnvioEdital.tsx`, `EscolhaCargo.tsx`, `RevisaoConteudo.tsx`, `Disponibilidade.tsx`, `NivelMaterias.tsx`, `src/app/api/planos/route.ts`, `src/app/api/planos/[id]/topicos/[topicoId]/route.ts`, `src/app/app/plano/page.tsx`, `src/components/plano/Hoje.tsx`, `Semana.tsx`, `Progresso.tsx`, `e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: rotas da Task 6, `gerarPlano` (Task 7), consultas (Task 8), `EsquemaEntradaCriarPlano` (Task 4).
- Produces (HTTP):
  - `POST /api/planos` body `{ editalId, cargoId, dataProva: string | null, minutosPorDia: MinutosPorDia, disciplinas: DisciplinaPlano[] }` → valida com zod, confere acesso ao edital, desativa o plano ativo anterior, gera com `gerarPlano` **no servidor** e grava → `201 { planoId }`.
  - `PUT` / `DELETE /api/planos/:id/topicos/:topicoId` → marca / desmarca concluído.

Fluxo (spec 7.1), uma página com etapas no cliente:
1. **Envio:** escolher PDF → `url-envio` → upload → `POST /api/editais` → tela "Lendo seu edital…" consultando `GET` a cada 3 s; em `erro`, mensagem + "Tentar de novo" + "Enviar outro arquivo" (Review Focus 1).
2. **Cargo:** lista de cargos; ao escolher, `POST` cargo e consulta até `pronto`.
3. **Revisão:** matérias e tópicos editáveis (renomear, adicionar, remover, editar nº de questões); aviso quando `pesosInformados = false`; não avança se não restar ao menos 1 tópico (Review Focus 5).
4. **Data da prova:** pré-preenchida com `dataProva` do edital; opção "ainda não saiu"; recusa data ≤ hoje (Review Focus 2).
5. **Horas por dia:** 7 campos em horas (aceita 1,5), padrão Seg–Sex 2 h, Sáb 4 h, Dom 0; não avança com total 0 (Review Focus 3).
6. **Nível por matéria:** três botões por matéria, padrão `basico`.
7. **Gerar** → `POST /api/planos` → `/app/plano`.

Tela do plano: **Hoje** (blocos do dia com matéria, tópico, minutos e caixa "concluí este tópico"), **Semana** (7 dias), **Progresso** (% do edital e por matéria), avisos do plano em destaque (`nao_cabe` lista quantos tópicos ficaram de fora). Funciona no celular (layout de uma coluna < 640 px). Visual: usar a skill `frontend-design:frontend-design`; limpo, sem cara de template.

- [ ] **Step 1: Teste e2e que falha** — `e2e/onboarding.spec.ts` com `EXTRACAO_MODO=fake`: login (helper da Task 3) → enviar `edital-exemplo.pdf` → escolher "Cargo A" → remover um tópico → data daqui a 90 dias → horas padrão → nível → gerar → em `/app/plano` aparece "Hoje" com ao menos 1 bloco (ou mensagem de dia livre) e progresso "0%". Segundo teste: data no passado mostra erro e não avança. Terceiro: todas as horas zeradas não deixa avançar.
- [ ] **Step 2:** `npm run test:e2e -- onboarding` → FAIL.
- [ ] **Step 3:** Implementar rotas e telas.
- [ ] **Step 4:** `npm run test:e2e -- onboarding` → PASS; `npm test` → tudo PASS; `npm run build` → sucesso.
- [ ] **Step 5:** Commit `feat: onboarding e tela do plano`.

### Task 10: Verificação com edital real

**Files:** nenhum novo (só ajustes em `prompts.ts` se a extração errar).

- [ ] **Step 1:** Pedir ao dono uma `ANTHROPIC_API_KEY` em `.env.local` e permissão para gastar (estimativa: poucos reais) com 2 editais reais de áreas diferentes (ex.: um tribunal e um de área policial), baixados do site oficial pelo dono.
- [ ] **Step 2:** `EXTRACAO_MODO=claude npm run dev`; rodar o fluxo completo no navegador com cada edital.
- [ ] **Step 3:** Conferir com o dono: cargos todos listados; matérias e tópicos do cargo batem com o conteúdo programático; pesos corretos; `custo_centavos` registrado. Ajustar prompts se necessário.
- [ ] **Step 4:** Commit `fix: ajustes de prompt após teste com editais reais` (se houve ajuste).

---

## Notas de escopo para o dono

- **Divisão longa de PDF adiada:** a API atual aceita até 600 páginas por requisição, o que cobre praticamente todos os editais. Arquivos maiores são recusados com mensagem clara; dividir em partes fica para quando aparecer um caso real.
- **Fallback de modelo ligado:** se o modelo principal recusar uma leitura, a API tenta automaticamente outro modelo na mesma chamada.
