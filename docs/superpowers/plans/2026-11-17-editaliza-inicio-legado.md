# Editaliza — Início no estilo do legado (fila de blocos, calendário, texto calmo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Numa página só (Início, `/app/plano`), o aluno vê o próximo bloco da fila, estuda com o cronômetro ali mesmo, conclui e segue; vê no calendário do mês o que estudou e quando tem revisão; e todas as telas usam letra legível com só dois pesos.

**Architecture:** A fila de blocos é derivada do `gerado` (prazo: blocos achatados na ordem das datas a partir de `fila_desde`; ciclo: itens do ciclo repetidos) por um módulo puro (`src/lib/plano/fila.ts`); a posição é uma coluna nova em `planos`, escrita só pelo servidor numa função SQL transacional (`concluir_bloco`) com proteção otimista (posição esperada + `ajustado_em`). O calendário é outro módulo puro (`src/lib/plano/calendario.ts`) que projeta a fila sobre os minutos por dia. O ajuste semanal passa a refazer a fila (prazo) ou converter a posição (ciclo). A UI do Início substitui Hoje/Semana/Estudar; a aba Conteúdos volta do legado; a aba Estudar vira redirecionamento.

**Tech Stack:** Next.js 16.4 (App Router, Cache Components — **ler `node_modules/next/dist/docs/` antes de escrever páginas, rotas ou `next.config.ts`**), React 19.3, Tailwind 4, Supabase (`@supabase/ssr`, `supabase-js`), zod 4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-editaliza-inicio-legado-design.md` (§7.1 tem as regras detalhadas da fila — é vinculante). Contexto: `docs/superpowers/specs/2026-11-16-editaliza-plano-2-acompanhamento-design.md`, `docs/superpowers/plans/2026-11-16-editaliza-plano-2-acompanhamento.md`, `docs/superpowers/decisoes-plano-2.md`.

## Global Constraints

- Interface em pt-BR; datas ISO `aaaa-mm-dd` no código/banco; "hoje" sempre `hojeEmSaoPaulo()` (`src/lib/datas.ts`) calculado **no servidor** para gravar.
- Escrita só pelo servidor (service role). `planos` já não tem UPDATE para `authenticated` (migração `20261116000700`); `fila_posicao`/`fila_desde` só mudam por `concluir_bloco`, pelo `voltarBloco` do serviço e por `aplicar_ajuste`.
- Toda rota que grava estudo ou mexe na fila chama `exigirPodeRegistrar(userId)` (`src/lib/acompanhamento/servico.ts`).
- Fila (spec §6.3/§7.1): **Concluir** avança 1, **Voltar** recua 1 (mínimo 0); "Salvar sem concluir" grava e não avança; registros avulsos ("Registrar sem cronômetro") não mexem na fila. Posição = contador sem limite; ciclo: bloco atual = `posição mod nº de itens`.
- Rótulos exatos: prazo `Bloco {N} de {M}`; ciclo `Bloco {N} · volta {V}`. Próximos blocos: `QUANTIDADE_PROXIMOS = 12`.
- Revisões `[1, 7, 21, 30]` só em blocos de estudo com tópico; blocos `simulado`/`revisao_geral` gravam sessão sem tópico, com `tipo` `simulado`/`revisao`, sem revisões.
- Dados existentes: sem migração de dados (não há alunos reais); planos existentes começam no bloco 1. Novo plano começa no bloco 1.
- Tipografia (spec §6.4): corpo 16 px, linha 1,5; nada abaixo de 13 px; **só pesos 400 e 600**; títulos de seção 20–24 px em 600; tópico do próximo bloco 28–32 px em 600; rótulos de campo 14 px em 400; metadados 14 px em cor suave; fonte Plus Jakarta Sans; sem negrito no meio de frases; uma frase curta por seção, quando necessária.
- Animações do redesign mantidas; tudo desligado com `prefers-reduced-motion`.
- Celular primeiro: alvos ≥ 44 px, nada de rolagem lateral em 375 px; Início em duas colunas a partir de 1100 px (`min-[1100px]:`).
- Rascunho do cronômetro: mesma chave `editaliza:cronometro:{userId}` e mesmo `useCronometro` de hoje.
- Testes: `npm test` exige `npx supabase start`; depois de cada migração nova, `npx supabase db reset`; e2e com `EXTRACAO_MODO=fake` (já no `playwright.config.ts`).

## Review Focus

1. **Dois cliques / duas abas em "Concluir bloco"** → uma só sessão e a posição sobe 1; a outra requisição recebe 409, a tela mostra `A fila mudou em outra tela. Atualizamos para você.`, recarrega e **não apaga o rascunho do cronômetro**. (Tasks 3, 4, 6)
2. **Ajuste semanal entre abrir a tela e concluir** (tela velha) → 409, nunca grava sessão de um bloco da fila antiga numa posição da nova; e um ajuste calculado com posição velha não grava (`p_fila_lida`). (Tasks 3, 4, 5)
3. **Fim da fila no prazo** (posição = M) → cartão `Você chegou ao fim da fila.`, sem "Concluir bloco", "Voltar um bloco" funciona; servidor responde 409 com a mesma frase. (Tasks 1, 4, 6)
4. **Projeção com dias sem horas, bloco maior que o dia, minutos de hoje já gastos ou plano sem tempo** → sem laço infinito; bloco grande ocupa um dia sozinho; hoje só recebe o que cabe no que falta; plano sem tempo dá calendário sem previsão. (Task 2)
5. **Matéria do ciclo com todos os tópicos concluídos** → o bloco mostra a matéria com `Todos os tópicos desta matéria estão concluídos.`; concluir grava sessão sem tópico e sem revisões. (Tasks 1, 4, 6)

## Leituras do design fixadas neste plano

- Prazo: bloco cujo tópico já foi concluído continua na fila (sem pular), mostrado como `Tópico já concluído`; Concluir avança 1, como no spec.
- Prazo no fim da fila: cartão de fim + 409 `MSG_FILA_FIM` no servidor.
- Ajuste no prazo só refaz a fila (posição 0, `fila_desde` = amanhã, item `fila_refeita`) quando o `gerado` é regerado (prova depois de amanhã); senão a fila fica como está.
- Proteção otimista dupla: `concluir_bloco` confere posição **e** `ajustado_em`; `aplicar_ajuste` confere também `fila_posicao` (`p_fila_lida`).
- O cronômetro é um só e vale para o bloco que está na tela; num 409 o rascunho fica. `?disciplina&topico` vindos de `/app/estudar` são ignorados; só `iniciar=1` conta.
- "Concluí este tópico" no cartão é uma marca levada ao concluir (não grava sozinha). Minutos do passo: do cronômetro se ele rodou ≥ 30 s, senão os previstos; `origem` `cronometro`/`rapido`; sessão de bloco de estudo com `tipo` nulo.
- Calendário: mês por `?mes=aaaa-mm`; revisões contadas pela `data_revisao`; sessões do plano ativo; projeção só em dias antes da data da prova (o `gerado` também para no dia anterior).
- `Avisos` do plano saem do Início e vão para Conteúdos; a coluna `ciclo_inicio` é removida (migração própria na Task 6).

---

### Task 1: Fila de blocos (módulo puro)

**Files:**
- Create: `src/lib/plano/fila.ts`, `tests/unit/fila.test.ts`

**Interfaces:**
- Consumes: `PlanoGerado`, `BlocoEstudo`, `ItemCiclo`, `DisciplinaPlano` (`src/lib/dominio/tipos.ts`).
- Produces:
  ```ts
  export const QUANTIDADE_PROXIMOS = 12;
  export interface BlocoFila { posicao: number; disciplinaId: string; topicoId: string | null; tipo: BlocoEstudo['tipo']; minutos: number }
  export type Fila =
    | { modo: 'prazo'; blocos: Omit<BlocoFila, 'posicao'>[] }
    | { modo: 'ciclo'; itens: ItemCiclo[] };
  export function montarFila(gerado: PlanoGerado, filaDesde: string | null): Fila; // prazo: blocos dos dias com data >= filaDesde (null = todos), na ordem das datas e dos blocos
  export function totalDaFila(fila: Fila): number | null;                          // prazo: M; ciclo: null
  export function blocoDaFila(fila: Fila, posicao: number): BlocoFila | null;      // prazo: null se posicao >= M; ciclo: itens[posicao % n] com topicoId null, tipo 'estudo'; ciclo vazio: null
  export function proximosBlocos(fila: Fila, posicao: number, quantidade: number): BlocoFila[]; // posições posicao+1 ..; prazo para no fim
  export function numeracao(fila: Fila, posicao: number): { numero: number; total: number | null; volta: number | null };
  export function rotuloDoBloco(fila: Fila, posicao: number): string; // 'Bloco 5 de 48' | 'Bloco 2 · volta 3'
  export function topicoDoCiclo(disciplina: DisciplinaPlano | undefined, concluidos: ReadonlySet<string>): string | null; // primeiro tópico pendente, na ordem do edital
  export function topicoDoBloco(bloco: BlocoFila, fila: Fila, disciplinas: DisciplinaPlano[], concluidos: ReadonlySet<string>): string | null; // prazo: bloco.topicoId (mesmo concluído); ciclo: topicoDoCiclo
  export function converterPosicaoFila(antigo: ItemCiclo[], posicao: number, novo: ItemCiclo[]): number;
  ```
- `numeracao`: prazo `{ numero: posicao + 1, total: M, volta: null }`; ciclo `{ numero: posicao % n + 1, total: null, volta: Math.floor(posicao / n) + 1 }`.
- `converterPosicaoFila`: `volta = floor(posicao / antigo.length)`; item atual `antigo[posicao % antigo.length]`; no novo, o índice da mesma `disciplinaId`, senão o do próximo item (na ordem antiga, dando a volta) que exista no novo; resultado `volta × novo.length + índice`; antigo ou novo vazio → 0.

- [ ] **Step 1: Testes que falham** (`tests/unit/fila.test.ts`; `gerado` de prazo com dias `2026-11-16: [estudo d0/d0-t0 60, estudo d1/d1-t0 45]`, `2026-11-17: []`, `2026-11-18: [simulado d0 60]`; ciclo `[{d0,90},{d1,60}]`):
  - `montarFila prazo achata na ordem das datas` → 3 blocos `[d0-t0, d1-t0, simulado]`; com `filaDesde '2026-11-17'` → só o simulado.
  - `montarFila ciclo` → `{ modo: 'ciclo', itens }` iguais ao ciclo.
  - `totalDaFila` → 3 no prazo, `null` no ciclo.
  - `blocoDaFila` prazo pos 2 → `{ posicao: 2, tipo: 'simulado', topicoId: null, ... }`; pos 3 → `null`; ciclo pos 5 → `{ posicao: 5, disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 60 }`; ciclo `[]` → `null`.
  - `numeracao`/`rotuloDoBloco`: prazo com 48 blocos pos 4 → `'Bloco 5 de 48'`; ciclo de 2 itens pos 5 → `{ numero: 2, total: null, volta: 3 }` e `'Bloco 2 · volta 3'`.
  - `proximosBlocos` prazo pos 0, 12 → posições `[1, 2]`; ciclo pos 1, 3 → `[d0@2, d1@3, d0@4]`.
  - `topicoDoCiclo`: d0 com `[t0, t1]` e `t0` concluído → `'t1'`; todos concluídos → `null`; `undefined` → `null`.
  - `topicoDoBloco`: prazo devolve o `topicoId` do bloco mesmo concluído; ciclo devolve o primeiro pendente.
  - `converterPosicaoFila([a,b,c], 7, [c,b]) === 5` (volta 2, item b; b no novo é o índice 1 → `2 × 2 + 1`); matéria removida `converterPosicaoFila([a,b,c], 1, [a,c]) === 1` (b sumiu → c, índice 1, volta 0); novo vazio → 0; antigo vazio → 0.
- [ ] **Step 2:** `npx vitest run tests/unit/fila.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar `src/lib/plano/fila.ts` (funções puras, sem I/O).
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(plano): fila de blocos`

### Task 2: Calendário do mês e totais da semana (módulos puros)

**Files:**
- Create: `src/lib/plano/calendario.ts`, `tests/unit/calendario.test.ts`
- Modify: `src/lib/acompanhamento/relatorio.ts`, `tests/unit/relatorio.test.ts`

**Interfaces:**
- Consumes: `Fila`, `blocoDaFila`, `BlocoFila` (Task 1); `somarDias`, `diaDaSemana`, `dataPorExtenso` (`src/lib/datas.ts`); `formatarMinutos` (`src/lib/formatar.ts`).
- Produces (`calendario.ts`):
  ```ts
  export interface EntradaProjecao { fila: Fila; posicao: number; minutosPorDia: number[]; hoje: string; registradosHoje: number; dataProva: string | null; ate: string }
  export function projetarFila(e: EntradaProjecao): Map<string, BlocoFila[]>; // data → blocos previstos (só dias com algum bloco)
  export function gradeDoMes(mes: string): string[];            // 'aaaa-mm' → datas de domingo a sábado cobrindo o mês
  export function mesValido(valor: string | undefined, hoje: string): string; // 'aaaa-mm' entre hoje −24 e +24 meses, senão o mês de hoje
  export function mesVizinho(mes: string, delta: -1 | 1): string;
  export interface DiaCalendario { data: string; doMes: boolean; ehHoje: boolean; passado: boolean; minutosEstudados: number; revisoesPendentes: number; revisoesFeitas: number; previstos: BlocoFila[] }
  export function montarCalendario(e: { mes: string; hoje: string; sessoes: { data: string; minutos: number }[]; revisoes: { dataRevisao: string; concluidaEm: string | null }[]; projecao: Map<string, BlocoFila[]> }): DiaCalendario[];
  export function rotuloDoDia(d: DiaCalendario): string;
  ```
- Produces (`relatorio.ts`): `export function totaisDoIntervalo(sessoes: { data: string; minutos: number; acertos: number; erros: number }[], i: Intervalo): { minutos: number; questoes: number; acertos: number; percentualAcerto: number | null }` (`Math.round`, `null` sem questões).
- Regra de `projetarFila` (spec §7.1.5), determinística:
  ```
  se soma(minutosPorDia) = 0 ou blocoDaFila(fila, posicao) = null → mapa vazio
  dia = hoje; livre = max(0, cap(hoje) − registradosHoje); vazio = true; p = posicao
  enquanto dia <= ate e (dataProva = null ou dia < dataProva) e blocoDaFila(fila, p) != null:
    b = blocoDaFila(fila, p)
    se cap(dia) > 0 e b.minutos <= livre: põe b em dia; livre −= b.minutos; vazio = false; p++
    senão se cap(dia) > 0 e vazio e livre = cap(dia): põe b em dia (sozinho); livre = 0; vazio = false; p++
    senão: dia = dia + 1; livre = cap(dia); vazio = true
  ```
  (`cap(d) = minutosPorDia[diaDaSemana(d)]`; "vazio e livre = cap" impede que hoje, com minutos já registrados, receba um bloco que não cabe.)
- `montarCalendario`: para cada data de `gradeDoMes(mes)`: `doMes` = mesmo `aaaa-mm`; `passado` = data < hoje; `minutosEstudados` = soma das sessões do dia (todas, inclusive avulsas; zero no futuro); revisões contadas por `dataRevisao` (pendente = `concluidaEm` nulo); `previstos` = projeção do dia só para data ≥ hoje.
- `rotuloDoDia` = `${dataPorExtenso(data, { day: 'numeric', month: 'long' })}: ${partes.join(', ')}` com partes, nesta ordem e só quando > 0: `{formatarMinutos(m)} estudados`, `{formatarMinutos(soma dos previstos)} previstos`, `{n} revisão pendente | {n} revisões pendentes`, `{n} revisão feita | {n} revisões feitas`; sem partes → `sem estudo`.

- [ ] **Step 1: Testes que falham** (`tests/unit/calendario.test.ts`; `cap = [0,60,60,60,60,60,0]`, hoje `2026-11-17` = terça, ciclo `[{a,45},{b,30}]`):
  - `gradeDoMes('2026-11')` → 35 datas, de `2026-11-01` a `2026-12-05`; `'2027-02'` → `2027-01-31` a `2027-03-06`; `'2026-12'` → `2026-11-29` a `2027-01-02`.
  - `mesValido('2026-13', hoje)`, `mesValido(undefined, hoje)` e `mesValido('2030-01', hoje)` → `'2026-11'`; `mesValido('2026-12', hoje)` → `'2026-12'`; `mesVizinho('2026-12', 1) === '2027-01'`, `mesVizinho('2026-01', -1) === '2025-12'`.
  - `projetarFila` ciclo, pos 0, `registradosHoje 0`, ate `2026-11-21` → `17: [a@0]`, `18: [b@1]`, `19: [a@2]`, `20: [b@3]`, sábado sem nada.
  - `registradosHoje 40` → nada em 17; `18: [a@0]`, `19: [b@1]`…
  - `registradosHoje 90` (passou do dia) → nada em 17.
  - bloco maior que o dia: ciclo `[{a,120}]` → um bloco por dia útil, sábado e domingo vazios.
  - prazo com 5 blocos de 60, cap 60 todo dia, `dataProva '2026-11-19'` → só 17 e 18 têm blocos; posição = M → mapa vazio.
  - `minutosPorDia` todo zero → mapa vazio (termina); ciclo `[]` → mapa vazio.
  - `montarCalendario` com sessões `16: 30 + 20`, `17: 25`, revisões `16` pendente, `18` uma pendente e uma concluída, projeção em 17 e 18 → dia 16: `passado`, `minutosEstudados 50`, `revisoesPendentes 1`, `previstos []`; dia 17: `ehHoje`, `minutosEstudados 25`, previstos da projeção; dia 18: `revisoesPendentes 1`, `revisoesFeitas 1`; `2026-12-01` → `doMes false`.
  - `rotuloDoDia` do dia 18 com 60 min previstos → `'18 de novembro: 1 h previstos, 1 revisão pendente, 1 revisão feita'`; dia sem nada → `'20 de novembro: sem estudo'`.
  - `relatorio.test.ts`: `totaisDoIntervalo` soma só sessões dentro do intervalo; 7 acertos de 10 → `percentualAcerto 70`; sem questões → `null`.
- [ ] **Step 2:** `npx vitest run tests/unit/calendario.test.ts tests/unit/relatorio.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5: Commit** `feat(plano): projeção da fila no calendário do mês`

### Task 3: Banco — posição da fila e `concluir_bloco`

**Files:**
- Create: `supabase/migrations/20261118000000_fila.sql`, `tests/integracao/fila-rls.test.ts`

**Interfaces:**
- Produces (colunas): `planos.fila_posicao int not null default 0 check (fila_posicao >= 0)`, `planos.fila_desde date null` (null = fila desde o início do `gerado`).
- Produces (função, `security invoker`, `set search_path = ''`, EXECUTE só para `service_role`, como as do Plano 2):
  ```sql
  concluir_bloco(p_user uuid, p_plano uuid, p_esperada int, p_ajustado_lido timestamptz,
                 p_avancar boolean, p_sessao jsonb, p_revisoes jsonb, p_concluir boolean) returns jsonb
  ```
  `select ... from planos where id = p_plano and user_id = p_user and ativo for update`; sem linha → `raise ... using errcode = 'P0002'`; `fila_posicao <> p_esperada or ajustado_em is distinct from p_ajustado_lido` → `raise exception 'fila mudou' using errcode = 'EZ409'`; `v_sessao := public.registrar_sessao(p_user, p_plano, p_sessao, p_revisoes, p_concluir)`; se `p_avancar`, `fila_posicao = fila_posicao + 1, updated_at = now()`; devolve `jsonb_build_object('sessao_id', v_sessao, 'posicao', <posição final>)`.

- [ ] **Step 1: Testes que falham** (`tests/integracao/fila-rls.test.ts`, com `admin()`, `criarUsuarioTeste`, `emailUnico` de `tests/integracao/ajuda.ts`; plano inserido via `admin().from('planos').insert(...)` como em `acompanhamento-rls.test.ts`; `p_sessao` com as chaves das colunas de `sessoes_estudo`):
  - `plano novo tem fila_posicao 0 e fila_desde null`.
  - `cliente autenticado não altera fila_posicao` → `cliente.from('planos').update({ fila_posicao: 5 })` dá erro ou 0 linhas; valor continua 0. `fila_posicao = -1` via admin → erro de check.
  - `concluir_bloco grava a sessão e avança` → `{ sessao_id: <uuid>, posicao: 1 }`; 1 sessão; com `p_revisoes` de 2 intervalos → 2 revisões.
  - `p_avancar false grava e não avança` → `posicao 0`.
  - `posição esperada errada → EZ409 e nada gravado` (0 sessões, posição igual).
  - `ajustado_em diferente do lido → EZ409`.
  - `plano inativo ou de outro usuário → P0002`.
  - `duas chamadas em paralelo com a mesma esperada` (`Promise.all`) → uma devolve `posicao 1`, a outra erro `EZ409`; 1 sessão.
- [ ] **Step 2:** `npx supabase db reset` e `npx vitest run tests/integracao/fila-rls.test.ts` → FAIL.
- [ ] **Step 3:** Escrever a migração.
- [ ] **Step 4:** `npx supabase db reset` e `npm test` → PASS (todos os existentes continuam verdes).
- [ ] **Step 5: Commit** `feat(db): posição da fila e concluir_bloco`

### Task 4: Serviço e rotas de concluir/voltar bloco

**Files:**
- Create: `src/lib/planos/fila-servico.ts`, `src/app/api/planos/[id]/fila/concluir/route.ts`, `src/app/api/planos/[id]/fila/voltar/route.ts`, `tests/integracao/fila.test.ts`
- Modify: `src/lib/dominio/esquemas.ts`, `tests/unit/esquemas.test.ts`, `src/lib/planos/mensagens.ts`, `src/lib/acompanhamento/servico.ts` (exportar `exigirDentroDoLimiteDiario` e `pendentesDoTopico`, hoje privados)

**Interfaces:**
- Consumes: `concluir_bloco` (Task 3); `montarFila`, `blocoDaFila`, `topicoDoBloco` (Task 1); `exigirPodeRegistrar`, `AcompanhamentoError`, `exigirDentroDoLimiteDiario`, `pendentesDoTopico` (`src/lib/acompanhamento/servico.ts`); `revisoesParaCriar` (`src/lib/acompanhamento/revisoes.ts`); `INTERVALOS_REVISAO`; `respostaDeErroAcompanhamento` (`src/lib/acompanhamento/rota.ts`); `usuarioDaRequisicao`, `naoAutenticado`, `json` (`src/lib/editais/rota.ts`).
- Produces (`esquemas.ts`):
  ```ts
  export const EsquemaConcluirBloco; // z.object: posicaoEsperada int >= 0; minutos int 0–1440; acertos/erros int 0–10000 (default 0);
  //   concluirTopico boolean (default false); avancar boolean (default true); origem enum ['cronometro', 'rapido'];
  //   refine minutos > 0 || acertos + erros > 0 com MSG_TEMPO_OU_QUESTOES
  export const EsquemaVoltarBloco;   // z.object: posicaoEsperada int >= 0
  ```
- Produces (`mensagens.ts`): `MSG_FILA_MUDOU = 'A fila mudou em outra tela. Atualizamos para você.'`, `MSG_FILA_FIM = 'Você chegou ao fim da fila.'`.
- Produces (`fila-servico.ts`, `import 'server-only'`):
  ```ts
  export async function concluirBloco(userId: string, planoId: string, entrada: z.output<typeof EsquemaConcluirBloco>, agora?: Date): Promise<{ posicao: number; sessaoId: string }>;
  export async function voltarBloco(userId: string, planoId: string, entrada: z.output<typeof EsquemaVoltarBloco>): Promise<{ posicao: number }>;
  ```
- Rotas: `POST /api/planos/[id]/fila/concluir` → 200 `{ posicao, sessaoId }`; `POST /api/planos/[id]/fila/voltar` → 200 `{ posicao }`; 401 sem login; corpo inválido → 400 com a 1ª mensagem do zod; erros via `respostaDeErroAcompanhamento` (mesmo formato de `src/app/api/planos/[id]/ajustar/route.ts`).
- Regras de `concluirBloco`: `exigirPodeRegistrar` (sem plano ativo → 409); `planoId` não-uuid ou ≠ ativo → 404; lê com admin `gerado, conteudo, fila_posicao, fila_desde, ajustado_em` e os `topicos_concluidos`; `posicaoEsperada ≠ fila_posicao` → 409 `MSG_FILA_MUDOU`; `blocoDaFila` nulo → 409 `MSG_FILA_FIM`; tópico = `topicoDoBloco`; nomes vêm do conteúdo (matéria ausente → 400 `MSG_FORA_DO_PLANO`); `tipo` da sessão: estudo → `null`, `revisao_geral` → `'revisao'`, `simulado` → `'simulado'`; revisões só para estudo com tópico: `revisoesParaCriar(topico, hoje, INTERVALOS_REVISAO, await pendentesDoTopico(...))`; `concluirTopico` só vale com tópico; `data = hoje`; `exigirDentroDoLimiteDiario`; RPC com `p_ajustado_lido` = `ajustado_em` exatamente como lido; `EZ409` → 409 `MSG_FILA_MUDOU`; `P0002` → 404.
- Regras de `voltarBloco`: `exigirPodeRegistrar`; plano ≠ ativo → 404; `posicaoEsperada = 0` → `{ posicao: 0 }` se a posição é 0, senão 409; senão `update planos set fila_posicao = esperada − 1 where id, user_id, ativo, fila_posicao = esperada` (admin, `.select('fila_posicao')`); 0 linhas → 409 `MSG_FILA_MUDOU`. Não apaga sessão.

- [ ] **Step 1: Testes que falham:**
  - `esquemas.test.ts`: `EsquemaConcluirBloco` sem tempo e sem questões → erro `Informe o tempo ou as questões.`; `posicaoEsperada: -1` → erro; `origem: 'manual'` → erro; defaults `acertos 0, erros 0, concluirTopico false, avancar true`.
  - `tests/integracao/fila.test.ts` (serviço com `agora` fixo `2026-11-17T15:00:00Z`; planos inseridos via admin com `gerado` montado no teste):
    - `prazo: concluir grava a sessão do bloco atual e avança` → sessão com `disciplina_id`/`topico_id` do bloco 0, nomes do conteúdo, `data '2026-11-17'`, `origem 'cronometro'`, `minutos 50`; 4 revisões; resposta `{ posicao: 1 }`.
    - `dois cliques ao mesmo tempo` (`Promise.all` com `posicaoEsperada 0`) → um resolve, o outro rejeita `AcompanhamentoError` 409 `MSG_FILA_MUDOU`; `fila_posicao 1`; 1 sessão.
    - `salvar sem concluir (avancar false)` → 1 sessão, posição 0.
    - `concluirTopico grava topicos_concluidos`.
    - `bloco de simulado: sessão sem tópico, tipo simulado, sem revisões`; `revisao_geral → tipo revisao`.
    - `fila_desde: o bloco 0 é o primeiro com data >= fila_desde`.
    - `fim da fila no prazo` (`fila_posicao = M` via admin) → 409 `MSG_FILA_FIM`.
    - `ciclo: o tópico é o primeiro pendente e só muda com Concluí este tópico` → ciclo `[{d0,90},{d1,60}]`: pos 0 (d0) sem `concluirTopico` → sessão em `d0-t0`; pos 1 (d1) → `d1-t0`; pos 2 (d0, volta 2) de novo `d0-t0`, agora com `concluirTopico`; pos 3 (d1) → `d1-t0`; pos 4 (d0) → `d0-t1`.
    - `ciclo: matéria toda concluída → sessão sem tópico e sem revisões`.
    - `tela velha depois do ajuste` (`fila_posicao 0` e `ajustado_em` preenchidos via admin; cliente manda `posicaoEsperada 5`) → 409.
    - `voltar`: 2 → `{ posicao: 1 }`; em 0 → `{ posicao: 0 }`; esperada errada → 409; plano de outro usuário → 404; sem plano ativo → 409; a sessão do bloco continua no banco.
- [ ] **Step 2:** `npx vitest run tests/integracao/fila.test.ts tests/unit/esquemas.test.ts` → FAIL.
- [ ] **Step 3:** Ler a doc de Route Handlers em `node_modules/next/dist/docs/` (params como `Promise`); implementar serviço, esquemas, mensagens e as duas rotas.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `feat(api): concluir e voltar bloco da fila`

### Task 5: Ajuste semanal refaz a fila

**Files:**
- Create: `supabase/migrations/20261118000100_ajuste_fila.sql`
- Modify: `src/lib/plano/ajuste.ts`, `src/lib/plano/resumo.ts`, `src/lib/planos/ajuste-servico.ts`, `tests/unit/ajuste.test.ts`, `tests/unit/resumo-ajuste.test.ts`, `tests/integracao/ajuste.test.ts`, `tests/integracao/acompanhamento-rls.test.ts` (chamadas a `aplicar_ajuste`)

**Interfaces:**
- Consumes: `converterPosicaoFila` (Task 1); colunas da Task 3.
- Produces (SQL): `drop function public.aplicar_ajuste(uuid, timestamptz, jsonb, jsonb, jsonb, date, date, jsonb, jsonb, jsonb, timestamptz)` e cria
  ```sql
  aplicar_ajuste(p_plano uuid, p_ajustado_lido timestamptz, p_fila_lida int, p_gerado jsonb, p_ajustes jsonb,
                 p_fila_posicao int, p_fila_desde date, p_janela_inicio date, p_janela_fim date,
                 p_resumo jsonb, p_gerado_anterior jsonb, p_multiplicadores jsonb, p_agora timestamptz) returns uuid
  ```
  igual à atual, mas sem `ciclo_inicio`: `set gerado, ajustes, fila_posicao = coalesce(p_fila_posicao, fila_posicao), fila_desde = coalesce(p_fila_desde, fila_desde), ajustado_em = p_agora, updated_at = p_agora where id = p_plano and ativo and ajustado_em is not distinct from p_ajustado_lido and fila_posicao = p_fila_lida`. Grants como antes. (A coluna `ciclo_inicio` só sai na Task 6, quando ninguém mais a lê.)
- Produces (`ajuste.ts`):
  ```ts
  // ItemResumo ganha: | { tipo: 'fila_refeita' }
  // EntradaAjuste.posicaoAtual: number  // agora = planos.fila_posicao (contador da fila)
  // ResultadoAjuste: sai `cicloInicio`; entra
  fila: { posicao: number; desde: string | null } | null; // null = manter posição e fila_desde
  ```
  Prazo regerado (`dataProva > amanhã`) → `fila = { posicao: 0, desde: amanhã }` e item `{ tipo: 'fila_refeita' }` logo depois de `horas`/`sem_estudo` (antes de `prioridade`); prazo não regerado → `fila null`, sem o item; ciclo → `fila = { posicao: converterPosicaoFila(antigo, e.posicaoAtual, novoNaOrdemAntiga), desde: null }`, sem o item. `converterPosicao` deixa de ser importado.
- Produces (`resumo.ts`): `fila_refeita` → `'A fila foi refeita com o que falta estudar.'`
- `ajuste-servico.ts`: `LinhaPlano` troca `ciclo_inicio` por `fila_posicao: number; fila_desde: string | null` (e o `select`); `posicaoAtual = plano.fila_posicao`; RPC com `p_fila_lida: plano.fila_posicao`, `p_fila_posicao: resultado.fila?.posicao ?? null`, `p_fila_desde: resultado.fila?.desde ?? null`; sessões lidas desde `hoje − JANELA_ACERTO_DIAS` (sem o `desde` do ciclo); sem `posicaoEmMinutos`/`minutosRegistradosNoCiclo`.

- [ ] **Step 1: Testes que falham:**
  - `ajuste.test.ts`: `prazo regerado: fila volta a 0 desde amanhã e o resumo diz fila_refeita` (`r.fila` = `{ posicao: 0, desde: '<hoje+1>' }`; índice de `fila_refeita` = logo após o item de horas); `prova amanhã: fila null e sem fila_refeita`; reescrever `preserva a ordem dos itens (novos no fim) e cicloInicio aponta para a mesma materia` como `… e a fila aponta para a mesma matéria na mesma volta` (`posicaoAtual: 3` num ciclo de 2 itens → `novo[r.fila.posicao % n].disciplinaId === 'd1'` e `Math.floor(r.fila.posicao / n) === 1`); trocar a expectativa `r.cicloInicio` toBeNull (linha ~221) por `r.fila` null; `nada mudou: em_dia` continua verde.
  - `resumo-ajuste.test.ts`: `fila_refeita` → `'A fila foi refeita com o que falta estudar.'`.
  - `tests/integracao/ajuste.test.ts`: `prazo vencido com fila_posicao 5 → fila_posicao 0, fila_desde amanhã e resumo com fila_refeita`; `ciclo vencido com fila_posicao 3 → posição na mesma matéria e volta`; trocar a checagem de `ciclo_inicio` (linhas ~97–103) por `fila_posicao`.
  - `acompanhamento-rls.test.ts`: chamadas de `aplicar_ajuste` com a nova assinatura; novo caso `p_fila_lida velho devolve null e não grava` (posição mudou entre a leitura e a gravação).
- [ ] **Step 2:** `npx supabase db reset` e `npx vitest run tests/unit/ajuste.test.ts tests/unit/resumo-ajuste.test.ts tests/integracao/ajuste.test.ts tests/integracao/acompanhamento-rls.test.ts` → FAIL.
- [ ] **Step 3:** Migração e código.
- [ ] **Step 4:** `npx supabase db reset`, `npm test` e `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(plano): ajuste semanal refaz a fila`

### Task 6: Início — próximo bloco, cronômetro, concluir/voltar e próximos blocos

**Files:**
- Create: `src/components/inicio/PainelInicio.tsx`, `src/components/inicio/CartaoProximoBloco.tsx`, `src/components/inicio/PassoConcluir.tsx`, `src/components/inicio/ProximosBlocos.tsx`, `src/components/inicio/MeuProgresso.tsx`, `src/components/inicio/api.ts`, `e2e/inicio.spec.ts`, `supabase/migrations/20261118000200_remover_ciclo_inicio.sql` (`alter table public.planos drop column ciclo_inicio;`)
- Modify: `src/app/app/(painel)/plano/page.tsx`, `src/lib/acompanhamento/consultas.ts`, `src/lib/planos/ciclo.ts` (fica só `ehDiaDeEstudo`), `src/lib/plano/consultas.ts` (fica só `progresso`), `src/lib/dominio/tipos.ts` (sai `PosicaoCiclo`), `src/app/globals.css`, `tests/unit/consultas.test.ts` (fica só `progresso`)
- Delete: `src/components/plano/PainelPlano.tsx`, `Hoje.tsx`, `Semana.tsx`, `useRegistroRapido.ts`, `tests/unit/registro-rapido.test.ts`, `tests/unit/ciclo.test.ts`

**Interfaces:**
- Consumes: Task 1 (`montarFila`, `blocoDaFila`, `proximosBlocos`, `rotuloDoBloco`, `topicoDoBloco`, `QUANTIDADE_PROXIMOS`); `totaisDoIntervalo` (Task 2); rotas da Task 4; `useCronometro`, `FORMULARIO_VAZIO`, `formatarRelogio`, `formatarDuracao` (`src/components/estudo/useCronometro.ts`); `minutosParaRegistro`, `ESQUECIDO_SEG` (`src/lib/acompanhamento/cronometro.ts`); `intervaloDoPeriodo` (`relatorio.ts`); `progresso` (`src/lib/plano/consultas.ts`); componentes existentes `ResumoAjuste`, `RevisoesHoje`, `RegistroManual`, `RegistroRapido`; `pedir` (`src/components/onboarding/api.ts`); `indicesDasMaterias`, `estiloMateria` (`src/components/cores.ts`).
- Produces (`consultas.ts`): `LinhaPlanoAtivo` troca `ciclo_inicio` por `fila_posicao: number; fila_desde: string | null` (select idem; sai `cicloInicioValido`); `sessoesDoPlano(planoId: string, desde?: string, ate?: string): Promise<Sessao[]>` (`ate` inclusivo); saem `minutosDeSessoesDoCiclo` e `sessoesRapidasDoDia`.
- Produces (`api.ts`):
  ```ts
  export type RespostaFila = { ok: true; posicao: number } | { ok: false; status: number; erro: string };
  export function concluirBlocoNaApi(planoId: string, corpo: { posicaoEsperada: number; minutos: number; acertos: number; erros: number; concluirTopico: boolean; avancar: boolean; origem: 'cronometro' | 'rapido' }): Promise<RespostaFila>;
  export function voltarBlocoNaApi(planoId: string, posicaoEsperada: number): Promise<RespostaFila>;
  ```
- Produces (`PainelInicio`, client — a Task 7 acrescenta o calendário na coluna direita):
  ```ts
  export interface PropsInicio {
    planoId: string; userId: string; hoje: string; titulo: string; origem: string | null; dataProva: string | null;
    disciplinas: DisciplinaPlano[]; gerado: PlanoGerado; filaDesde: string | null; posicao: number; concluidos: string[];
    revisoes: Revisao[]; sessoes: Sessao[]; minutosPorDia: number[]; iniciarAoAbrir: boolean;
    ajusteNaoVisto: AjusteNaoVisto | null; ultimoAjuste: string | null;
  }
  ```
- Página: ler a doc de páginas/`searchParams` (Promise) e Cache Components em `node_modules/next/dist/docs/`; dentro de `<Suspense>` como hoje: `exigirUsuario` → `ajustarSeVencido` → `planoAtivoOuRedireciona` → `topicos_concluidos`, `revisoesDoPlano`, `sessoesDoPlano(plano.id, inicioDaSemana)`, `ultimoAjusteNaoVisto`; `iniciarAoAbrir = searchParams.iniciar === '1'`; `key={plano.id}` no painel.
- Ordem e cópia (spec §6.2): no celular, título do plano (como hoje, `lg:hidden`) → `ResumoAjuste` (faixa, com "Ajustar agora") → cartão **Próximo bloco** (único elemento forte, navy, classe de entrada `agora-entrada`) → `MeuProgresso` (uma linha: `{p}% do edital` com barra, `{formatarMinutos(m)} esta semana`, `{x}% de acerto` só se houver questões) → grade **Próximos blocos** | coluna direita (calendário, Task 7) → **Revisões de hoje** (`RevisoesHoje`, hoje + atrasadas) | `<details>` **Registrar sem cronômetro** (fechado por padrão; dentro, `RegistroManual` e `RegistroRapido`). Duas colunas com `min-[1100px]:`.
- Cartão: `h2` "Próximo bloco"; linha com bolinha da cor da matéria, nome e `rotuloDoBloco`; tópico em `text-[1.75rem] sm:text-[2rem] font-semibold` (simulado → `Simulado`; revisão geral → `Revisão geral de {matéria}`; ciclo sem pendente → `Todos os tópicos desta matéria estão concluídos.`); minutos previstos (`formatarMinutos`); relógio `role="timer"` `HH:MM:SS`; botões `Iniciar` / `Pausar` / `Retomar`, `Concluir bloco`, `Voltar um bloco` (desabilitado na posição 0); caixa `Concluí este tópico` só com tópico — é só uma marca levada ao concluir (não grava sozinha); tópico já concluído → caixa marcada e desabilitada com rótulo `Tópico já concluído`. Fim da fila (prazo) → `Você chegou ao fim da fila.` + `Voltar um bloco`. Fila vazia → `Sem blocos para estudar.` + link `Novo plano` (`/app/novo`).
- `Iniciar` com cronômetro parado e zerado: `c.iniciar({ ...FORMULARIO_VAZIO, disciplinaId, topicoId })` do bloco atual; com tempo acumulado: `c.iniciar()` (retoma). O cronômetro é um só e vale para o bloco que está na tela. `iniciarAoAbrir`: uma vez, se não estiver rodando, inicia/retoma e tira `?iniciar=1` da URL (`history.replaceState` + `router.replace('/app/plano', { scroll: false })`, como `Cronometro.tsx` faz hoje — cuidado com a Activity: a página escondida não desmonta).
- `PassoConcluir` (abre ao clicar `Concluir bloco`): campos `Minutos` (preenchido com `minutosParaRegistro(segundos)` se `segundos >= 30`, senão os minutos do bloco), `Acertos`, `Erros`, caixa `Concluí este tópico` (mesmo estado do cartão), aviso `O cronômetro ficou ligado por {formatarDuracao(s)}. Confira o tempo antes de salvar.` acima de `ESQUECIDO_SEG`; botões `Concluir bloco` (avancar true), `Salvar sem concluir` (avancar false), `Cancelar`; `origem = segundos >= 30 ? 'cronometro' : 'rapido'`; botões desabilitados com requisição em voo; erros em `role="alert"`.
- Sucesso: `c.limpar()`, posição local = `resposta.posicao` (para a transição), anúncio `Bloco concluído.` / `Sessão salva.` em `role="status"`, `router.refresh()`. 409: mostra a mensagem do servidor, **não** limpa o rascunho, `router.refresh()`.
- Grade: `ol` com `aria-label="Próximos blocos"`, `QUANTIDADE_PROXIMOS` itens de `proximosBlocos`; cada um com número (`numeracao(...).numero`), bolinha + matéria, minutos; no prazo também o tópico (ou Simulado/Revisão geral); no ciclo só matéria e minutos. 2 colunas no celular largo, até 4 no computador. `key` = posição (a grade "anda" uma posição).
- `globals.css`: `@keyframes bloco-entrada` (opacidade 0→1, `translateY(8px)`→0, 0,35 s `var(--ease-saida)`) aplicada ao conteúdo do cartão com `key` = posição; `.bloco-entrada` dentro do bloco `prefers-reduced-motion` com `animation: none`.

- [ ] **Step 1: Testes e2e que falham** (`e2e/inicio.spec.ts`, `test.describe.configure({ timeout: 120_000 })`, `criarPlano` de `e2e/ajuda.ts`):
  - `concluir bloco avança e sobrevive a recarregar` → cartão mostra `/Bloco 1 de \d+/`; guardar o tópico do 1º item da grade; `Concluir bloco` → passo com `Minutos` preenchido (`/^\d+$/`) → `Concluir bloco` → `/Bloco 2 de/` e o tópico guardado no cartão; `page.reload()` → continua `Bloco 2`.
  - `voltar um bloco recua sem apagar a sessão` → depois de concluir, `Voltar um bloco` → `Bloco 1`; `/app/historico` lista 1 sessão.
  - `salvar sem concluir não avança` → `Salvar sem concluir` → continua `Bloco 1`; histórico com 1 sessão.
  - `cronômetro no Início sobrevive a recarregar` → `Iniciar`, esperar 2 s, recarregar → timer ≥ `00:00:02` e `Pausar` visível; `Pausar`, recarregar → mesmo valor e `Retomar` visível.
  - `ciclo mostra a volta` → `criarPlano(page, { dataProva: null })` → `Bloco 1 · volta 1`; concluir → `Bloco 2 · volta 1`.
  - `fila mudou em outra aba: avisa, atualiza e mantém o cronômetro` → duas páginas no mesmo contexto; na B, `Iniciar`; na A, concluir; na B, `Concluir bloco` → `Concluir bloco` → alerta com `A fila mudou em outra tela` e, depois, `Bloco 2`; o timer da B continua contando.
  - `/app/plano?iniciar=1 inicia o cronômetro` → `Pausar` visível e URL termina em `/app/plano`.
  - Os specs antigos que usam Hoje/"Estudei"/Semana (`e2e/acompanhamento.spec.ts`, `e2e/estudo.spec.ts`, o caso de ciclo de `e2e/onboarding.spec.ts`) ficam quebrados até a Task 11 — **não** rodá-los aqui.
- [ ] **Step 2:** `npx supabase db reset` e `npx playwright test e2e/inicio.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar; remover o código morto listado (`grep -rn "ciclo_inicio\|PosicaoCiclo\|tarefasDoDia\|topicosDosBlocos\|posicaoEmMinutos\|sessoesRapidasDoDia" src tests` deve voltar vazio).
- [ ] **Step 4:** `npx playwright test e2e/inicio.spec.ts`, `npm test`, `npx tsc --noEmit`, `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(inicio): próximo bloco com cronômetro, concluir e voltar`

### Task 7: Início — calendário do mês

**Files:**
- Create: `src/components/inicio/Calendario.tsx`, `src/components/inicio/DetalheDia.tsx`
- Modify: `src/components/inicio/PainelInicio.tsx` (prop `mes: string`), `src/app/app/(painel)/plano/page.tsx`, `e2e/inicio.spec.ts`

**Interfaces:**
- Consumes: `projetarFila`, `gradeDoMes`, `mesValido`, `mesVizinho`, `montarCalendario`, `rotuloDoDia`, `DiaCalendario` (Task 2); `PropsInicio` (Task 6); `useRevisoes`, `ItemRevisao` (`src/components/revisoes/`); `sessoesDoPlano(planoId, desde, ate)` (Task 6).
- Página: `mes = mesValido(searchParams.mes, hoje)`; sessões lidas de `min(inicioDaSemana, gradeDoMes(mes)[0])` até `max(hoje, último dia da grade)`; `PropsInicio` ganha `mes`. A projeção roda no cliente: `projetarFila({ fila, posicao, minutosPorDia, hoje, registradosHoje: soma das sessões de hoje, dataProva: gerado.modo === 'prazo' ? dataProva : null, ate: último dia da grade })` — mês todo no passado → sem projeção.
- Calendário: título `dataPorExtenso(`${mes}-01`, { month: 'long', year: 'numeric' })`; links `?mes=` com `aria-label` `Mês anterior` / `Próximo mês` e `Hoje` quando o mês não é o atual (`scroll: false`); 7 colunas D S T Q Q S S (nomes inteiros só para leitor de tela); cada dia é um `<button aria-label={rotuloDoDia(d)} aria-pressed>` (≥ 44 px) com o número, as horas (passado/hoje) ou a previsão em `text-texto-suave` (futuro) e a contagem de revisões; hoje com borda de destaque; dias de fora do mês apagados.
- `DetalheDia` (abaixo do calendário, `aria-live="polite"`; dia inicial = hoje quando está no mês): título `dataPorExtenso(data, { weekday: 'long', day: 'numeric', month: 'long' })`; seções `Estudo` (matéria · tópico · minutos das sessões do dia), `Revisões` (itens com concluir/desfazer via `useRevisoes`), `Previsto` (blocos: matéria · minutos, tópico no prazo); vazio `Nada neste dia.`.

- [ ] **Step 1: Teste e2e que falha** (`e2e/inicio.spec.ts`): `calendário mostra revisões no dia certo` → criar plano, concluir o 1º bloco (passo com os minutos padrão); para `amanhã` e `hoje + 7` (navegar `Próximo mês` se cair no mês seguinte), o botão do dia com nome `new RegExp('^' + diaPorExtenso + ':.*1 revisão pendente')` está visível (`diaPorExtenso` calculado no teste com `Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' })`); clicar → `Revisões` do detalhe mostra o tópico do bloco concluído; o botão de hoje tem `estudados` no nome.
- [ ] **Step 2:** `npx playwright test e2e/inicio.spec.ts -g "calendário"` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npx playwright test e2e/inicio.spec.ts`, `npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** `feat(inicio): calendário do mês com estudo, revisões e previsão`

### Task 8: Aba Conteúdos

**Files:**
- Create: `src/app/app/(painel)/conteudos/page.tsx`, `src/components/conteudos/ListaConteudos.tsx`, `e2e/conteudos.spec.ts`
- Modify: `src/components/app/secoes.ts` (acrescenta `{ href: '/app/conteudos', rotulo: 'Conteúdos', icone: ListTree }` no fim), `e2e/paginas.spec.ts` (rota `conteudos` na lista de redirecionamento sem login)
- Delete: `src/components/plano/Progresso.tsx`

**Interfaces:**
- Consumes: `planoAtivoOuRedireciona` (`src/lib/acompanhamento/consultas.ts`); `useMarcacoes(planoId, iniciais)` → `{ concluidos, marcar(topicoId, nome, feito), erro, anuncio }` (`src/components/plano/useMarcacoes.ts`); `Bolha`, `Avisos` (`src/components/plano/`); `progresso`; `indicesDasMaterias`/`estiloMateria`.
- Página (ler a doc de páginas em `node_modules/next/dist/docs/`; `<Suspense>` como as demais): lê o plano e os `topicos_concluidos`; `h1` `Conteúdos`; `Avisos` do `gerado` no topo (saem do Início); linha `{p}% do edital · {c} de {t} tópicos`; por matéria (`h2` 20 px 600 com bolinha): `{c} de {t} tópicos` + barra (`.barra`) e a lista de tópicos com `Bolha` rotulada pelo nome do tópico; erro em `role="alert"`, anúncio em `role="status"`.

- [ ] **Step 1: Testes e2e que falham** (`e2e/conteudos.spec.ts`): `marcar tópico sobe o progresso e sobrevive a recarregar` (marcar o 1º tópico → `1 de` na matéria; recarregar → continua marcado); `tópico concluído em Conteúdos aparece no Início` (ler o tópico do cartão no Início, marcá-lo em Conteúdos, voltar pela aba `Início`/`Plano` → caixa `Tópico já concluído`); em `paginas.spec.ts`, `/app/conteudos sem login redireciona para /entrar`.
- [ ] **Step 2:** `npx playwright test e2e/conteudos.spec.ts e2e/paginas.spec.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** mesmo comando → PASS; `npx tsc --noEmit` ok.
- [ ] **Step 5: Commit** `feat(conteudos): edital verticalizado com progresso por matéria`

### Task 9: Navegação — Início no lugar de Plano e Estudar redireciona

**Files:**
- Modify: `src/components/app/secoes.ts`, `next.config.ts`, `e2e/inicio.spec.ts`
- Delete: `src/app/app/(painel)/estudar/page.tsx`, `src/components/estudo/Cronometro.tsx`

**Interfaces:**
- Produces: `SECOES` = `[{ '/app/plano', 'Início', House }, { '/app/revisoes', 'Revisões', Repeat2 }, { '/app/historico', 'Histórico', History }, { '/app/relatorio', 'Relatório', ChartColumn }, { '/app/conteudos', 'Conteúdos', ListTree }]` (lucide-react); `BarraLateral`/`NavegacaoInferior`/`NavegacaoLateral` continuam lendo `SECOES` (conferir com `grep -rn "'Plano'\|Estudar" src` que não sobrou rótulo fixo).
- `next.config.ts`: `async redirects() { return [{ source: '/app/estudar', destination: '/app/plano', permanent: false }]; }` — a query (`?disciplina&topico&iniciar=1`) passa adiante; o Início usa só `iniciar=1` (o cronômetro é do bloco atual). Ler antes a doc de `redirects` em `node_modules/next/dist/docs/` e confirmar a ordem redirects → proxy (sem login: `/app/estudar` → `/app/plano` → `/entrar`).

- [ ] **Step 1: Testes e2e que falham** (`e2e/inicio.spec.ts`): `Estudar redireciona para o Início e inicia o cronômetro` → `goto('/app/estudar?disciplina=d0&topico=d0-t0&iniciar=1')` → URL termina em `/app/plano`, `Pausar` visível; a navegação (`nav` `aria-label="Seções"`) não tem `Estudar` e tem `Início` com `aria-current="page"`. `e2e/paginas.spec.ts`: o caso `/app/estudar sem login redireciona para /entrar` continua verde.
- [ ] **Step 2:** `npx playwright test e2e/inicio.spec.ts -g "Estudar"` → FAIL.
- [ ] **Step 3:** Implementar e apagar os arquivos mortos.
- [ ] **Step 4:** `npx playwright test e2e/inicio.spec.ts e2e/paginas.spec.ts`, `npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(app): aba Início e Estudar redireciona para ela`

### Task 10: Texto calmo em todas as telas

**Files:**
- Create: `tests/unit/tipografia.test.ts`
- Modify: `src/app/layout.tsx` (pesos da fonte), `src/app/globals.css`, `src/components/estilos.ts`, e todo `src/**/*.tsx` que o teste apontar (hoje: `grep -rln "text-xs\|font-bold\|font-extrabold\|font-medium" src` — ~35 arquivos, incluindo onboarding, histórico, relatório, revisões, entrar e página inicial)

**Interfaces:**
- Produces (`estilos.ts`): `rotulo = 'text-sm text-texto-medio'` (400); botões (`botaoPrimario`, `botaoSecundario`, `botaoTexto`) em `font-semibold`; `alerta` sem peso extra; `tituloSecao = 'text-xl font-semibold tracking-tight text-texto'` (20 px). Mapa de troca: `font-bold`/`font-extrabold` → `font-semibold` em títulos, botões e números grandes, `font-normal` (ou nada) no resto; `font-medium` → nada; `text-xs` → `text-sm` (metadados 14 px em `text-texto-suave`).
- `layout.tsx`: `Plus_Jakarta_Sans({ weight: ['400', '600'], ... })`. `globals.css`: `body { font-size: 1rem; line-height: 1.5; }`; `b, strong { font-weight: 600; }` (o preflight usa `bolder`, que viraria 700); nenhum `font-weight` além de 400/600/`normal`; nenhum `font-size` abaixo de 13 px.
- Menos texto: no máximo uma frase curta por seção; tirar as frases explicativas repetidas (ex.: o subtítulo de `RegistroManual`, que no Início fica dentro de "Registrar sem cronômetro").

- [ ] **Step 1: Teste que falha** (`tests/unit/tipografia.test.ts`, lendo os arquivos com `fs` e glob de `src/**/*.{ts,tsx}`):
  - `só pesos 400 e 600 nas classes` → nenhum match de `/\bfont-(thin|extralight|light|medium|bold|extrabold|black)\b/` (a mensagem do teste lista arquivo:linha).
  - `nada abaixo de 13 px` → nenhum `/\btext-xs\b/`, nenhum `text-[Npx]` com N < 13, nenhum `text-[Nrem]` com N < 0.8125; em `globals.css`, nenhum `font-size` em px < 13.
  - `a fonte carrega só 400 e 600` → `layout.tsx` contém `weight: ["400", "600"]` (aspas simples ou duplas).
  - `CSS só com pesos 400 e 600` → todo `font-weight:` de `globals.css` ∈ {`400`, `600`, `normal`} e há regra `b, strong` com 600.
  - `corpo com 16 px e linha 1,5` → o bloco `body` de `globals.css` tem `font-size: 1rem` (ou `16px`) e `line-height: 1.5`.
- [ ] **Step 2:** `npx vitest run tests/unit/tipografia.test.ts` → FAIL (lista os arquivos).
- [ ] **Step 3:** Passar por todas as telas (Início, Revisões, Histórico, Relatório, Conteúdos, onboarding, entrar, página inicial, menus) aplicando o mapa; conferir no navegador claro/escuro que a hierarquia continua clara (o tópico do próximo bloco é, de longe, o maior texto do Início).
- [ ] **Step 4:** `npx vitest run tests/unit/tipografia.test.ts`, `npm test`, `npm run lint`, `npm run build` → PASS.
- [ ] **Step 5: Commit** `style: texto calmo (16 px, pesos 400 e 600) em todas as telas`

### Task 11: E2E antigos no fluxo novo, capturas e portão final

**Files:**
- Modify: `e2e/estudo.spec.ts`, `e2e/acompanhamento.spec.ts`, `e2e/onboarding.spec.ts`, `e2e/inicio.spec.ts`, `docs/deploy.md` (as 3 migrações novas, no mesmo formato das do Plano 2)

**Interfaces:**
- Consumes: telas das Tasks 6–9. Registrar avulso agora = abrir `Registrar sem cronômetro` no Início (`/app/plano`) e usar o mesmo formulário de antes.
- Mapa dos testes existentes:
  - `estudo.spec.ts`: `cronômetro sobrevive a recarregar` → apagar (coberto em `inicio.spec.ts`); `registro manual salva` → no Início, dentro de `Registrar sem cronômetro` (sem a metade "parar o cronômetro abre o formulário", coberta pelo passo de concluir); `registro rápido lembra a última matéria e o link de Hoje inicia o cronômetro` → fica só a metade do registro rápido, no Início; `registro cria revisões na agenda` e `falhas ao concluir ou excluir revisão voltam ao estado anterior` → registrar pelo Início em vez de `/app/estudar`.
  - `acompanhamento.spec.ts`: `Estudei registra e desfaz`, `Iniciar do mesmo estudo retoma o cronômetro parado`, `Iniciar retoma o cronômetro mesmo saindo antes de a página sem o pedido chegar`, `tópico concluído em Estudar aparece concluído ao voltar para Plano pela aba` → apagar (substituídos por `inicio.spec.ts` e `conteudos.spec.ts`); `cronômetro pausado continua pausado ao sair e voltar pela aba Estudar` → `… pela aba Revisões` (Início → Revisões → Início); `histórico edita e exclui` e `relatório mostra o tempo, o acerto e o assunto a reforçar` → registrar pelo Início; `ajustar agora mostra resumo` → sem mudança de fluxo.
  - `onboarding.spec.ts`: `ciclo: topico de hoje fica fixo e pode ser desmarcado` → `ciclo: o tópico do bloco fica até concluir o tópico` (concluir sem `Concluí este tópico` → quando a matéria volta, mesmo tópico; com a caixa → próximo tópico; recarregar mantém).
- Capturas (`inicio.spec.ts`, teste `capturas do Início`): tema `light`/`dark` (`localStorage['editaliza:tema']`) × `1280×900` e `375×812` → `page.screenshot({ path: 'test-results/capturas/inicio-{tema}-{largura}.png', fullPage: true })` e `expect(document.documentElement.scrollWidth <= innerWidth)`; o revisor abre as 4 imagens e confere: próximo bloco como o elemento mais forte, letra legível, sem negrito solto.

- [ ] **Step 1:** Atualizar os specs pelo mapa e escrever o teste de capturas.
- [ ] **Step 2:** `npx playwright test` → PASS (todos os specs).
- [ ] **Step 3:** Conferir as 4 capturas em `test-results/capturas/` (claro/escuro, computador/celular).
- [ ] **Step 4:** `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:e2e`, `npm run build` → todos verdes.
- [ ] **Step 5: Commit** `test(e2e): fluxos no Início, capturas e documentação das migrações`
