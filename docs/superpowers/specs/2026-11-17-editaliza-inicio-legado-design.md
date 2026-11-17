# Editaliza — Início no estilo do legado (fila de blocos, calendário, texto calmo)

Data: 2026-11-17
Base: `docs/superpowers/specs/2026-11-16-editaliza-saas-design.md`, `docs/superpowers/specs/2026-11-16-editaliza-plano-2-acompanhamento-design.md`, o redesign visual do branch `visual-legado` e a página inicial de `legado/index-etapa3.html`.

## 1. Intenção e porquê

O dono usou muito o app antigo (`legado/index-etapa3.html`) e gostava dele: **fácil de usar, quase tudo na mesma página**, abria e já sabia o que fazer. No app novo, mesmo com as cores do legado, ele sente que "não está muito legal": coisas espalhadas em abas (plano, cronômetro, relatório), **muito texto pequeno e negrito misturado**, confuso. Duas coisas do legado ele usava de verdade e sente falta:
- o **calendário** na página inicial — "ajudava bastante a saber quando tinha revisão";
- o **ciclo de estudos** — a fila de blocos: concluir um bloco e seguir para o próximo, sem depender do dia.

Sucesso = abrir o app e, numa página só, ver o próximo bloco, estudar (cronômetro ali mesmo), concluir e seguir; ver no calendário o que estudou e quando tem revisão; tudo com letra legível e hierarquia clara.

## 2. Objetivos

1. **Página Início** (`/app/plano`, rótulo "Início") que concentra o dia, no espírito da página "Estudos" do legado.
2. **Fila de blocos sempre** (decisão do dono, opção A): com ou sem data de prova, o aluno segue uma fila — "Próximo bloco", "Concluir bloco", "Voltar um bloco", grade dos próximos blocos. Perder um dia não deixa nada "atrasado": retoma o próximo bloco.
3. **Calendário do mês no Início**: por dia, horas estudadas e revisões marcadas (pendentes/feitas); hoje destacado; clicar num dia mostra o que houve/haverá nele.
4. **Cronômetro dentro do Início**, ligado ao próximo bloco.
5. **Texto calmo**: letra maior, poucos pesos, negrito só onde importa.

## 3. Não-objetivos

- Cobrança/assinatura (Plano 3 adiado pelo dono).
- Editor manual de ciclo (o legado tinha "Configurar ciclo") — *(escolha do Claude)* fora desta etapa; quem quiser mudar horas/níveis cria um novo plano. Pode virar pedido depois.
- Mudar o gerador de plano (pesos, níveis, reserva, ajuste semanal continuam como estão; só muda como o plano é **percorrido e mostrado**).
- Metas configuráveis, backup/importação do legado.

## 4. Anti-objetivos

- Uma página Início que vire um "mural" com tudo do mesmo tamanho — o próximo bloco tem que ser, de longe, o mais visível.
- Perder estudo registrado ou o lugar na fila ao recarregar, trocar de aparelho ou ao rodar o ajuste semanal.
- Texto menor que 13 px, ou negrito usado como enfeite.

## 5. Abordagens consideradas (escolha do dono: A)

| Abordagem | Trade-off |
|---|---|
| **A. Sempre uma fila de blocos** ✅ | Funciona como o dono estudava; nada atrasa por perder um dia. Muda como o plano com data é percorrido e exibido. |
| B. Fila só no plano sem data (como hoje), com cara do legado | Menos mudança, mas quem tem prova marcada (a maioria) fica sem a fila. |

## 6. O produto

### 6.1 Navegação
Abas: **Início**, **Revisões**, **Histórico**, **Relatório**, **Conteúdos**. A aba **Estudar some**: cronômetro e registro passam para o Início (`/app/estudar` redireciona para `/app/plano`, preservando `?disciplina&topico&iniciar=1` como pedido de iniciar o cronômetro no Início). *(Escolha do Claude: a aba Conteúdos volta do legado — lista de todas as matérias e tópicos do plano com caixinha "concluído" e progresso por matéria; é o "edital verticalizado" que todo concurseiro usa e substitui o painel Progresso do Início atual.)*

### 6.2 Início — ordem e hierarquia (celular de cima para baixo; computador em duas colunas a partir de ~1100 px)
```
[faixa fina: resumo do ajuste semanal, quando houver; "Ajustar agora" discreto]
┌ Próximo bloco ─────────────────────────────── (navy, o único elemento forte) ┐
│ ● Direito Administrativo · Bloco 5 de 48                                     │
│ Princípios da administração pública                         1 h               │
│ [ ▶ Iniciar ]   00:00:00        [ ✓ Concluir bloco ]   Voltar um bloco       │
│ ○ Concluí este tópico                                                        │
└──────────────────────────────────────────────────────────────────────────────┘
Meu progresso: 12% do edital ▓▓░░░ · 3 h 20 min esta semana · 61% de acerto
┌ Próximos blocos (grade 2–4 colunas) ┐   ┌ Calendário (mês) ────────────┐
│ 6 · Português · 1 h ...              │   │ dias com horas e revisões     │
└──────────────────────────────────────┘   └───────────────────────────────┘
Revisões de hoje (hoje + atrasadas)        Registrar sem cronômetro (recolhido)
```
- **Próximo bloco**: matéria (bolinha da cor), número do bloco na fila, tópico em destaque, minutos previstos, cronômetro embutido (iniciar/pausar/retomar, rascunho continua salvo no aparelho como hoje), **Concluir bloco**, **Voltar um bloco**, caixinha "Concluí este tópico".
- **Concluir bloco**: registra uma sessão do bloco (minutos = cronômetro se ele rodou; senão os minutos previstos do bloco, editáveis num passo curto com questões/acertos opcionais) com as revisões padrão, e avança a fila. Se o aluno marcou "Concluí este tópico", o tópico é concluído junto.
- **Voltar um bloco**: só recua o ponteiro da fila (como no legado); não apaga sessão.
- **Próximos blocos**: os próximos ~12 da fila, numerados (a numeração é a ordem real da fila).
- **Meu progresso**: % do edital (tópicos concluídos), horas na semana, acerto da semana — uma linha, sem cartões repetidos.
- **Calendário**: mês com navegação; cada dia mostra horas estudadas (passado) e quantidade de revisões (pendentes/feitas); hoje destacado; dias futuros mostram a previsão de estudo da fila (minutos) em tom apagado. Clicar num dia abre o detalhe: sessões do dia, revisões do dia (com concluir), e, se futuro, os blocos previstos.
- **Revisões de hoje** e **Registrar sem cronômetro** (o registro manual/rápido atual, recolhido por padrão).

### 6.3 A fila de blocos (regra)
- **Plano sem data (ciclo)**: a fila é o ciclo repetido (como hoje). O tópico de cada bloco é o próximo pendente da matéria (sem repetir tópico em blocos seguidos da mesma matéria).
- **Plano com data (prazo)**: a fila é a sequência dos blocos do `gerado` na ordem do calendário, a partir do início do plano, ignorando a data (estudo, revisão geral e simulado). A data da prova continua decidindo quanto cada matéria recebe e o que entra.
- **Posição na fila** guardada no servidor por plano (sobrevive a recarregar/trocar aparelho). Concluir avança 1; Voltar recua 1 (mínimo 0).
- **Ajuste semanal**: no prazo, o `gerado` é refeito a partir dos tópicos pendentes. *(Escolha do Claude)* a fila é recalculada e a posição recomeça no primeiro bloco da nova fila (os blocos já concluídos estão em tópicos concluídos ou em minutos já feitos); o resumo do ajuste diz "A fila foi refeita com o que falta". No ciclo, a posição é convertida como hoje (mesma matéria).
- **Calendário futuro** = projeção da fila a partir da posição atual sobre os minutos por dia da semana a partir de hoje.
- O avanço por minutos registrados do ciclo (Plano 2) é substituído pelo avanço por bloco concluído, nos dois modos. Registros avulsos ("Registrar sem cronômetro") não mexem na fila.

### 6.4 Texto e tipografia
- Corpo 16 px (celular e computador), linha 1,5; nada abaixo de 13 px.
- Só **dois pesos**: normal (400) e seminegrito (600). Títulos de seção 20–24 px em 600; o tópico do próximo bloco 28–32 px em 600; números grandes em 600.
- Rótulos de campo 14 px em 400 (não em negrito); metadados 14 px em cor suave; nada de negrito no meio de frases.
- Fonte: manter Plus Jakarta Sans (legado) *(escolha do Claude: a fonte não é o problema, e sim tamanhos/pesos misturados)*.
- Menos texto: tirar frases explicativas repetidas; uma frase curta por seção, quando necessária.

### 6.5 Animações
Mantém as do redesign; o destaque de entrada passa a ser o cartão "Próximo bloco". Ao **Concluir bloco**, o cartão faz uma transição curta para o próximo (o bloco concluído sai, o próximo entra) e a grade anda uma posição. Tudo desligado com `prefers-reduced-motion`.

## 7. Decisões técnicas (escolhas do Claude)
- Base: branch `visual-legado` (ainda não está em `main`); este trabalho continua nele e o conjunto vai para `main` no fim.
- Posição da fila: coluna nova em `planos` (ex.: `fila_posicao int not null default 0`), escrita só pelo servidor (rota "concluir bloco"/"voltar bloco", passando por `exigirPodeRegistrar`). Concluir bloco = uma operação transacional (sessão + revisões + conclusão opcional + avanço), com proteção contra clique duplo (posição esperada enviada pelo cliente; se não bater, 409 e a tela recarrega).
- Montagem da fila e projeção do calendário em módulos puros testados (`src/lib/plano/fila.ts`, `src/lib/plano/calendario.ts`).
- Os e2e existentes que dependem da aba Estudar e dos blocos "do dia" são atualizados para o novo fluxo.

## 7.1 Regras detalhadas da fila *(escolhas do Claude, após revisão do design)*
1. **O que é um bloco.** Prazo: cada bloco do `gerado` (≤ 60 min, um tópico; tópicos longos ocupam vários blocos seguidos). Ciclo: cada item do ciclo inteiro (a fatia da matéria, como os blocos de 1h30–2h do legado). A posição é um contador sem limite; no ciclo o bloco atual é `posição mod nº de itens` e a tela mostra "Bloco N · volta V" em vez de "de M". No prazo mostra "Bloco N de M".
2. **Tópico de um bloco do ciclo** = o primeiro tópico pendente da matéria (estável ao recarregar; se o aluno não marcar "Concluí este tópico", o próximo bloco da matéria continua nele). Na grade de próximos blocos do ciclo aparece só a matéria e os minutos; o tópico aparece no bloco atual.
3. **Fila do prazo e ajuste.** A fila do prazo = blocos do `gerado` com data ≥ `fila_desde` (data guardada no plano: dia da criação; no ajuste semanal, amanhã), achatados na ordem das datas, incluindo revisão geral e simulado, até a prova. No ajuste a posição volta a 0 sobre a nova fila (os tópicos de hoje que ficaram pendentes já estão nela). O resumo do ajuste ganha o item "A fila foi refeita com o que falta estudar."
4. **Dados existentes:** não há alunos reais (o app não está publicado) — sem migração de dados; planos existentes começam no bloco 1. `ciclo_inicio`, `posicaoEmMinutos` e `converterPosicao` deixam de ser usados para a posição (remover o que ficar morto e adaptar os testes do Plano 2). No ajuste do ciclo (ordem mantida), a posição passa a apontar para o mesmo item (mesma matéria) na volta atual.
5. **Calendário (projeção):** a partir do bloco atual, os blocos ocupam os dias pelos minutos por dia da semana; um bloco que não cabe no que sobra do dia vai inteiro para o próximo dia com horas (blocos maiores que um dia ocupam o dia sozinhos); hoje conta só o que falta (minutos do dia − minutos registrados hoje); no prazo a projeção para na data da prova. Dias passados: horas = todas as sessões do dia (inclusive registros avulsos); revisões = as do dia (pendentes/feitas).
6. **Concluir bloco:** abre um passo curto com os minutos (do cronômetro, se rodou; senão os previstos), editáveis, mais questões/acertos opcionais e "Concluí este tópico"; botões **"Concluir bloco"** (grava e avança) e **"Salvar sem concluir"** (grava a sessão, não avança — para parar no meio). Blocos de simulado/revisão geral gravam sessão sem tópico, com tipo `simulado`/`revisao`, sem revisões espaçadas. A posição esperada vai só nas rotas de concluir/voltar bloco; o registro avulso não mexe na fila.
7. **Novo plano** começa a fila do zero (bloco 1). Não existe edição de minutos/data sem novo plano.

## 8. Deixado para o builder
- Layout exato, componentes, quantos blocos na grade, comportamento do calendário em telas pequenas (pode virar semana com rolagem).
- Texto final das mensagens, no tom do app.

## 9. Critérios de pronto
- Testes unitários de fila e calendário; integração das rotas de concluir/voltar bloco (inclui clique duplo e ajuste refazendo a fila); e2e: concluir bloco avança e sobrevive a recarregar; voltar bloco; calendário mostra revisões no dia certo; cronômetro no Início.
- `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:e2e`, `npm run build` verdes; capturas do Início (claro/escuro, computador/celular) conferidas.
