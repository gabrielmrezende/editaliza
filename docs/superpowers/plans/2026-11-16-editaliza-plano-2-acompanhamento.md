# Editaliza — Plano 2: Acompanhamento e ajuste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O aluno registra o que estudou (cronômetro, registro manual e rápido), recebe revisões espaçadas com agenda, vê histórico e relatório, escolhe tema claro/escuro, e o plano se ajusta toda semana com um resumo do que mudou e por quê.

**Architecture:** Três tabelas novas (`sessoes_estudo`, `revisoes`, `ajustes_plano`) com RLS só de leitura para o dono; escrita sempre pelas rotas de API com service role, gravações compostas em funções SQL transacionais. Regras em módulos puros de TypeScript (cronômetro, revisões, relatório, ciclo, ajuste), testados com Vitest. O ajuste semanal reaproveita `gerarPlano` (com multiplicadores por matéria), rodando preguiçosamente ao abrir o plano ou no botão.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components — ler `node_modules/next/dist/docs/` antes de escrever páginas/rotas), React 19.3, Tailwind 4, Supabase (`@supabase/ssr`, `supabase-js`), zod 4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-16-editaliza-plano-2-acompanhamento-design.md` (e a base `docs/superpowers/specs/2026-11-16-editaliza-saas-design.md`). Decisões e pendências do Plano 1: `docs/superpowers/decisoes-plano-1.md`.

## Global Constraints

- Interface em pt-BR; datas `dd/mm/aaaa` (ou por extenso) na tela, ISO `aaaa-mm-dd` no código e no banco; "hoje" sempre `hojeEmSaoPaulo()` (`src/lib/datas.ts`) calculado **no servidor** para gravar.
- Escrita só pelo servidor: tabelas novas têm RLS com SELECT do dono e **nenhum** GRANT de INSERT/UPDATE/DELETE para `authenticated`/`anon` (padrão R5/I6 do Plano 1).
- Toda rota que grava estudo chama `exigirPodeRegistrar(userId)` (ponto único onde o Plano 3 porá a assinatura).
- Revisões: intervalos `[1, 7, 21, 30]` dias; sem duplicar pendente (mesmo plano + tópico + intervalo).
- Sessão: `minutos` inteiro 0–1440 (0 só com questões), `acertos`/`erros` inteiros ≥ 0 (≤ 10 000), observação ≤ 1000, data ≤ hoje e ≥ hoje − 365, no máximo 200 sessões por usuário por dia (data de criação).
- Tipos de sessão: `teoria`, `questoes`, `revisao`, `simulado`, `lei_seca`, `jurisprudencia`, `discursiva` (ou nulo). Origens: `cronometro`, `manual`, `rapido`.
- Ajuste: a cada ≥ 7 dias (preguiçoso) ou botão (no máximo 1 por 60 min); acerto em 28 dias com ≥ 10 questões: < 60% ×1,25, ≥ 80% ×0,85; ≥ 2 revisões atrasadas ×1,1; produto limitado a [0,8; 1,4]; recalculado do zero.
- Cronômetro: rascunho em `localStorage` na chave `editaliza:cronometro:{userId}`; aviso de esquecido acima de 6 h.
- Tema: chave `editaliza:tema` (`light` | `dark`), padrão `prefers-color-scheme`, contraste WCAG AA (≥ 4,5:1 texto normal).
- Celular primeiro: alvos ≥ 44 px, nada de rolagem lateral em 375 px.
- Testes: `npm test` exige `npx supabase start`; e2e com `EXTRACAO_MODO=fake` (já no `playwright.config.ts`).

## Review Focus

1. **Cronômetro ligado por mais de 24 h** (aluno esqueceu) → ao parar, minutos limitados a 1440, aviso de esquecido, campo editável; nunca grava valor inválido. (Task 2)
2. **Registro perto da meia-noite** (23h30 em São Paulo = 02h30 UTC do dia seguinte) → a data padrão e o limite "não no futuro" usam o dia de São Paulo. (Task 7)
3. **Excluir uma sessão cujas revisões já foram parcialmente concluídas** → as concluídas ficam, as pendentes dela somem; revisões de outras sessões do mesmo tópico não são tocadas. (Task 7)
4. **Duas abas abrem o plano vencido ao mesmo tempo** → um único ajuste é gravado; a outra aba mostra o plano já ajustado, sem erro. (Task 9)
5. **Matéria/tópico que deixou de existir** (plano novo do mesmo cargo sem aquele tópico) → a sessão continua no histórico com o nome guardado; editar não permite trocar a matéria; relatório não quebra. (Tasks 1, 7, 14)

---

### Task 1: Banco — tabelas de acompanhamento, funções e troca de plano

**Files:**
- Create: `supabase/migrations/20261117000000_acompanhamento.sql`
- Create: `tests/integracao/acompanhamento-rls.test.ts`
- Modify: `tests/integracao/planos.test.ts` (troca de plano move sessões/revisões)

**Interfaces:**
- Produces (tabelas, exatamente como no spec §8): `sessoes_estudo`, `revisoes`, `ajustes_plano`; `planos` + `ajustado_em timestamptz null`, `ajustes jsonb not null default '{}'`, `ciclo_inicio jsonb null`.
- Produces (funções, `security invoker`, `set search_path = ''`, EXECUTE só para `service_role`):
  - `registrar_sessao(p_user uuid, p_plano uuid, p_sessao jsonb, p_revisoes jsonb, p_concluir boolean) returns uuid` — insere a sessão (chaves do jsonb = nomes das colunas), insere cada `{intervalo, data_revisao}` de `p_revisoes` como revisão `origem='sessao'`, `sessao_id` = nova sessão, com `on conflict (plano_id, topico_id, intervalo) where concluida_em is null do nothing`; se `p_concluir`, upsert em `topicos_concluidos`. Devolve o id da sessão.
  - `excluir_sessao(p_user uuid, p_sessao uuid) returns boolean` — apaga revisões pendentes com `sessao_id = p_sessao` e depois a sessão (só se `user_id = p_user`); false se não existia.
  - `aplicar_ajuste(p_plano uuid, p_ajustado_lido timestamptz, p_gerado jsonb, p_ajustes jsonb, p_ciclo_inicio jsonb, p_janela_inicio date, p_janela_fim date, p_resumo jsonb, p_gerado_anterior jsonb, p_multiplicadores jsonb, p_agora timestamptz) returns uuid` — `update planos set gerado, ajustes, ciclo_inicio, ajustado_em = p_agora, updated_at = p_agora where id = p_plano and ativo and ajustado_em is not distinct from p_ajustado_lido`; se nenhuma linha, devolve null; senão insere em `ajustes_plano` e devolve o id.
  - `criar_plano(...)` (mesma assinatura): além do que já faz, quando há plano anterior do mesmo cargo, na mesma transação `update sessoes_estudo set plano_id = v_id where plano_id = v_anterior and disciplina_id in (ids de disciplina de p_conteudo)` e `update revisoes set plano_id = v_id where plano_id = v_anterior and concluida_em is null and topico_id in (ids de tópico de p_conteudo)`.

- [ ] **Step 1: Testes que falham** — `tests/integracao/acompanhamento-rls.test.ts` (usa `admin()`, `criarUsuarioTeste`, `emailUnico` de `tests/integracao/ajuda.ts`; cria plano via `admin().from('planos').insert(...)`):
  - `dono lê as próprias sessões e revisões; outro usuário lê []`.
  - `cliente autenticado não insere, altera nem apaga sessoes_estudo, revisoes, ajustes_plano` → cada operação pelo `cliente` retorna erro (permission denied) ou 0 linhas.
  - `registrar_sessao não duplica revisão pendente` → duas chamadas com o mesmo tópico e `[{intervalo:1,...},{intervalo:7,...}]` → 2 revisões pendentes, 2 sessões.
  - `registrar_sessao com p_concluir grava topicos_concluidos`.
  - `excluir_sessao apaga só as pendentes da sessão` → conclui a revisão de 1 dia (via admin), exclui a sessão → revisão de 1 dia continua com `sessao_id` null (on delete set null), a de 7 dias sumiu.
  - `aplicar_ajuste com ajustado_em velho devolve null e não grava` → duas chamadas com o mesmo `p_ajustado_lido` → a 1ª devolve uuid, a 2ª null; `ajustes_plano` tem 1 linha.
  - check constraints: `minutos = 0` e `acertos + erros = 0` → erro; `observacao` com 1001 caracteres → erro; `tipo = 'outro'` → erro.
  - Em `planos.test.ts`: `novo plano do mesmo cargo leva sessões e revisões pendentes` → sessão de `d0` e de `d9` (inexistente no conteúdo novo), revisão pendente de `d0-t0` e concluída de `d0-t0`; após `criarPlano` do mesmo cargo: sessão `d0` e revisão pendente apontam para o plano novo; sessão `d9` e revisão concluída ficam no antigo.
- [ ] **Step 2:** `npx supabase db reset` e `npx vitest run tests/integracao/acompanhamento-rls.test.ts` → FAIL (tabelas não existem).
- [ ] **Step 3: Migração** `20261117000000_acompanhamento.sql`: tabelas, checks, índices (spec §8; mais `revisoes (user_id, data_revisao)`), RLS `select to authenticated using (user_id = (select auth.uid()))` nas três (em `ajustes_plano`, via dono do plano), `revoke insert, update, delete on ... from anon, authenticated`, colunas novas em `planos`, as quatro funções.
- [ ] **Step 4:** `npx supabase db reset` e `npm test` → PASS (inclui os 159 testes existentes).
- [ ] **Step 5: Commit** `feat(db): sessões de estudo, revisões e ajustes do plano`

### Task 2: Cronômetro (módulo puro)

**Files:**
- Create: `src/lib/acompanhamento/cronometro.ts`, `tests/unit/cronometro.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EstadoCronometro { rodando: boolean; iniciadoEm: number | null; acumuladoSeg: number }
  export const PARADO: EstadoCronometro; // { rodando: false, iniciadoEm: null, acumuladoSeg: 0 }
  export function iniciar(e: EstadoCronometro, agora: number): EstadoCronometro; // também retoma
  export function pausar(e: EstadoCronometro, agora: number): EstadoCronometro;
  export function segundosDecorridos(e: EstadoCronometro, agora: number): number;
  export function minutosParaRegistro(segundos: number): number; // Math.round(seg/60), limitado a 1440
  export const ESQUECIDO_SEG = 6 * 3600;
  export interface FormularioRascunho { disciplinaId: string | null; topicoId: string | null; tipo: string | null; acertos: string; erros: string; observacao: string; intervalos: number[]; concluir: boolean }
  export interface Rascunho { versao: 1; estado: EstadoCronometro; formulario: FormularioRascunho; atualizadoEm: number }
  export function chaveRascunho(userId: string): string; // `editaliza:cronometro:${userId}`
  export function validarRascunho(valor: unknown, agora: number): Rascunho | null;
  ```
- [ ] **Step 1: Testes que falham:**
  - `iniciar → pausar acumula` → `pausar(iniciar(PARADO, 0), 90_000).acumuladoSeg === 90`, `rodando === false`.
  - `retomar soma ao acumulado` → iniciar 0, pausar 60 000, iniciar 100 000, `segundosDecorridos(_, 130_000) === 90`.
  - `pausar parado não muda nada`; `iniciar rodando não reinicia` (mesmo `iniciadoEm`).
  - `minutosParaRegistro`: 29 → 0, 30 → 1, 89 → 1, 90 → 2, 25 × 3600 → 1440.
  - `validarRascunho` devolve null para: `null`, string, `acumuladoSeg: -1`, `rodando: true` com `iniciadoEm: null`, `iniciadoEm` no futuro (> agora + 60 000), parado com `acumuladoSeg: 0`, `versao: 2`, `intervalos` com valor fora de `[1,7,21,30]`; e devolve o objeto para um rascunho rodando válido.
  - `chaveRascunho('u1') === 'editaliza:cronometro:u1'`.
- [ ] **Step 2:** `npx vitest run tests/unit/cronometro.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `cronometro.ts` (funções puras, sem `Date.now()` interno; `validarRascunho` com zod).
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(acompanhamento): regras do cronômetro`

### Task 3: Revisões e tipos de acompanhamento (módulo puro)

**Files:**
- Create: `src/lib/dominio/acompanhamento.ts`, `src/lib/acompanhamento/revisoes.ts`, `tests/unit/revisoes.test.ts`
- Modify: `src/lib/dominio/esquemas.ts`, `tests/unit/esquemas.test.ts`

**Interfaces:**
- Produces (`src/lib/dominio/acompanhamento.ts`):
  ```ts
  export const TIPOS_SESSAO = ['teoria','questoes','revisao','simulado','lei_seca','jurisprudencia','discursiva'] as const;
  export type TipoSessao = (typeof TIPOS_SESSAO)[number];
  export type OrigemSessao = 'cronometro' | 'manual' | 'rapido';
  export const INTERVALOS_REVISAO = [1, 7, 21, 30] as const;
  export interface Sessao { id: string; planoId: string | null; data: string; disciplinaId: string; disciplinaNome: string; topicoId: string | null; topicoNome: string | null; minutos: number; acertos: number; erros: number; tipo: TipoSessao | null; observacao: string | null; origem: OrigemSessao; criadaEm: string }
  export interface Revisao { id: string; planoId: string; disciplinaId: string; disciplinaNome: string; topicoId: string; topicoNome: string; dataEstudo: string; dataRevisao: string; intervalo: number; sessaoId: string | null; origem: 'sessao' | 'conclusao'; concluidaEm: string | null }
  export function sessaoDaLinha(l: Record<string, unknown>): Sessao;   // snake_case do banco → camelCase
  export function revisaoDaLinha(l: Record<string, unknown>): Revisao;
  ```
- Produces (`esquemas.ts`): `EsquemaNovaSessao` = `{ planoId: uuid, data: iso date, disciplinaId: string 1–64, topicoId: string 1–64 | null, minutos: int 0–1440, acertos: int 0–10000 (default 0), erros: idem, tipo: enum TIPOS_SESSAO | null, observacao: string trim ≤ 1000 | null (vazia → null), origem: enum OrigemSessao, intervalos: array de INTERVALOS_REVISAO sem repetição (default []), concluir: boolean (default false) }` com refine `minutos > 0 || acertos + erros > 0` (mensagem "Informe o tempo ou as questões.") e `intervalos`/`concluir` só com `topicoId`; `EsquemaEdicaoSessao` = parcial de `data, disciplinaId, topicoId, minutos, acertos, erros, tipo, observacao` (≥ 1 campo).
- Produces (`revisoes.ts`):
  ```ts
  export function revisoesParaCriar(topicoId: string, dataEstudo: string, intervalos: readonly number[], pendentes: { topicoId: string; intervalo: number }[]): { intervalo: number; dataRevisao: string }[];
  export interface Agenda { atrasadas: Revisao[]; hoje: Revisao[]; semana: Revisao[]; proximas: Revisao[]; concluidas: Revisao[] }
  export function agruparAgenda(revisoes: Revisao[], hoje: string): Agenda;
  export function diasDeAtraso(r: Revisao, hoje: string): number;
  export const MINUTOS_POR_REVISAO = 15;
  ```
- [ ] **Step 1: Testes que falham:**
  - `revisoesParaCriar('t1','2026-11-16',[1,7,21,30],[])` → datas `2026-11-17`, `2026-11-23`, `2026-12-07`, `2026-12-16`.
  - com pendente `{t1, 7}` → só 1, 21, 30; pendente de outro tópico não interfere.
  - `agruparAgenda` com hoje `2026-11-16`: revisão de `2026-11-14` → atrasadas (`diasDeAtraso === 2`); `2026-11-16` → hoje; `2026-11-23` → semana; `2026-11-24` → proximas; concluída há 10 dias → concluidas; concluída há 31 dias → fora; cada grupo ordenado por `dataRevisao` e depois `disciplinaNome`; concluidas da mais recente para a mais antiga.
  - Esquemas: sessão sem tempo e sem questões → erro com a mensagem; `intervalos: [2]` → erro; `intervalos` com `topicoId: null` → erro; `observacao: '   '` → `null`; `EsquemaEdicaoSessao.parse({})` → erro.
- [ ] **Step 2:** `npx vitest run tests/unit/revisoes.test.ts tests/unit/esquemas.test.ts` → FAIL.
- [ ] **Step 3:** Implementar (datas via `somarDias`/`diasEntre`; `concluidaEm` convertido com `hojeEmSaoPaulo(new Date(...))`).
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(acompanhamento): tipos, esquemas e agenda de revisões`

### Task 4: Relatório (módulo puro)

**Files:**
- Create: `src/lib/acompanhamento/relatorio.ts`, `tests/unit/relatorio.test.ts`

**Interfaces:**
- Consumes: `Sessao`, `Revisao` (Task 3); `PlanoGerado`, `DisciplinaPlano`, `MinutosPorDia` (`src/lib/dominio/tipos.ts`).
- Produces:
  ```ts
  export type Periodo = 'semana' | 'semana_passada' | '30dias' | 'plano';
  export interface Intervalo { inicio: string; fim: string }
  export function intervaloDoPeriodo(p: Periodo, hoje: string, inicioPlano: string): Intervalo; // semana = domingo..sábado de hoje
  export function periodoAnterior(i: Intervalo): Intervalo; // mesmo tamanho, imediatamente antes
  export function planejadoNoIntervalo(gerado: PlanoGerado, minutosPorDia: MinutosPorDia, i: Intervalo): Record<string, number>; // disciplinaId → minutos
  export type Orientacao = { tipo: 'reforcar'; topicoNome: string; percentual: number; questoes: number } | { tipo: 'uma_materia' } | { tipo: 'revisoes_atrasadas'; quantidade: number } | { tipo: 'sem_estudo' } | { tipo: 'menos_que_anterior' };
  export interface Relatorio {
    intervalo: Intervalo; minutos: number; questoes: number; acertos: number; percentualAcerto: number | null; diasComEstudo: number;
    anterior: { minutos: number; questoes: number; percentualAcerto: number | null };
    porDisciplina: { disciplinaId: string; nome: string; minutos: number; fracaoEstudada: number; fracaoPlanejada: number; diasSemEstudo: number | null }[];
    reforcar: { disciplinaNome: string; topicoId: string; topicoNome: string; questoes: number; percentual: number }[];
    revisoes: { agendadas: number; concluidas: number; atrasadas: number };
    orientacoes: Orientacao[];
  }
  export function montarRelatorio(e: { sessoes: Sessao[]; revisoes: Revisao[]; disciplinas: DisciplinaPlano[]; gerado: PlanoGerado; minutosPorDia: MinutosPorDia; intervalo: Intervalo; hoje: string }): Relatorio;
  ```
- Regras (porte de `weeklyReportData`/`topicInsightData`/`disciplineBalanceData` do legado): `porDisciplina` lista todas as matérias do plano (ordem: mais minutos primeiro, empate pela ordem do plano); `diasSemEstudo` = dias desde a última sessão da matéria até `hoje` em **todas** as sessões (null se nunca), mostrado pela tela só quando ≥ 7; `reforcar`: ≥ 5 questões no intervalo e acerto < 70%, agrupando por `topicoId`, do menor % para o maior (empate: mais questões), até 10; ciclo: `planejadoNoIntervalo` = fração de cada item no ciclo × soma de `minutosPorDia` dos dias do intervalo; `orientacoes` até 3, nesta ordem de prioridade: `sem_estudo` (0 minutos), `reforcar` (pior tópico), `revisoes_atrasadas` (> 0), `uma_materia` (todo o tempo em 1 matéria), `menos_que_anterior`.
- [ ] **Step 1: Testes que falham:** `intervaloDoPeriodo('semana','2026-11-18', …)` → `2026-11-15..2026-11-21`; `'semana_passada'` → `2026-11-08..2026-11-14`; `'30dias'` → `2026-10-20..2026-11-18`; `'plano'` com início `2026-11-01` → `2026-11-01..2026-11-18`; `periodoAnterior` de 7 dias; `montarRelatorio` com sessões em duas matérias: totais, % (arredondado), `diasComEstudo` (dias distintos com minutos > 0), `anterior`; tópico com 4 questões não entra em `reforcar`, com 10 e 60% entra; `planejadoNoIntervalo` no prazo soma só blocos dentro do intervalo; no ciclo `[{d0,60},{d1,30}]` com 7 dias de 60 min → d0 280, d1 140; revisões: agendadas no intervalo, concluídas entre elas, atrasadas (pendentes com data < hoje); orientações na ordem e no máximo 3.
- [ ] **Step 2:** `npx vitest run tests/unit/relatorio.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(acompanhamento): relatório por período`

### Task 5: Ciclo pelo estudo registrado e tópicos distintos no dia

**Files:**
- Modify: `src/lib/planos/ciclo.ts`, `src/lib/dominio/tipos.ts`, `tests/unit/consultas.test.ts` (ou criar `tests/unit/ciclo.test.ts`)

**Interfaces:**
- Produces:
  ```ts
  // tipos.ts
  export type ItemCiclo = { disciplinaId: string; minutos: number };
  export interface PosicaoCiclo { indice: number; minutos: number }
  // ciclo.ts (remove minutosNoCiclo e topicoDoCicloHoje)
  export function minutosRegistradosNoCiclo(sessoes: { data: string; minutos: number }[], desde: string, hoje: string): number; // desde ≤ data < hoje
  export function posicaoEmMinutos(ciclo: ItemCiclo[], inicio: PosicaoCiclo | null, registrados: number): number; // soma dos itens antes de inicio.indice + inicio.minutos + registrados
  export function converterPosicao(antigo: ItemCiclo[], offset: number, novo: ItemCiclo[]): PosicaoCiclo;
  export function topicosDosBlocos(blocos: BlocoEstudo[], disciplinas: DisciplinaPlano[], concluidos: { topicoId: string; dia: string }[], hoje: string): (string | null)[];
  ```
- `converterPosicao`: acha o item e a fração percorrida (`offset mod total` no ciclo antigo); no novo, o item da mesma `disciplinaId` → `{ indice, minutos: Math.round(fração × novo[indice].minutos) }`; se a matéria não está mais no novo, o próximo item (na ordem antiga) que exista, com `minutos: 0`; ciclo novo vazio → `{0,0}`.
- `topicosDosBlocos`: para cada bloco `estudo` com `topicoId` nulo, na ordem: primeiro um tópico da matéria concluído hoje ainda não usado por outro bloco, senão o próximo pendente ainda não usado; `topicoId` não nulo é mantido; blocos de outros tipos → null.
- [ ] **Step 1: Testes que falham:** `minutosRegistradosNoCiclo` ignora sessões de hoje e de antes de `desde`; `posicaoEmMinutos([{a,60},{b,30}], {indice:1, minutos:10}, 25) === 95`; `converterPosicao([{a,60},{b,40}], 80, [{a,90},{b,20}])` → `{indice:1, minutos:10}`; matéria removida → próximo item com 0; `topicosDosBlocos` com dois blocos da mesma matéria (ciclo deu a volta) → dois tópicos pendentes diferentes; tópico concluído hoje fica no 1º bloco; bloco `revisao_geral` → null.
- [ ] **Step 2:** `npx vitest run tests/unit/ciclo.test.ts` → FAIL.
- [ ] **Step 3:** Implementar e ajustar `src/app/app/plano/page.tsx` para usar `posicaoEmMinutos(ciclo, plano.ciclo_inicio, minutosRegistradosNoCiclo(sessõesDoPlano, desde, hoje))`, com `desde = hojeEmSaoPaulo(new Date(plano.ajustado_em ?? plano.created_at))`, e `topicosDosBlocos` (o `PainelPlano` passa a receber `topicosDosBlocos: (string | null)[]` por índice do bloco, substituindo `topicosDoCiclo`). `consultas.ts` passa a importar `ItemCiclo` de `tipos.ts`.
- [ ] **Step 4:** `npm test` e `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `fix(ciclo): avança pelo estudo registrado e não repete tópico no dia`

### Task 6: Ajuste semanal (módulo puro) e multiplicadores no gerador

**Files:**
- Modify: `src/lib/dominio/tipos.ts` (`EntradaPlano.ajustes?: Record<string, number>`), `src/lib/plano/gerar.ts`, `src/lib/plano/constantes.ts`, `tests/unit/gerar-plano.test.ts`
- Create: `src/lib/plano/ajuste.ts`, `src/lib/plano/resumo.ts`, `tests/unit/ajuste.test.ts`, `tests/unit/resumo-ajuste.test.ts`

**Interfaces:**
- Consumes: `gerarPlano`, `converterPosicao`, `PosicaoCiclo`, `ItemCiclo` (Task 5).
- Produces (`constantes.ts`): `INTERVALO_AJUSTE_DIAS = 7`, `INTERVALO_AJUSTE_MANUAL_MIN = 60`, `JANELA_ACERTO_DIAS = 28`, `MIN_QUESTOES_ACERTO = 10`, `ACERTO_BAIXO = 0.6`, `ACERTO_ALTO = 0.8`, `FATOR_ACERTO_BAIXO = 1.25`, `FATOR_ACERTO_ALTO = 0.85`, `MIN_REVISOES_ATRASADAS = 2`, `FATOR_REVISOES = 1.1`, `AJUSTE_MIN = 0.8`, `AJUSTE_MAX = 1.4`.
- Produces (`ajuste.ts`):
  ```ts
  export type ItemResumo =
    | { tipo: 'horas'; estudados: number; planejados: number; diasAteProva: number | null }
    | { tipo: 'sem_estudo' }
    | { tipo: 'prioridade'; disciplinaId: string; nome: string; direcao: 'sobe' | 'desce'; percentual: number; questoes: number }
    | { tipo: 'revisoes_atrasadas'; disciplinaId: string; nome: string; quantidade: number }
    | { tipo: 'nao_cabe'; agora: number; antes: number }
    | { tipo: 'em_dia' };
  export interface EntradaAjuste {
    conteudo: DisciplinaPlano[]; gerado: PlanoGerado; dataProva: string | null; minutosPorDia: MinutosPorDia; pesosInformados: boolean;
    criadoEm: string; ajustesVigentes: Record<string, number>; posicaoAtual: number; // minutos no ciclo hoje
    sessoes: { data: string; disciplinaId: string; minutos: number; acertos: number; erros: number }[];
    concluidos: string[]; revisoesPendentes: { disciplinaId: string; dataRevisao: string }[]; hoje: string;
  }
  export interface ResultadoAjuste { gerado: PlanoGerado; ajustes: Record<string, number>; cicloInicio: PosicaoCiclo | null; resumo: ItemResumo[]; janela: { inicio: string; fim: string } }
  export function calcularMultiplicadores(e: EntradaAjuste): Record<string, number>;
  export function ajustarPlano(e: EntradaAjuste): ResultadoAjuste;
  export function ajusteVencido(referencia: Date, agora: Date): boolean; // ≥ 7 dias
  ```
- Produces (`resumo.ts`): `textoDoResumo(item: ItemResumo): string` — cópia exata:
  - horas: `Você estudou {estudados} de {planejados} planejadas ({p}%).` + (prazo) ` O conteúdo que ficou foi redistribuído nos {n} dias até a prova.` (formatar com `formatarMinutos` de `src/components/plano/formatar.ts`, movido para `src/lib/formatar.ts` se necessário).
  - sem_estudo: `Nenhum estudo registrado nos últimos 7 dias.`
  - prioridade sobe: `{nome} ganhou prioridade: {p}% de acerto em {q} questões.`; desce: `{nome} perdeu um pouco de prioridade: {p}% de acerto em {q} questões.`
  - revisoes_atrasadas: `{q} revisões atrasadas em {nome}: elas aparecem primeiro em Hoje.`
  - nao_cabe: `Agora {agora} tópicos não cabem até a prova (antes: {antes}).` ou, com `agora === 0`, `Todo o edital voltou a caber até a prova.`
  - em_dia: `Seu plano está em dia. Nada mudou.`
- Regras de `ajustarPlano` (spec §7.8 + decisões do Claude):
  - Janela de horas = `{ inicio: max(hoje − 7, criadoEm), fim: hoje − 1 }`; vazia (plano de hoje) → sem item de horas. Planejado: prazo = soma dos blocos do `gerado` na janela; ciclo = soma de `minutosPorDia` dos dias. Planejado 0 → sem item. Estudado 0 → `sem_estudo`; senão `horas`.
  - Multiplicadores: acerto por matéria em `[hoje − 28, hoje − 1]`; revisões atrasadas = pendentes com `dataRevisao < hoje`; produto limitado a `[AJUSTE_MIN, AJUSTE_MAX]`; arredondar a 2 casas; matérias com fator 1 ficam fora do objeto.
  - Itens `prioridade` só quando o fator de acerto da matéria difere do que estava em `ajustesVigentes` (no máximo 2, maiores mudanças primeiro); `revisoes_atrasadas` só a matéria com mais atrasadas (≥ 2).
  - **Prazo**: se `dataProva > hoje + 1`, `gerarPlano({ ..., hoje: amanhã, concluidos, ajustes })` e `gerado.dias = [...antigos com data ≤ hoje, ...novos]`, `inicioReserva`/`avisos` do novo; senão mantém o `gerado`. `nao_cabe` quando o nº de `topicosFora` muda.
  - **Ciclo**: regera o ciclo com `ajustes`, reordena na ordem do ciclo antigo (itens novos no fim), `cicloInicio = converterPosicao(antigo, posicaoAtual, novo)`.
  - Resumo vazio → `[{ tipo: 'em_dia' }]`; no máximo 5 itens, na ordem: horas/sem_estudo, prioridade, revisoes_atrasadas, nao_cabe.
- [ ] **Step 1: Testes que falham:**
  - `gerar-plano.test.ts`: `ajustes { d1: 1.4 }` dá mais minutos a d1 do que sem ajuste; sem `ajustes` o resultado é idêntico ao atual (snapshot de um caso existente).
  - `ajuste.test.ts`: 52% em 25 questões → ×1,25 e item `prioridade` `sobe`; 86% em 40 → ×0,85 `desce`; 9 questões → sem fator; baixo acerto + 3 atrasadas → `1.38` (1,25×1,1 arredondado); fator vigente igual → sem item `prioridade`; prazo: dias ≤ hoje intactos (mesmos blocos), dias a partir de amanhã regenerados sem tópicos concluídos; `dataProva` amanhã → `gerado` igual ao de entrada; horas: 390 de 600 min → item `horas` com `estudados 390, planejados 600`; janela sem sessões → `sem_estudo`; plano criado hoje → sem item de horas; ciclo: ordem dos itens preservada e `cicloInicio` aponta para a mesma matéria; nada mudou → `[{tipo:'em_dia'}]`; `ajusteVencido` 6 dias 23 h → false, 7 dias → true.
  - `resumo-ajuste.test.ts`: cada tipo produz exatamente a cópia acima (ex.: `horas` 390/600, 41 dias → `Você estudou 6h 30min de 10h planejadas (65%). O conteúdo que ficou foi redistribuído nos 41 dias até a prova.`).
- [ ] **Step 2:** `npx vitest run tests/unit/ajuste.test.ts tests/unit/resumo-ajuste.test.ts tests/unit/gerar-plano.test.ts` → FAIL.
- [ ] **Step 3:** Implementar (em `gerar.ts`, a prioridade de cada matéria é multiplicada por `entrada.ajustes?.[d.id] ?? 1` em `selecionarAtivas`).
- [ ] **Step 4:** → PASS; `npm test` todo verde.
- [ ] **Step 5: Commit** `feat(plano): ajuste semanal com multiplicadores e resumo`

### Task 7: Serviço e rotas de sessões e revisões

**Files:**
- Create: `src/lib/acompanhamento/servico.ts`, `src/lib/acompanhamento/rota.ts`, `src/lib/acompanhamento/mensagens.ts`
- Create: `src/app/api/sessoes/route.ts`, `src/app/api/sessoes/[id]/route.ts`, `src/app/api/revisoes/[id]/route.ts`
- Modify: `src/lib/planos/servico.ts` (`marcarTopico` cria/apaga revisões de conclusão)
- Create: `tests/integracao/sessoes.test.ts`

**Interfaces:**
- Consumes: funções SQL (Task 1), esquemas e `revisoesParaCriar` (Task 3).
- Produces:
  ```ts
  export class AcompanhamentoError extends Error { constructor(mensagem: string, readonly status: 400 | 404 | 409 | 429) }
  export interface PlanoAtivo { id: string; conteudo: DisciplinaPlano[]; createdAt: string }
  export async function exigirPodeRegistrar(userId: string): Promise<PlanoAtivo>; // 409 sem plano ativo
  export async function registrarSessao(userId: string, entrada: z.output<typeof EsquemaNovaSessao>, agora?: Date): Promise<{ sessaoId: string }>;
  export async function editarSessao(userId: string, sessaoId: string, mudancas: z.output<typeof EsquemaEdicaoSessao>, agora?: Date): Promise<void>;
  export async function excluirSessao(userId: string, sessaoId: string): Promise<void>;
  export async function marcarRevisao(userId: string, revisaoId: string, concluida: boolean, agora?: Date): Promise<void>;
  export async function excluirRevisao(userId: string, revisaoId: string): Promise<void>;
  export function respostaDeErroAcompanhamento(erro: unknown): Response; // log '[api/acompanhamento]'
  ```
- Rotas: `POST /api/sessoes` (201 `{ sessaoId }`), `PATCH|DELETE /api/sessoes/[id]` (204), `PATCH /api/revisoes/[id]` corpo `{ concluida: boolean }` (204), `DELETE /api/revisoes/[id]` (204). 401 sem login (`usuarioDaRequisicao`/`naoAutenticado` de `src/lib/editais/rota.ts`); id que não é uuid → 404.
- Regras: `planoId` ≠ plano ativo → 404; matéria/tópico fora do conteúdo → 400 `Esta matéria ou tópico não faz parte do plano.`; data futura → 400 `A data não pode ser no futuro.`; > 365 dias → 400 `A data é antiga demais.`; ≥ 200 sessões criadas hoje → 429 `Você registrou muitas sessões hoje.`; nomes da matéria/tópico vêm do conteúdo do plano (nunca do cliente). Editar: sessão de plano que não é o ativo (ou cuja matéria não existe mais no conteúdo) aceita só `data, minutos, acertos, erros, tipo, observacao` (trocar matéria/tópico → 400); a combinação final continua valendo o refine de tempo/questões. `marcarTopico(..., true)` insere as 4 revisões `origem 'conclusao'` com `data_estudo = hoje` (sem duplicar pendente); `false` apaga as pendentes `origem 'conclusao'` daquele tópico.
- [ ] **Step 1: Testes que falham** (`tests/integracao/sessoes.test.ts`, chamando o serviço com `agora` fixo):
  - registra com tópico e `intervalos [1,7,21,30]` → 4 revisões com as datas certas; repetir → 2 sessões, ainda 4 revisões.
  - `concluir: true` → tópico em `topicos_concluidos`.
  - `agora = 2026-11-17T02:30:00Z` (23h30 de 16/11 em SP) → data `2026-11-17` recusada (futuro), `2026-11-16` aceita.
  - nome da matéria gravado vem do conteúdo mesmo se o cliente mandar outro campo.
  - outro usuário não edita/exclui (404); sem plano ativo → 409.
  - excluir sessão com a revisão de 1 dia concluída → concluída fica, as outras 3 somem; revisões de outra sessão do mesmo tópico intactas.
  - editar sessão de plano antigo trocando a matéria → 400; mudando só os minutos → ok.
  - `marcarRevisao` conclui e desfaz (`concluida_em` null); `marcarTopico` true → 4 revisões de conclusão; false → somem; revisões de sessão do mesmo tópico ficam.
  - 200ª sessão ok, 201ª → 429 (inserir 200 via admin antes).
- [ ] **Step 2:** `npx vitest run tests/integracao/sessoes.test.ts` → FAIL.
- [ ] **Step 3:** Implementar serviço (usa `registrar_sessao`/`excluir_sessao`), rotas e mudança em `marcarTopico`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(api): registro de sessões e revisões`

### Task 8: Mensagem de cota fora da linha compartilhada (pendência do Plano 1)

**Files:**
- Modify: `src/lib/editais/servico.ts` (`liberarEdital` e o `liberar` de cargo), `src/lib/editais/limites.ts`, `tests/integracao/editais.test.ts`

**Interfaces:**
- Produces: `MSG_LEITURA_INTERROMPIDA = 'A leitura foi interrompida. Tente de novo.'` em `limites.ts`.
- [ ] **Step 1: Teste que falha:** usuário A estoura a cota (consumir 15 chamadas via `consumirCota` antes) ao reivindicar edital/cargo → serviço lança `EnvioInvalidoError` 429 com `MSG_COTA_IA`; a linha de `editais`/`edital_cargos` fica com `erro === MSG_LEITURA_INTERROMPIDA` (nunca `MSG_COTA_IA`); usuário B com acesso ao mesmo edital lê a linha sem a mensagem de cota e consegue "tentar de novo".
- [ ] **Step 2:** `npx vitest run tests/integracao/editais.test.ts` → FAIL.
- [ ] **Step 3:** Trocar `MSG_COTA_IA` por `MSG_LEITURA_INTERROMPIDA` nas duas gravações de liberação; a resposta 429 continua com `MSG_COTA_IA`. Ajustar o onboarding só se algum teste/tela dependia do texto da linha.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `fix(editais): mensagem de cota só para quem pediu`

### Task 9: Serviço e rotas do ajuste semanal

**Files:**
- Create: `src/lib/planos/ajuste-servico.ts`, `src/app/api/planos/[id]/ajustar/route.ts`, `src/app/api/planos/[id]/ajustes/[ajusteId]/route.ts`, `tests/integracao/ajuste.test.ts`

**Interfaces:**
- Consumes: `ajustarPlano`, `ajusteVencido` (Task 6); `minutosRegistradosNoCiclo`, `posicaoEmMinutos` (Task 5); `aplicar_ajuste` (Task 1); `exigirPodeRegistrar` (Task 7).
- Produces:
  ```ts
  export async function ajustarSeVencido(userId: string, agora?: Date): Promise<boolean>; // usado pela página do plano
  export async function ajustarAgora(userId: string, planoId: string, agora?: Date): Promise<void>; // 429 se < 60 min
  export async function marcarResumoVisto(userId: string, planoId: string, ajusteId: string): Promise<void>;
  export interface AjusteVisivel { id: string; criadoEm: string; resumo: ItemResumo[] }
  export async function ultimoAjusteNaoVisto(userId: string, planoId: string): Promise<AjusteVisivel | null>;
  ```
- Rotas: `POST /api/planos/[id]/ajustar` → 200 `{ ajusteId }` ou 429 `{ erro: 'Você ajustou há pouco. Tente de novo depois das HH:MM.' }` (hora em SP); `PATCH /api/planos/[id]/ajustes/[ajusteId]` corpo `{ visto: true }` → 204. Reaproveitar `respostaDeErroAcompanhamento`.
- `ajustarSeVencido`: referência = `ajustado_em ?? created_at`; se `ajusteVencido` → executa; corrida perdida (`aplicar_ajuste` devolve null) → false, sem erro. `pesosInformados` derivado como em `criarPlano` (flag do cargo OU questões/pontos > 0 no conteúdo) — extrair essa derivação para uma função compartilhada `pesosDoPlano(conteudoCargo, disciplinas)` em `src/lib/planos/servico.ts`.
- [ ] **Step 1: Testes que falham:** plano criado há 8 dias (via `created_at` no insert admin) com sessões de baixo acerto → `ajustarSeVencido` true, `planos.ajustes` tem o fator, `ajustes_plano` tem resumo com `prioridade`; chamada de novo → false; duas chamadas em paralelo (`Promise.all`) num plano vencido → exatamente 1 linha em `ajustes_plano`; `ajustarAgora` duas vezes em 10 min → 2ª lança 429; outro usuário → 404; `marcarResumoVisto` faz `ultimoAjusteNaoVisto` devolver null.
- [ ] **Step 2:** `npx vitest run tests/integracao/ajuste.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(api): ajuste semanal do plano`

### Task 10: Tema claro/escuro

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`, `src/components/estilos.ts`, componentes que usam `text-white` sobre `bg-caneta` (4 ocorrências: `grep -rn text-white src`)
- Create: `src/components/tema/scriptTema.ts`, `src/components/tema/BotaoTema.tsx`, `tests/unit/tema-contraste.test.ts`

**Interfaces:**
- Produces: tokens `--papel --folha --tinta --tinta-suave --caneta --caneta-escura --caneta-clara --na-caneta --marca --linha --erro --erro-claro` definidos em `:root, [data-theme="light"]` e em `[data-theme="dark"]`; `@theme inline` mapeia `--color-<nome>: var(--<nome>)` (as classes Tailwind atuais continuam iguais, mais `text-na-caneta`); `SCRIPT_TEMA: string` (inline no `<head>`, aplica `data-theme` antes de pintar a partir de `localStorage['editaliza:tema']` ou `prefers-color-scheme`); `<BotaoTema />` (client, alterna e grava; rótulo acessível "Usar tema escuro"/"Usar tema claro"; ≥ 44 px).
- Paleta clara = valores atuais; escura (ponto de partida, o teste de contraste decide): papel `#0f1420`, folha `#171e2e`, tinta `#e6e9f0`, tinta-suave `#a3acc2`, caneta `#8aa4ff`, caneta-escura `#b3c4ff`, caneta-clara `#1d2a52`, na-caneta `#0f1420`, marca `#e3e85a`, linha `#2f3a55`, erro `#ff8a80`, erro-claro `#3a1d1d`.
- [ ] **Step 1: Teste que falha** `tema-contraste.test.ts`: lê `src/app/globals.css`, extrai as duas paletas por regex e confere razão de contraste WCAG ≥ 4,5 para: tinta/papel, tinta/folha, tinta-suave/folha, caneta/folha, na-caneta/caneta, erro/erro-claro — nos dois temas.
- [ ] **Step 2:** `npx vitest run tests/unit/tema-contraste.test.ts` → FAIL.
- [ ] **Step 3:** Implementar tokens, script (`<html suppressHydrationWarning>`), botão; trocar `text-white` por `text-na-caneta`; `color-scheme` por tema. O `<BotaoTema />` também entra no cabeçalho das páginas públicas (`src/app/page.tsx`, `src/app/entrar/page.tsx`) e do onboarding (`src/app/app/novo/page.tsx`).
- [ ] **Step 4:** → PASS; `npm run build` ok.
- [ ] **Step 5: Commit** `feat(tema): tema escuro com escolha salva`

### Task 11: Moldura da área logada e navegação

**Files:**
- Create: `src/components/app/MolduraApp.tsx` (server), `src/components/app/NavegacaoApp.tsx` (client, `usePathname`)
- Create: `src/app/app/estudar/page.tsx`, `src/app/app/revisoes/page.tsx`, `src/app/app/historico/page.tsx`, `src/app/app/relatorio/page.tsx` (esqueletos: título e "Carregando…", preenchidos nas Tasks 12–15)
- Create: `src/lib/acompanhamento/consultas.ts` (server-only: leituras com o cliente RLS)
- Modify: `src/app/app/plano/page.tsx` (usa a moldura), `e2e/paginas.spec.ts`

**Interfaces:**
- Produces: `<MolduraApp titulo?: string>{children}</MolduraApp>` — cabeçalho com `<Marca />`, abas (Plano, Estudar, Revisões, Histórico, Relatório), `<BotaoTema />`, link "Novo plano"; no celular (< 640 px) as abas viram barra fixa embaixo (`nav` com `aria-label="Seções"`, item atual com `aria-current="page"`), e o conteúdo ganha `pb-24`.
- Produces (`consultas.ts`): `planoAtivoOuRedireciona(): Promise<LinhaPlanoAtivo>` (redirect `/app/novo` sem plano; `LinhaPlanoAtivo` = colunas de `planos` + nome do cargo/órgão, como em `plano/page.tsx`), `sessoesDoPlano(planoId, desde?: string): Promise<Sessao[]>`, `sessoesDoUsuario(filtro: { pagina: number; disciplinaNome?: string; de?: string; ate?: string }): Promise<{ sessoes: Sessao[]; total: number }>` (50 por página), `revisoesDoPlano(planoId): Promise<Revisao[]>`.
- [ ] **Step 1: Teste e2e que falha** (em `paginas.spec.ts`): sem login, `/app/estudar`, `/app/revisoes`, `/app/historico`, `/app/relatorio` redirecionam para `/entrar`.
- [ ] **Step 2:** `npx playwright test e2e/paginas.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar (cada página chama `exigirUsuario`/`planoAtivoOuRedireciona` dentro de `<Suspense>`, como `plano/page.tsx`).
- [ ] **Step 4:** → PASS; `npm run build` ok.
- [ ] **Step 5: Commit** `feat(app): navegação entre plano, estudo, revisões, histórico e relatório`

### Task 12: Página Estudar — cronômetro e registros

**Files:**
- Create: `src/components/estudo/useCronometro.ts`, `src/components/estudo/Cronometro.tsx`, `src/components/estudo/FormularioSessao.tsx`, `src/components/estudo/RegistroRapido.tsx`, `src/components/estudo/api.ts`
- Modify: `src/app/app/estudar/page.tsx`
- Create: `e2e/estudo.spec.ts`; Modify: `e2e/ajuda.ts` (mover o fluxo do onboarding para `criarPlano(page, { dataProva?: string | null })`, reaproveitado por `onboarding.spec.ts`)

**Interfaces:**
- Consumes: `cronometro.ts` (Task 2), `POST /api/sessoes` (Task 7), `planoAtivoOuRedireciona` (Task 11).
- Produces: `useCronometro(userId: string)` → `{ estado, segundos, formulario, setFormulario, iniciar, pausar, descartar, limpar, recuperado: boolean }` (grava o rascunho a cada mudança e no `pagehide`; atualiza o display a cada 500 ms e `document.title` = `HH:MM:SS · Editaliza` enquanto roda); `<FormularioSessao modo="cronometro" | "manual" | "edicao" disciplinas={DisciplinaPlano[]} inicial={...} aoSalvar={(dados) => Promise<void>} />` (campos do spec §7.2; data padrão = hoje recebido do servidor; minutos; acertos/erros; tipo; observação; intervalos 1/7/21/30 marcados por padrão quando há tópico; "Concluí este tópico"; erros da API exibidos em `role="alert"`); `<RegistroRapido />` lembra a última matéria/tópico em `localStorage['editaliza:ultimo-registro:{userId}']`.
- Página aceita `?disciplina=<id>&topico=<id>&iniciar=1` (vindo do botão "Iniciar" de Hoje): pré-seleciona e inicia; se já houver cronômetro em andamento de outra matéria, pergunta (`confirm` acessível em diálogo) antes de trocar.
- Parar: `minutosParaRegistro`; 0 → oferece "Descartar" ou "Continuar"; acima de `ESQUECIDO_SEG` mostra `O cronômetro ficou ligado por {tempo}. Confira o tempo antes de salvar.`
- [ ] **Step 1: Testes e2e que falham** (`e2e/estudo.spec.ts`, `test.describe.configure({ timeout: 120_000 })`):
  - `cronômetro sobrevive a recarregar` → criarPlano, `/app/estudar`, escolher matéria e tópico, Iniciar, esperar 2 s, `page.reload()`, o display continua contando (≥ 00:00:02) e a matéria continua escolhida; Pausar, recarregar, continua pausado.
  - `registro manual salva` → preencher 45 min e tópico, salvar → mensagem "Sessão registrada" e o formulário limpo; parar o cronômetro abre o formulário com os minutos preenchidos.
- [ ] **Step 2:** `npx playwright test e2e/estudo.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(estudo): cronômetro com rascunho e registro de sessões`

### Task 13: Revisões — agenda e "Revisões de hoje"

**Files:**
- Create: `src/components/revisoes/Agenda.tsx`, `src/components/revisoes/ItemRevisao.tsx`, `src/components/revisoes/useRevisoes.ts`, `src/components/plano/RevisoesHoje.tsx`
- Modify: `src/app/app/revisoes/page.tsx`, `src/app/app/plano/page.tsx`, `src/components/plano/PainelPlano.tsx`

**Interfaces:**
- Consumes: `agruparAgenda`, `diasDeAtraso`, `MINUTOS_POR_REVISAO` (Task 3); `PATCH/DELETE /api/revisoes/[id]` (Task 7); `revisoesDoPlano` (Task 11).
- Produces: `useRevisoes(iniciais: Revisao[])` → `{ revisoes, concluir(id, sim), excluir(id), erro }` (otimista, volta em falha, uma requisição em voo por revisão — mesmo padrão de `useMarcacoes`); `<Agenda>` com os 5 grupos do spec §7.4 (título com contagem; dentro, por matéria; "N dias de atraso"; "Hoje"; "dd/mm"); estado vazio: `Nenhuma revisão agendada. Elas aparecem quando você registra estudo de um tópico.`; `<RevisoesHoje>` em `PainelPlano` (hoje + atrasadas, atrasadas primeiro, com `≈ {n × 15} min de revisão`; oculto se vazio).
- [ ] **Step 1: Teste e2e que falha** (em `e2e/estudo.spec.ts`): `registro cria revisões na agenda` → registrar 45 min de um tópico → `/app/revisoes` mostra o tópico em "Esta semana" (1 e 7 dias) e em "Próximas" (21 e 30); concluir a revisão em `/app/revisoes` → vai para "Concluídas"; recarregar → continua concluída.
- [ ] **Step 2:** `npx playwright test e2e/estudo.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(revisoes): agenda e revisões de hoje`

### Task 14: Hoje — "Estudei", "Iniciar" e resumo do ajuste; Histórico

**Files:**
- Modify: `src/components/plano/Hoje.tsx`, `src/components/plano/PainelPlano.tsx`, `src/app/app/plano/page.tsx`
- Create: `src/components/plano/ResumoAjuste.tsx`, `src/components/historico/ListaHistorico.tsx`
- Modify: `src/app/app/historico/page.tsx`
- Create: `e2e/acompanhamento.spec.ts`

**Interfaces:**
- Consumes: `POST /api/sessoes` com `origem: 'rapido'`, `DELETE /api/sessoes/[id]`, `PATCH /api/sessoes/[id]` (Task 7); `ajustarSeVencido`, `ultimoAjusteNaoVisto`, rotas de ajuste (Task 9); `textoDoResumo` (Task 6); `FormularioSessao` (Task 12); `sessoesDoUsuario` (Task 11).
- Hoje: cada bloco `estudo` com tópico ganha "Iniciar" (link para `/app/estudar?disciplina=…&topico=…&iniciar=1`) e "Estudei" (registra os minutos do bloco, intervalos padrão; depois mostra `Registrado · Desfazer`). A página passa `sessoesRapidasHoje: { id: string; disciplinaId: string; topicoId: string | null }[]` e o painel associa cada bloco à primeira sessão ainda não usada da mesma matéria/tópico.
- Página do plano chama `ajustarSeVencido(usuario.id)` antes de ler o plano; `ResumoAjuste` mostra os itens (`textoDoResumo`), "Último ajuste em {data}", botão "Fechar" (PATCH visto) e o botão "Ajustar agora" (POST; 429 mostra a mensagem; sucesso → `router.refresh()`).
- Histórico: lista paginada (50), filtros matéria (nomes distintos das sessões) e período (`de`/`ate`) via `searchParams`; cada linha com Editar (diálogo com `FormularioSessao modo="edicao"`, matéria/tópico desabilitados quando a sessão é de plano antigo ou a matéria não existe mais) e Excluir (confirmação: `Excluir esta sessão? As revisões pendentes criadas por ela também serão apagadas.`). Vazio: `Nenhuma sessão registrada ainda.`
- [ ] **Step 1: Testes e2e que falham** (`e2e/acompanhamento.spec.ts`): `Estudei registra e desfaz` (criarPlano com data → Hoje → "Estudei" no 1º bloco → "Registrado" → recarregar continua "Registrado" → "Desfazer" → volta "Estudei"); `histórico edita e exclui` (registrar, editar minutos para 50 → linha mostra 50 min; excluir → vazio); `ajustar agora mostra resumo` (botão → resumo visível com texto; 2º clique → mensagem "Você ajustou há pouco").
- [ ] **Step 2:** `npx playwright test e2e/acompanhamento.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(plano): registro rápido em Hoje, resumo do ajuste e histórico`

### Task 15: Relatório

**Files:**
- Create: `src/components/relatorio/PainelRelatorio.tsx`
- Modify: `src/app/app/relatorio/page.tsx`, `e2e/acompanhamento.spec.ts`

**Interfaces:**
- Consumes: `montarRelatorio`, `intervaloDoPeriodo`, `Periodo` (Task 4); `sessoesDoPlano`, `revisoesDoPlano` (Task 11).
- Tela: seletor de período (links `?periodo=semana|semana_passada|30dias|plano`, padrão `semana`); 4 números (Horas, Questões, Acerto, Dias com estudo) com variação vs. anterior (`+20% vs. período anterior` / `Período anterior: 0h`); barras CSS por matéria (estudado vs. planejado, `sem estudo há N dias` quando ≥ 7); "Assuntos para reforçar" (vazio: `Sem assuntos com pelo menos 5 questões e acerto abaixo de 70% neste período.`); "Revisões da semana" (agendadas, concluídas, atrasadas); orientações em texto (cópia: `Considere reforçar {tópico} ({p}% em {q} questões).`, `Todo o tempo ficou em uma matéria. Compare com o seu plano.`, `Há {n} revisões atrasadas.`, `Nenhum estudo registrado neste período.`, `Você estudou menos que no período anterior. Confira se o tempo planejado continua viável.`).
- [ ] **Step 1: Teste e2e que falha:** registrar 45 min com 10 questões (4 acertos) → `/app/relatorio` mostra `45min`, `40%` e o tópico em "Assuntos para reforçar".
- [ ] **Step 2:** `npx playwright test e2e/acompanhamento.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(relatorio): relatório por período`

### Task 16: Tema no e2e, fechamento e documentação

**Files:**
- Modify: `e2e/paginas.spec.ts` (tema), `docs/deploy.md` (migração nova), `docs/superpowers/decisoes-plano-1.md` (marcar as 3 pendências "parked" do Plano 2 como resolvidas, com o commit)
- Create: `docs/superpowers/decisoes-plano-2.md` (decisões tomadas na execução, no mesmo formato do Plano 1)

- [ ] **Step 1: Teste e2e que falha:** `tema escuro persiste` → `/entrar`, clicar "Usar tema escuro", `html[data-theme="dark"]`; recarregar → continua `dark`; com `colorScheme: 'dark'` e sem escolha salva → `dark` na primeira pintura.
- [ ] **Step 2:** `npx playwright test e2e/paginas.spec.ts` → FAIL (se a Task 10 já cobre, confirmar que passa e seguir).
- [ ] **Step 3:** Ajustes e documentação.
- [ ] **Step 4:** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:e2e`, `npm run build` → todos verdes.
- [ ] **Step 5: Commit** `docs: decisões do Plano 2 e pendências resolvidas`
