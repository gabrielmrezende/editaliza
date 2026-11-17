# Decisões tomadas na execução do Plano 2

Registro das decisões feitas durante a construção do acompanhamento e do ajuste (revisões por etapa). Pendências "deferred" são insumo para a revisão final e para o Plano 3.

## Decisões
- R1: `formatarMinutos` vai para `src/lib/formatar.ts` (o módulo de componentes reexporta) — `lib` não importa de `components` — custo: nenhum.
- R2: horas no formato do app ("6 h 30 min"), não "6h 30min" — consistência com Hoje/Semana e com os e2e — custo: só texto.
- R3: `criadoEm` do ajuste é a data de São Paulo `aaaa-mm-dd`; o serviço de ajuste converte.
- R4: `excluir_sessao` re-aponta as revisões pendentes da sessão excluída para a sessão mais recente restante do mesmo tópico no plano (pelo tópico da revisão) e só apaga se não houver outra — anti-objetivo "perder estudo" — custo: uma migração pequena (`20261117000100_excluir_sessao_reaponta.sql`).
- R5: fator de acerto guardado à parte: `EntradaAjuste` ganha `fatoresAcertoVigentes` e `ResultadoAjuste` ganha `fatoresAcerto`; o item `prioridade` sai quando o fator de acerto muda (inclusive de volta para 1), com direção relativa ao anterior e a nova direção `normal` ("{nome} voltou à prioridade normal."); persistido em `ajustes_plano.multiplicadores` como `{ final, acerto }` e o último é lido como vigente — sem pulo sem explicação nem repetição no resumo — custo: um campo a mais.
- R6: a mensagem "sobe" do resumo mostra o percentual truncado (59,6% vira 59%).
- R7: `ajustarAgora` devolve o id do ajuste (a rota precisa dele); a página do plano chama `ajustarSeVencido` antes de ler o plano. `ajustado_em` volta ao banco exatamente como lido (string do PostgREST).
- R8: `posicaoAtual` do ajuste usa as sessões em `[desde, hoje)`, a mesma conta da página, para não contar o dia do ajuste duas vezes.
- R9: PUT/DELETE de tópico (`marcarTopico`) chama `exigirPodeRegistrar` e exige plano ativo; `marcarRevisao` só vale para revisões do plano ativo — ponto único da futura assinatura (Plano 3).
- R10: a origem da sessão (`cronometro` | `manual` | `rapido`) vem do cliente como enum e é aceita como a "marca" do registro rápido — custo: nenhum.
- R11: o deslocamento fixo `-03:00` de São Paulo virou helper em `src/lib/datas.ts`; o limite de 200 sessões por dia usa a data de criação.
- R12: a cota de IA de edital/cargo passa a ser cobrada por quem pediu (`cobrarChamadaIA` com liberação do edital); a mensagem de cota não fica mais gravada na linha compartilhada.
- R13: o ciclo avança pelo estudo registrado (minutos reais por dia) e não repete o mesmo tópico em dois blocos do dia — resolve as duas pendências do Plano 1 sobre o ciclo.
- R14: `sessoesDoUsuario` com página fora do intervalo (PGRST103/416) devolve lista vazia; `de`/`ate`/`pagina` são validados na página do histórico, que é quem lê a paginação da URL.
- R15: o rascunho do cronômetro é validado com `z.number()` (o zod 4.6 já rejeita NaN/Infinity) e com dedupe de intervalos; `disciplinaId`/`topicoId` que não existem mais no plano são descartados; o botão "Iniciar" de Hoje liga o cronômetro por `?iniciar`.
- R16: tema escuro: script de pré-pintura no `<head>` lê `editaliza:tema` e cai em `prefers-color-scheme`; botão com `useSyncExternalStore` (rótulo claro no servidor, corrige na hidratação); cores de texto e bordas por tokens para manter contraste AA no escuro.
- R17: "Revisões da semana" no relatório conta no período escolhido (padrão = semana), coerente com o seletor; na revisão final o título vira "Revisões do período" fora da semana.
- R18: tema coberto por teste unitário (Task 10) e por e2e (`e2e/paginas.spec.ts`): persistência após recarregar, escolha salva vence o sistema, e tema escuro na primeira pintura sem aviso de hidratação em `/` e `/entrar`.
- R19: excluir sessão (`excluirSessao`), excluir revisão (`excluirRevisao`) e fechar o resumo do ajuste (`marcarResumoVisto`) não passam por `exigirPodeRegistrar`: apagar ou dispensar os próprios dados sem assinatura é defensável (o aluno nunca fica preso a um registro). `excluirRevisao` vale só para revisões do plano ativo (404 fora dele, como `marcarRevisao`). Plano 3: revisar ao pôr a assinatura no portão — custo: nenhum.

## Pendências para o dono
- Sessão retroativa cria revisões já vencidas: com os quatro intervalos marcados por padrão, uma sessão registrada com data de 10 dias atrás já nasce com as revisões de 1 e 7 dias atrasadas. Segue o spec ao pé da letra (revisões contadas da data do estudo); decidir se o padrão deve desmarcar os intervalos já vencidos ou contar da data do registro.

## Pendências adiadas
- Banco: revogar tudo e conceder só SELECT seria mais estrito (TRUNCATE/REFERENCES/TRIGGER padrão); testes de que `authenticated`/`anon` não chamam as RPCs; `registrar_sessao` com plano alheio; `aplicar_ajuste` em plano inativo.
- Cronômetro: sem RED registrado na Task 2; teste do limite exato `agora + 60000`; aviso da fonte Atkinson no build/dev.
- Sessões: tipo/origem com cast em `sessaoDaLinha`; limite exato de 30 dias sem teste; contagem→insert do limite diário não atômica; edição sem lock (o check do banco cobre, mas vira 500); `marcarTopico` não transacional (idempotente); teste do limite diário pode oscilar perto de 00:00 SP; BOM no início de `tests/integracao/planos.test.ts` e `sessoes.test.ts`.
- Revisões: sem teste do corte em 3 orientações; plano com início futuro; custo O(d×s); `RevisoesHoje` sem e2e próprio; `revisoesDoPlano` em série.
- Ciclo e resumo: bolha concluída "troca" de bloco entre dois blocos da mesma matéria ao recarregar; `Semana.tsx` com `ItemCiclo` local; sessão retroativa muda blocos de hoje; testes de `converterPosicao` com offset ≥ total; `diasAteProva` off-by-one na redação; `acertosPorMateria` calculado 2x; matéria concluída sai do ciclo sem linha no resumo; caso "86% em 40" exato.
- Ajuste: `ajustarSeVencido` engole todo `AcompanhamentoError` (Plano 3: comentar); rotas sem teste HTTP; ordenação por `created_at` sem desempate por id; teste de `criadoEm` perto da meia-noite.
- Navegação: safe-area no rodapé fixo; `cicloInicioValido` sem teste unitário; e2e de redirecionamento não prova a página.
- Cronômetro/registro: `setFormulario` com updater sobre closure; validação duplicada no `RegistroRapido`; e2e sem erro de API.
- Hoje/Histórico: estado "Registrado" cai no outro bloco do mesmo tópico; sessão com mais de 365 dias não é editável (enviar data só se mudou); `materiasDoHistorico` lê todas as linhas; select "Todas" com filtro fora da lista; Editar sem plano ativo; tópico travado demais; import relativo em `Hoje.tsx`.
- Relatório: lista `PERIODOS` duplicada; e2e com `getByText` por substring.
- Plano 1 ainda aberta: custo perdido se a escrita no banco falhar depois de uma chamada bem-sucedida (Plano 3, painel de custo).

## Revisão final
Onda única de correção depois da revisão do branch inteiro:
- Cronômetro: "Iniciar" do mesmo estudo era ignorado quando o aluno saía de Estudar antes de a URL ser limpa (a página fica escondida pela Activity, não desmonta). Agora o pedido tratado e o formulário de parada são esquecidos quando a página é escondida (`useLayoutEffect` com limpeza) e a URL sai na hora com `window.history.replaceState` (o `router.replace` continua, para a página do servidor vir sem o pedido). Era a causa do e2e instável; ganhou variante que atrasa a resposta do servidor.
- Estado do cliente sob Activity: `useMarcacoes`, `useRevisoes` e `useRegistroRapido` adotam os dados novos do servidor quando as props mudam e não há requisição em voo (comparação durante o render); `PainelPlano` e `Agenda` têm `key={plano.id}`, para um "Novo plano" não herdar o estado do plano antigo. Tópico concluído em Estudar aparece concluído ao voltar para Plano (e2e).
- Relatório: "Dias com estudo" ganhou a variação contra o período anterior (spec §7.6); título "Revisões do período" fora da semana; "Assuntos para reforçar" mostra o percentual truncado (69,6% → 69%), coerente com a regra < 70%.
- Ajuste: as sessões do plano são lidas em lotes (acima de 1000 linhas a posição do ciclo divergia da página).
- Exclusões fora do portão de registro documentadas (R19); `excluirRevisao` limitada ao plano ativo.
- Histórico: a confirmação de exclusão diz que as revisões pendentes saem da agenda, a não ser que outra sessão do mesmo tópico continue (R4).
- "Estudei" de Hoje e o registro rápido usam o dia de São Paulo do momento do envio (página aberta antes da meia-noite).
