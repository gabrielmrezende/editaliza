# Editaliza — Plano 2: Acompanhamento e ajuste (design)

Data: 2026-11-16
Base: `docs/superpowers/specs/2026-11-16-editaliza-saas-design.md` (seções 7.4–7.6) e `docs/superpowers/decisoes-plano-1.md` (pendências "parked").

## 1. Intenção e porquê

O Plano 1 entrega o plano (hoje / semana / progresso), mas o aluno só consegue marcar tópicos como concluídos. O produto promete um plano que **se ajusta sozinho conforme ele estuda** — para isso o app precisa saber o que o aluno de fato estudou (tempo, questões, acertos) e reagir.

O Plano 2 traz para o SaaS a parte de "acompanhar o estudo" do app antigo (`legado/index.html`), generalizada para qualquer edital e salva no banco por aluno, e fecha o ciclo com o ajuste semanal. É o que transforma o plano de um calendário estático em um acompanhamento — e o que justifica a assinatura (Plano 3).

## 2. Objetivos

1. **Cronômetro** de estudo: iniciar / pausar / retomar / parar; ao parar, abre o formulário de registro já com o tempo. Se a aba fechar, o rascunho volta ao reabrir (neste aparelho).
2. **Registro de sessão** manual (data, matéria, tópico, tempo, questões, acertos/erros, tipo, observação) e **rápido** (um toque no bloco de "Hoje": "Estudei", com os minutos do bloco).
3. **Revisões espaçadas** de 1, 7, 21 e 30 dias, criadas automaticamente quando um tópico é estudado; **agenda** com atrasadas / hoje / esta semana / próximas / concluídas.
4. **Histórico** de sessões com edição e exclusão.
5. **Relatório**: tempo por matéria (estudado vs. planejado), assuntos para reforçar, revisões da semana, comparação com a semana anterior.
6. **Tema claro/escuro** (volta o escuro removido no Plano 1).
7. **Ajuste semanal** do plano: horas estudadas vs. planejadas, acerto por matéria e revisões vencidas recalculam o plano; o aluno vê um resumo curto do que mudou e por quê.
8. Pendências do Plano 1: mensagem de cota na linha compartilhada, mesmo tópico duas vezes num dia de ciclo, avanço do ciclo por dia de estudo.

## 3. Não-objetivos

- Cobrança, teste grátis, bloqueio de recursos pagos (Plano 3). Mas toda escrita nova passa por um único ponto no servidor, onde o Plano 3 vai pôr a checagem de assinatura.
- Cronômetro sincronizado entre aparelhos (decisão do dono: rascunho só neste aparelho).
- Metas configuráveis (horas/questões por semana) do app antigo, backup/importação JSON, editor manual do ciclo, calendário mensal de registros. O plano já é a meta.
- Notificações (e-mail/push) de revisão.
- Importar dados do app antigo.

## 4. Anti-objetivos

- **Perder estudo registrado** — ao fechar a aba com cronômetro ligado, ao trocar de plano, ao editar o conteúdo. Sessões guardam o nome da matéria/tópico (não só o id) e nunca são apagadas por troca de plano.
- **Ajuste que "pula" sem explicação** — toda mudança do ajuste aparece no resumo em linguagem simples.
- **Ajuste que explode** — prioridade que cresce semana após semana. Os multiplicadores são recalculados do zero a cada ajuste, a partir de janelas fixas, e têm teto.
- **Plano impossível**: o ajuste respeita as horas informadas, como o gerador.
- **Registrar estudo de outro aluno / ver dados de outro** — RLS em tudo, escrita só pelo servidor.

## 5. Restrições

- Mesma base do Plano 1: Next.js 16 (App Router, Cache Components), Supabase com RLS, escrita só via API com service role (decisão R5/I6 do Plano 1), regras em módulos puros de TypeScript com testes Vitest, e2e Playwright, pt-BR, datas de calendário em `America/Sao_Paulo` (`src/lib/datas.ts`).
- O gerador (`src/lib/plano/gerar.ts`) continua determinístico: mesma entrada → mesmo plano.
- Celular primeiro (alvos ≥ 44 px, 375 px de largura sem rolagem lateral).

## 6. Abordagens consideradas

| Abordagem | Trade-off |
|---|---|
| **A. Ajuste = multiplicadores por matéria + regerar com o mesmo gerador a partir de hoje** ✅ | Reaproveita o algoritmo testado; o conteúdo pendente se redistribui sozinho nos dias que restam; explicável (cada multiplicador tem um motivo). Os dias passados do calendário somem do `gerado` (o histórico real fica nas sessões). |
| B. Replanejamento incremental (mexer só nos dias futuros do calendário existente) | Preserva o calendário passado, mas duplica regras de encaixe/distribuição e é difícil de testar. |
| C. Ajuste por tarefa agendada (cron) no servidor | Ajusta mesmo sem o aluno abrir o app, mas exige infraestrutura (Vercel Cron/fila) sem ganho — o ajuste só importa quando ele abre. |

Escolha do Claude (o dono entregou o "como"): **A**, disparado de forma preguiçosa ao abrir o plano (≥ 7 dias desde o último ajuste) ou pelo botão "Ajustar agora".

Decisões do dono (perguntadas nesta conversa):
- **Ciclo avança pelo estudo registrado**, não pelo calendário.
- **Ajuste aplica sozinho e mostra o resumo** (não pede confirmação).
- **Revisões automáticas ao estudar um tópico** (1/7/21/30), sem duplicar; no registro o aluno pode desmarcar intervalos.
- **Rascunho do cronômetro só neste aparelho** (navegador).

## 7. O produto

### 7.1 Navegação

Área logada ganha cinco seções: **Plano** (`/app/plano`, a tela atual), **Estudar** (`/app/estudar`: cronômetro + registro), **Revisões** (`/app/revisoes`), **Histórico** (`/app/historico`), **Relatório** (`/app/relatorio`). No celular, barra fixa embaixo com as cinco; em tela larga, abas no cabeçalho. O cabeçalho tem o botão de tema e "Novo plano". Todas exigem plano ativo (sem plano → `/app/novo`), exceto o histórico, que mostra também sessões de planos antigos.

### 7.2 Registro de sessão

Campos de uma sessão:

| Campo | Regra |
|---|---|
| data | aaaa-mm-dd, não no futuro (hoje em São Paulo), no máximo 1 ano atrás |
| matéria | uma do plano ativo (id + nome guardados) |
| tópico | opcional; um tópico daquela matéria no plano (id + nome guardados) |
| minutos | inteiro 1–1440 (pode ser 0 só se houver questões) |
| acertos, erros | inteiros ≥ 0; questões = acertos + erros (não há campo "questões" separado) |
| tipo | `teoria` · `questoes` · `revisao` · `simulado` · `lei_seca` · `jurisprudencia` · `discursiva` · nulo |
| observação | texto ≤ 1000 caracteres |
| origem | `cronometro` · `manual` · `rapido` (gravada pelo servidor conforme a rota/flag) |

Junto do registro, dois controles (só se houver tópico):
- **Revisões**: 1, 7, 21, 30 dias — marcados por padrão; o aluno pode desmarcar.
- **"Concluí este tópico"**: marca o tópico como concluído no plano (mesma tabela `topicos_concluidos`).

**Registro rápido**: cada bloco de estudo de "Hoje" ganha o botão **"Estudei"** → grava sessão com a matéria/tópico do bloco, os minutos do bloco, data de hoje, origem `rapido`, revisões padrão. Depois de gravar, o bloco mostra "Registrado · desfazer" (desfazer = apagar a sessão). Em "Estudar" há também um registro rápido avulso (matéria, tópico, minutos) que lembra a última matéria/tópico usados.

### 7.3 Cronômetro

Estado no navegador: `{ rodando, iniciadoEm (ms), acumuladoSeg, formulario }`. O tempo é sempre derivado de `Date.now() - iniciadoEm + acumulado` (nunca de contagem de ticks), então aba em segundo plano ou fechada não perde tempo.

- Rascunho em `localStorage`, chave por usuário (`editaliza:cronometro:{userId}`), gravado a cada início/pausa/mudança do formulário e no `pagehide`; apagado ao registrar ou descartar.
- Ao reabrir: rascunho válido volta como estava (rodando continua contando; pausado fica pausado). Rascunho inválido/corrompido é ignorado.
- **Cronômetro esquecido**: se o tempo passar de 6 h, ao parar o formulário avisa "o cronômetro ficou ligado por 7h 12min — confira o tempo" e o campo de minutos fica editável (sempre é editável antes de salvar; o limite de 1440 vale).
- Parar → formulário de registro preenchido (minutos arredondados para cima a partir de 30 s; menos de 1 minuto pede confirmação/descartar). "Descartar" pede confirmação.
- Título da aba mostra o tempo enquanto roda (ajuda quem troca de aba).
- Botão "Iniciar" em cada bloco de "Hoje" abre "Estudar" com matéria/tópico já escolhidos e o cronômetro rodando (se já houver um cronômetro em andamento, pergunta antes de trocar).

### 7.4 Revisões espaçadas

- Intervalos padrão: **1, 7, 21, 30 dias** a partir da data do estudo.
- **Criação automática**: ao gravar uma sessão com tópico (intervalos marcados) e ao marcar um tópico como concluído pela bolha do plano (os quatro). **Sem duplicar**: para cada intervalo, só cria se não existir revisão pendente (não concluída) do mesmo tópico, no mesmo plano, com o mesmo intervalo.
- Revisão guarda: plano, matéria (id+nome), tópico (id+nome), data do estudo, data da revisão, intervalo, sessão de origem (se houver), `concluida_em`.
- **Excluir uma sessão** apaga as revisões pendentes criadas por ela (as concluídas ficam). **Desmarcar** um tópico concluído pela bolha apaga as revisões pendentes criadas por aquela marcação (origem "conclusão", sem sessão) — o toque é reversível.
- **Agenda** (`/app/revisoes`): grupos Atrasadas (com "N dias de atraso"), Hoje, Esta semana (próximos 7 dias), Próximas, Concluídas (últimas 30); dentro de cada grupo, agrupadas por matéria. Ações: concluir/desfazer, excluir.
- **Em "Hoje"** (tela do plano): seção "Revisões de hoje" com as de hoje + atrasadas (atrasadas primeiro), cada uma com a bolha de concluir. A revisão não consome os minutos do plano (é estimada à parte: 15 min cada, mostrada como "≈ 45 min de revisão").
- Concluir uma revisão não cria sessão; quem quiser registrar tempo/questões da revisão usa o registro (tipo `revisao`), o que não cria novas revisões se as pendentes já existirem.

### 7.5 Histórico

`/app/historico`: lista de sessões do aluno (todos os planos), mais recentes primeiro, paginada (50 por página), filtro por matéria (por nome) e período. Cada linha: data, matéria, tópico, tempo, questões (acertos/erros, %), tipo, observação, origem. **Editar** (mesmo formulário do registro; mudar o tópico não mexe nas revisões já criadas) e **excluir** (com confirmação; ver 7.4). Sessões de planos antigos aparecem com o nome guardado e não podem trocar de matéria (só tempo/questões/tipo/observação/data).

### 7.6 Relatório

`/app/relatorio`, sobre o plano ativo, com período: **esta semana** (domingo a sábado, padrão), **semana passada**, **últimos 30 dias**, **desde o início do plano**.

- Números: horas estudadas, questões, % de acerto, dias com estudo — com a variação contra o período anterior de mesmo tamanho.
- **Tempo por matéria**: barras de horas estudadas e, ao lado, a fatia planejada (prazo: minutos do calendário no período; ciclo: proporção do ciclo); "sem estudo há N dias" quando ≥ 7.
- **Assuntos para reforçar**: tópicos com ≥ 5 questões no período e acerto < 70%, do pior para o melhor, até 10.
- **Revisões da semana**: agendadas para a semana, concluídas, atrasadas até hoje.
- **Orientação**: 1–3 frases derivadas dos números (como no app antigo: "Considere reforçar X (45% em 12 questões)", "Todo o tempo ficou em uma matéria", "Há 3 revisões atrasadas").

### 7.7 Tema claro/escuro

- Tokens de cor do `globals.css` passam a ser variáveis CSS com duas paletas (`[data-theme="light"]` e `[data-theme="dark"]`); o escuro mantém a identidade (papel → grafite, caneta azul clareada para contraste AA, marca-texto amarelo).
- Padrão: o do sistema (`prefers-color-scheme`); botão no cabeçalho alterna e grava a escolha em `localStorage` (`editaliza:tema`). Script inline no `<head>` aplica o tema antes de pintar (sem flash). Vale também nas páginas públicas e no onboarding.

### 7.8 Ajuste semanal

**Quando**: ao abrir `/app/plano`, se passaram ≥ 7 dias desde o último ajuste (ou desde a criação do plano), o servidor ajusta antes de mostrar. Também no botão **"Ajustar agora"** (no máximo 1 por hora por plano, para não virar brincadeira; acima disso o botão explica quando volta). Concorrência: uma atualização condicional (`ajustado_em` igual ao lido) garante um ajuste só.

**Entradas** (módulo puro `src/lib/plano/ajuste.ts`):
- o plano (conteúdo, `gerado` atual, data da prova, horas por dia, criado/ajustado em);
- sessões do plano; tópicos concluídos; revisões pendentes; hoje.

**Regras**:
1. **Horas estudadas vs. planejadas** (janela: os 7 dias anteriores a hoje, ou desde o início do plano se for menor). Planejado = minutos do `gerado` na janela (prazo) ou `minutos_por_dia` dos dias da janela (ciclo). No modo prazo, o plano é **regerado a partir de hoje** só com os tópicos pendentes: o atraso empurra o conteúdo restante para os dias que faltam e, se não couber mais, volta o aviso "não cabe" com os tópicos que ficaram de fora. No ciclo, o próprio ciclo já anda pelo estudo registrado (7.9).
2. **Acerto por matéria** (janela: 28 dias; só conta com ≥ 10 questões na matéria): acerto < 60% → ×1,25; 60–79% → ×1,0; ≥ 80% → ×0,85.
3. **Revisões vencidas**: matéria com ≥ 2 revisões atrasadas → ×1,1 (e o resumo diz quantas e onde).
4. Multiplicador final da matéria = produto dos fatores, limitado a [0,8; 1,4]; **recalculado do zero a cada ajuste** (não acumula de semana para semana). Entra no gerador como `ajustes: Record<disciplinaId, number>` multiplicando a prioridade (peso × nível). Sem dados suficientes, ×1.
5. Resultado: novo `gerado`, multiplicadores, e o **resumo**.

**Hoje fica fixo; o histórico planejado fica no `gerado`** *(escolha do Claude)*: no modo prazo, o gerador roda **a partir de amanhã** e o novo `gerado.dias` = dias do `gerado` anterior com data ≤ hoje (intactos) + dias gerados de amanhã até a prova. Assim os blocos de hoje (e os "Estudei" já tocados) não mudam no meio do dia, e "planejado" de qualquer dia passado — para a regra 1 e para o relatório — sempre sai do próprio `gerado`. Tópicos concluídos (inclusive hoje) não entram na regeração; os blocos de hoje não concluídos continuam pendentes e reaparecem a partir de amanhã.

**Conclusão é manual** *(escolha do Claude)*: minutos registrados num tópico não reduzem o que ele ainda precisa no plano; só "Concluí este tópico" (na bolha ou no registro) tira o tópico da regeração. "Atraso empurra" = os tópicos pendentes são redistribuídos nos dias restantes.

**Sem dados** *(escolha do Claude)*: se não houve sessão na janela, a linha de horas diz "Nenhum estudo registrado nos últimos 7 dias" (não "0h de 10h"), e o ajuste ainda roda (redistribui o que ficou para trás). Não há alunos em produção ainda, então planos antigos não precisam de regra de transição.

**Resumo** (até 5 itens, frases curtas, guardado com o ajuste e mostrado no topo do plano até o aluno fechar):
- "Você estudou 6h 30min de 10h planejadas (65%). O conteúdo que ficou foi redistribuído nos 41 dias até a prova."
- "Direito Constitucional ganhou prioridade: 52% de acerto em 25 questões."
- "Português perdeu um pouco de prioridade: 86% de acerto em 40 questões."
- "3 revisões atrasadas em Contabilidade — elas aparecem primeiro em Hoje."
- "Agora 12 tópicos não cabem até a prova (antes: 5)." / "Todo o edital voltou a caber até a prova."
- Sem mudanças: "Seu plano está em dia. Nada mudou."

Cada ajuste fica registrado (data, janela, multiplicadores, resumo, `gerado` anterior) — dá para auditar e mostrar "último ajuste em …".

### 7.9 Ciclo (sem data de prova) — correções

- **Avança pelo estudo registrado**: a posição no ciclo = soma dos minutos das sessões do plano **até ontem** (os blocos de hoje ficam fixos durante o dia). Quem não estuda retoma de onde parou; quem estuda a mais avança mais. Sessões de qualquer matéria contam (o ciclo é uma fila de tempo).
- **Mesmo tópico duas vezes no dia**: quando o ciclo dá a volta e a mesma matéria aparece em dois blocos de hoje, cada bloco recebe um tópico pendente diferente (o 2º bloco pega o próximo pendente).
- Os multiplicadores do ajuste mudam os minutos de cada matéria no ciclo, **mas não a ordem** *(escolha do Claude)*: o ajuste mantém a ordem dos itens do ciclo e só redimensiona; a posição atual é convertida em "matéria + fração percorrida dela" e gravada no plano (`ciclo_inicio`: índice do item + minutos dentro dele, válida a partir de `ajustado_em`). Depois do ajuste, a posição = `ciclo_inicio` + minutos registrados desde então (até ontem). O aluno continua na mesma matéria; nada "pula".
- Só contam sessões com `data` ≥ data de criação do plano (ou do último ajuste, como acima) — sessões trazidas de um plano anterior (7.10) não deslocam o ciclo novo.

### 7.10 Troca de plano

Ao criar um novo plano do **mesmo cargo** (o Plano 1 já copia os tópicos concluídos), as **sessões** e as **revisões pendentes** do plano anterior passam para o novo — *(escolha do Claude)* **movidas** (`plano_id` atualizado na mesma transação de `criar_plano`), não copiadas: sessões cuja matéria existe no conteúdo novo (o tópico guardado segue com id e nome, mesmo que não exista mais); revisões pendentes cujo tópico existe no conteúdo novo. As demais ficam no plano antigo (visíveis no histórico). "Desde o início do plano" no relatório conta a partir da criação do plano novo; as sessões movidas aparecem nos períodos por data (ex.: "últimos 30 dias"). Plano de outro cargo começa limpo; as sessões antigas continuam no histórico.

### 7.11 Mensagem de cota na linha compartilhada (pendência)

Hoje, quando a cota de IA de um aluno estoura, o edital/cargo compartilhado é marcado com `erro = MSG_COTA_IA` e **outro aluno** que abre o mesmo edital vê "você atingiu o limite". Correção: a cota estourada responde 429 só para quem pediu e a linha volta a um estado neutro (`erro` com a mensagem genérica "a leitura foi interrompida — tente de novo"), nunca com a mensagem da cota. Quem tentar de novo reivindica e é cobrado normalmente.

## 8. Decisões técnicas (escolhas do Claude)

**Tabelas novas** (RLS: SELECT só do dono; sem INSERT/UPDATE/DELETE para `authenticated`; escrita via service role nas rotas):

- `sessoes_estudo`: `id uuid pk`, `user_id uuid not null → auth.users on delete cascade`, `plano_id uuid null → planos on delete set null`, `data date not null`, `disciplina_id text not null`, `disciplina_nome text not null`, `topico_id text null`, `topico_nome text null`, `minutos int not null check 0..1440`, `acertos int not null default 0 check ≥ 0`, `erros int not null default 0 check ≥ 0`, `tipo text null check in (...)`, `observacao text null check length ≤ 1000`, `origem text not null check in ('cronometro','manual','rapido')`, `created_at`, `updated_at`; check `minutos > 0 or acertos + erros > 0`; índices `(user_id, data desc)`, `(plano_id, data)`.
- `revisoes`: `id uuid pk`, `user_id`, `plano_id uuid not null → planos on delete cascade`, `disciplina_id`, `disciplina_nome`, `topico_id text not null`, `topico_nome text not null`, `data_estudo date`, `data_revisao date`, `intervalo int check > 0`, `sessao_id uuid null → sessoes_estudo on delete set null`, `origem text check in ('sessao','conclusao')`, `concluida_em timestamptz null`, `created_at`; índice único parcial `(plano_id, topico_id, intervalo) where concluida_em is null` (garante "sem duplicar" no banco); índice `(plano_id, data_revisao)`.
- `ajustes_plano`: `id uuid pk`, `plano_id → planos on delete cascade`, `created_at`, `janela_inicio date`, `janela_fim date`, `multiplicadores jsonb`, `resumo jsonb` (lista de itens tipados, não texto livre — o texto é montado na tela), `gerado_anterior jsonb`, `visto boolean default false`.
- `planos` ganha `ajustado_em timestamptz null`, `ajustes jsonb not null default '{}'` (multiplicadores vigentes) e `ciclo_inicio jsonb null` (`{ indice, minutos }`, posição no ciclo no momento do último ajuste).

**Tipos/módulos puros** (com testes unitários):
- `src/lib/acompanhamento/revisoes.ts` — `INTERVALOS_REVISAO = [1,7,21,30]`, `revisoesParaCriar(...)`, `agruparAgenda(revisoes, hoje)`.
- `src/lib/acompanhamento/cronometro.ts` — redutor de estado (iniciar/pausar/retomar/parar), `segundosDecorridos(estado, agora)`, `validarRascunho(json)`.
- `src/lib/acompanhamento/relatorio.ts` — agregações por período (porte de `weeklyReportData` / `topicInsightData`).
- `src/lib/plano/ajuste.ts` — multiplicadores + resumo; `gerar.ts` ganha `ajustes?: Record<string, number>` em `EntradaPlano` (padrão ×1, retrocompatível com planos existentes).
- `src/lib/planos/ciclo.ts` — offset passa a vir das sessões; resolução de tópicos distintos por bloco.

**Rotas** (todas exigem login, validam com zod, checam dono, usam `hojeEmSaoPaulo` do servidor; mensagens pt-BR):
- `POST /api/sessoes` (cria sessão + revisões + conclusão opcional, numa função SQL transacional), `PATCH /api/sessoes/[id]`, `DELETE /api/sessoes/[id]`.
- `PATCH /api/revisoes/[id]` (concluir/desfazer), `DELETE /api/revisoes/[id]`.
- `POST /api/planos/[id]/ajustar`; `PATCH /api/planos/[id]/ajustes/[ajusteId]` (marcar resumo como visto).
- `PUT/DELETE /api/planos/[id]/topicos/[topicoId]` (existente) passa a criar/apagar as revisões de "conclusão".
- **Ponto único de escrita**: toda rota que grava estudo chama `exigirPodeRegistrar(userId)` (hoje só exige login e plano ativo; o Plano 3 põe a assinatura aqui).

**Limites contra abuso**: no máximo 200 sessões por usuário por dia; observação ≤ 1000; leitura de histórico paginada.

## 9. Deixado para o builder

- Layout exato das telas novas, ícones, paleta escura (contraste AA verificado), animações.
- Nome/forma das funções SQL e dos componentes; divisão em tarefas e ordem de entrega.
- Se o relatório usa gráficos SVG simples ou barras em CSS (sem biblioteca nova de gráficos).
- Texto final das mensagens, mantendo o tom do Plano 1.

## 10. Critérios de pronto

- Testes unitários dos módulos puros (cronômetro, revisões, relatório, ajuste, ciclo), integração das rotas + RLS das tabelas novas, e2e: cronômetro sobrevive a recarregar a página; registrar estudo cria revisões e aparece no histórico e no relatório; tema escuro persiste; ajuste mostra resumo.
- `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` verdes.
- Mergeado em `main` e enviado ao `origin`.
