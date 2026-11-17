# Decisões tomadas na execução do Início no visual do legado

Registro das decisões feitas durante a construção da aba Início (fila de blocos, cartão "Próximo bloco", calendário, Conteúdos e tipografia) e na revisão final. Pendências "deferred" são insumo para o próximo plano.

## Decisões
- A: os e2e antigos ficaram quebrados entre as Tasks 6 e 11 (a UI muda antes de os testes serem reescritos); cada tarefa rodou os próprios specs novos e os testes unitários e de integração, e a Task 11 reescreveu e rodou a suíte inteira — ordem do plano — custo: falha intermediária esperada.
- B: a migração do ajuste com fila é `20261118000200_ajuste_fila.sql` (o número `000100` já estava em uso); o teste das horas espera a fila `{0, amanhã}` porque o ajuste regenera o plano, como diz o spec — custo: nenhum.
- C: a coluna `ciclo_inicio` sai em `20261118000300_remover_ciclo_inicio.sql`; o rascunho do cronômetro só é apagado quando a sessão usou o tempo do cronômetro (o rascunho é compartilhado entre abas) — custo: o rascunho fica se o aluno concluir sem usar o tempo.
- D: um único `useRevisoes` no `PainelInicio`, para o calendário e "Revisões de hoje" ficarem sincronizados; a grade de próximos blocos tem 2 colunas ao lado do calendário — custo: nenhum.
- E: no celular a grade de próximos blocos mostra 4 blocos e o botão "Ver mais blocos" (12 empurravam o calendário para muito longe; design §4 quer o próximo bloco e o calendário à vista) — custo: um botão.
- F: no prazo, "Concluí este tópico" vem marcado quando o bloco atual é o último daquele tópico na fila (dá para desmarcar); "Ajustar agora" no prazo pede confirmação ("Ajustar o plano agora? A fila recomeça com o que falta estudar."); subtrair os minutos já estudados fica para o dono (ver abaixo) — custo: um tópico estudado só em parte ainda volta inteiro depois de um ajuste.
- Fila no prazo: bloco cujo tópico já foi concluído continua na fila (sem pular), mostrado como "Tópico já concluído"; Concluir avança 1. No fim da fila, o cartão mostra "Você chegou ao fim da fila." e o servidor responde 409 com a mesma frase.
- Ajuste no prazo só refaz a fila (posição 0, `fila_desde` = amanhã, item `fila_refeita` no resumo) quando o plano é regerado (prova depois de amanhã); senão a fila fica como está.
- Proteção otimista: `concluir_bloco` confere a posição **e** o `ajustado_em` lido pela tela; `aplicar_ajuste` confere também a posição (`p_fila_lida`); o fim da fila é checado na rota antes da função; `ajustado_em` circula como a string do PostgREST, nunca via `Date`; a comparação da posição usa `is distinct from`.
- Concluir/Salvar sem concluir ficam desabilitados durante a requisição (clique duplo gravava duas sessões).
- O cronômetro é um só e vale para o bloco que está na tela; num 409 o rascunho fica. `?disciplina&topico` vindos de `/app/estudar` são ignorados; só `iniciar=1` conta.
- "Concluí este tópico" no cartão é uma marca levada ao concluir (não grava sozinha). Minutos do passo: do cronômetro se ele rodou ≥ 30 s, senão os previstos (decididos ao abrir o passo, junto com a origem `cronometro`/`rapido`); sessão de bloco de estudo com `tipo` nulo.
- Foco: abrir, cancelar e concluir o passo devolvem o foco a um alvo que existe (primeiro campo, botão "Concluir bloco" quando volta a ficar habilitado, ou o tópico do bloco seguinte).
- A posição local depois de concluir/voltar vale só até o servidor responder (sai quando a posição do servidor muda e quando o refresh termina).
- Projeção do calendário: item de 0 min não entra (sem laço infinito); bloco maior que o dia ocupa um dia sozinho; hoje só recebe o que cabe no que falta; plano sem tempo dá calendário sem previsão; projeção só em dias antes da prova; revisões contadas pela `data_revisao`; sessões do plano ativo; mês por `?mes=aaaa-mm`.
- `Avisos` do plano saem do Início e vão para Conteúdos; a leitura de `ciclo_inicio` em `consultas.ts` saiu junto com a coluna.
- Tipografia: só pesos 400 e 600 (os `font-extrabold`/`font-medium` restantes viraram 600/400); botões do calendário com alvo ≥ 44 px a 375 px; `aria-live` só no título do detalhe do dia; textos de Avisos e do Relatório enxugados, sem negrito no meio da frase.

## Pendências para o dono
- Minutos já estudados não são descontados pelo ajuste: o ajuste semanal (ou "Ajustar agora") no prazo refaz a fila só sem os tópicos **concluídos**. Um tópico estudado em parte (blocos concluídos sem marcar "Concluí este tópico") volta com todos os minutos previstos. A marca vem ligada por padrão no último bloco de cada tópico e "Ajustar agora" pede confirmação, o que cobre o caso comum; descontar os minutos estudados exigiria mudar o gerador do plano (spec §3). Decidir se vale a mudança.

## Pendências adiadas
- Fila: sem teste da ordenação por data e do fallback de `converterPosicaoFila`; testes de início em dia sem horas e de `ate < hoje` na projeção.
- Serviço da fila: `voltarBloco` grava o `updated_at` com o relógio da app (não o do banco); sem teste de serviço para `ajustado_em` mudando entre a leitura e o RPC; rotas sem teste HTTP (os e2e cobrem).
- Ajuste: teste de integração do ciclo não muda a composição; sem teste de truncamento do resumo com `fila_refeita`.
- Cronômetro: o rascunho pode reiniciar se a página reaparecer antes do `router.replace`; e2e não cobre mais "Trocar de cronômetro?", `?iniciar` com outro cronômetro e o aviso de 7 h esquecido.
- Calendário e revisões: "Revisões de hoje" perde o desfazer depois de navegar de mês; a célula do dia mostra pendentes ou feitas (não ambas); linha em branco dupla em `DetalheDia`.
- Tipografia: h3 do `DetalheDia` em 18 px contra 20 px das seções; h1 do topo do mesmo tamanho das seções; ordem de classes no `Calendario`.
- Conteúdos: sem RED registrado na Task 8.
- Menu lateral: a lista de matérias (bolinhas) só atualiza ao navegar.

## Revisão final
Onda única de correção depois da revisão do branch inteiro:
- Tela velha não grava mais no bloco errado: a página passa o `ajustado_em` do plano (a string do servidor) ao Início, e concluir **e** voltar o mandam de volta; o servidor responde 409 se ele não bate e o repassa à função do banco (um ajuste entre a leitura e a gravação também dá 409). Concluir manda ainda a matéria e o tópico mostrados: se o servidor calcular outro bloco (fila refeita na mesma posição, tópico do ciclo marcado em Conteúdos noutra aba), é 409 e nada é gravado.
- Mensagem do 409: "Sua fila mudou (em outra tela ou por um ajuste). A tela foi atualizada."
- Ajuste no prazo: "Concluí este tópico" vem marcado no último bloco do tópico na fila, e "Ajustar agora" pede confirmação (decisão F).
- Cronômetro: pausado com tempo marcado, aparece "Zerar" ao lado do relógio, com a confirmação "Descartar o tempo?"; o foco volta para "Iniciar".
- Matéria com a cor navy: a bolinha ganhou contorno claro mais forte sobre fundo navy (menu, cartão), o tema escuro reforçou o contorno, e a faixa da matéria no cartão tem um fio claro na borda de dentro.
