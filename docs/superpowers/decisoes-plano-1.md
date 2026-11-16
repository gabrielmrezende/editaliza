# Decisões tomadas na execução do Plano 1

Registro das decisões feitas durante a construção (revisões por etapa e revisão final). Pendências marcadas "parked" e "minor (deferred)" são insumo para os Planos 2 e 3.

## Decisões
- R1: `EntradaPlano` ganha `pesosInformados: boolean`; o servidor (POST /api/planos) lê o valor de `edital_cargos.conteudo.pesosInformados`, não do cliente — spec exige pesos do edital — custo se errado: um campo a mais.
- R2: agendamento com `after()` fica nas rotas; funções de serviço (`receberEdital`, `processarCargos`, `processarConteudo`) não agendam nada e são chamadas diretamente nos testes — `after()` não roda fora de request — custo: nenhum.
- R3: tópicos/disciplinas criados pelo aluno na revisão recebem ids `d{i}-n{k}` / `n{k}` únicos no plano — custo: baixo.
- R4: `playwright.config.ts` usa `webServer: npm run dev` na porta 3000 com `EXTRACAO_MODO=fake` — custo: baixo.
- R5 (I3): a spec exige privacidade (LGPD) e o cliente não precisa de enviado_por/custo_centavos/anthropic_file_id/storage_path/sha256 → GRANT de coluna para authenticated só nas demais colunas; servidor usa service role — custo se errado: ajustar grants depois
- R6 (minor promovido): bucket com file_size_limit 50MB e allowed_mime_types application/pdf — Global Constraint 50 MB — custo: nenhum
- R7 (minor promovido): EsquemaEntradaCriarPlano exige ≥1 tópico no total (refine) — Review Focus 5 e checagem no servidor — custo: nenhum
- R8 (minors promovidos): teste unitário de calcularCustoCentavos; obterExtrator recusa EXTRACAO_MODO=fake quando NODE_ENV=production (fake lê tests/ e não existe no deploy) — custo: nenhum
- R9 (carregar p/ Task 6): processarConteudo usa o nome do cargo gravado em edital_cargos (nunca texto do cliente)
- R10 (minors promovidos): POST de cargo exige edital 'pronto'; tentar-novamente não reprocessa edital marcado inválido (EditalInvalidoError) — custo de IA e consistência — custo: baixo
- R11 (I1): encaixe decidido por Σ(45 × nTópicos pendentes) ≤ minutosEstudo. Se não cabe: cortar tópicos (menor prioridade primeiro, do fim da ordem do edital) até caber o piso. Depois distribuir por "water-filling": disciplinas cuja cota proporcional por tópico < 45 ficam travadas em 45/tópico; o restante é redividido por prioridade entre as demais, iterando — spec: avisar só quando o edital inteiro não cabe — custo se errado: só a distribuição de minutos
- R12 (minor 4 promovido): revisao_geral só para disciplinas com ≥1 tópico no plano — custo: nenhum
- R13 (Task 9): POST /api/planos valida no servidor acesso ao edital, cargo pertence ao edital e está pronto, dataProva > hoje (America/Sao_Paulo), grava edital_versao, troca de plano ativo sem 500; hoje calculado no servidor em America/Sao_Paulo; PUT/DELETE tópico checa dono (404) e tópico existente (400) — cobre minors de Task 2/3
- R14: pesosInformados no servidor = flag do edital OU algum questoes/pontos > 0 enviado pelo aluno (spec 7.1/7.2: aluno edita nº de questões) — refina R1 — custo: baixo
- R15 (minors promovidos): servidor recusa minutosPorDia com total 0 (Focus 3 no servidor); toggles por tópico serializados/ignoram resposta velha; sondagem mostra aviso de conexão após falhas seguidas (Focus 1); alvo dos rádios de nível ≥44px; tag de log [api/planos]
- Ruling: tema só claro aceito por ora (tema é spec 7.6, Plano 2); datas por extenso / "16/11" na tela aceitas (legíveis, pt-BR); avanço do ciclo por dia de estudo aceito como decisão de produto (revisitado no ajuste semanal do Plano 2)
- Ruling: revisão final do branch roda agora em paralelo à espera da Task 10 (Task 10 só pode mexer em prompts.ts) — custo se errado: re-revisar o diff de prompts
- Ruling (fix wave): lista e decisões em final-review-findings.md — C1 ciclo em minutos com offset desde created_at; I1 teto 3 anos; I2 cota 15 chamadas IA/usuário/24h + custo em falha + cache_control; I3 copiar progresso se mesmo cargo; I5 20 URLs/h, sem INSERT cliente em tmp/, varredura 1h; I6 revogar escrita cliente; I7 limites locais + globalSetup; minors M1–M6 e docs/deploy.md — custo se errado: valores de cota/teto ajustáveis

## Pendências adiadas
- Task 1: minor (deferred): AGENTS.md fora da lista; globals.css Arial sobrepõe Geist; public/*.svg do template; playwright sem timeout/reporter
- Task 1: minor (deferred): comentário 'partialPrefetching sem impacto no código' não verificado
- Task 2: minor (deferred): planos.edital_id/cargo_id sem checagem de acesso/consistência (servidor valida na Task 9); updated_at sem trigger; booleans nullable; minutos_por_dia aceita NULL; sem limpeza de usuários de teste; npm test exige stack Supabase; warning Vite ESM no output; FKs planos sem cascade
- Task 2: minor (deferred): download denial sem checagem do tipo de erro; size limit sem teste; objetos tmp/ acumulam; ~20s de espera após db:reset (flaky em CI)
- Task 3: minor (deferred): exigirUsuario 2x getUser por request (React.cache); layout não é fronteira de segurança — páginas /app/* devem chamar exigirUsuario; app/page.tsx ignora erro da query planos; proxy redirect não copia cache headers; callback não loga erro; mensagem de erro genérica; logado em /entrar não redireciona; env NEXT_PUBLIC_* com ! repetido; e2e sem /app/plano e erro de callback
- Task 3: minor (deferred): NEXT_PUBLIC_SITE_URL precisa existir no build de produção; checagem '//' redundante; report com nota obsoleta
- Task 4: minor (deferred): z.uuid estrito; schemas sem amarração de tipo (satisfies); nome vazio aceito em EsquemaConteudoCargoIA
- Task 4: minor (deferred): mensagem de z.iso.date diz "formato" também p/ data impossível
- Task 5: minor (deferred): custo ignora cache/fallback (estimativa); ConteudoApi/ResumoApi duplicam forma do domínio; report sem self-review completo
- Task 5: minor (deferred): restore de NODE_ENV no teste pode gravar "undefined"; erros do SDK (rede/429/5xx) não são ExtracaoFalhouError → Task 6 trata qualquer erro como status erro
- Task 6: minor (deferred): teste de concorrência não prova o caminho do índice único; arquivos órfãos na Anthropic no perdedor da corrida; finally do remove() pode esconder erro; tmp/ sem varredura e url-envio sem limite; regex de caminho mais estrito; 202 em reuso; lerEdital 2x; rotas HTTP sem teste
- Task 6: minor (deferred): TOCTOU em reiniciarEdital (inofensivo); cargos com processando_desde NULL nunca expiram (só dados antigos); .or() com timestamp sem aspas
- Task 6: minor (deferred): sem teste p/ claim concorrente do reparo, falha no reparo e ramo processando>10min; processando_desde NULL não repara; marcarErroEdital ignora resultado
- Task 7: minor (deferred): ciclo pode passar do total semanal (piso 30); simulado pulado se o 7º dia tiver 0 min / reserva com sobra < 7 dias; questoes:0 não cai em pontos; testes sem alternância e ≤60 min
- Task 7: minor (deferred): sobra de floor(alvo/n) não alocada
- Task 8: minor (deferred): tarefasDoDia devolve blocos por referência; somaDias lança RangeError com data inválida
- Task 9: minor (deferred): nome da matéria truncado em 375px; aviso next/font
- Task 9: minor (deferred): página aberta após meia-noite não refaz o pin; sem teste do log [api/planos]; flake ocasional no beforeAll de planos.test.ts (criação de usuário)
- parked — mensagem de cota gravada em linha compartilhada de edital/cargo — Ruling: real, se recupera sozinho (o próximo usuário que tenta reivindica e é cobrado); corrigir no Plano 2 guardando o erro de cota por usuário, não na linha
- parked — mesmo tópico em dois blocos no dia quando o ciclo dá a volta — Ruling: raro (dia com quase toda a carga semanal); corrigir no Plano 2 junto com o ajuste semanal
- parked — custo perdido se a escrita no banco falhar depois de uma chamada bem-sucedida — Ruling: real e pequeno; Plano 3 (painel de custo) deve somar o custo antes das escritas
- parked — item fica 'processando' 10 min se consumir_cota falhar após o claim — Ruling: a expiração de 10 min já cobre (Review Focus 1 mantido)
- Task 10a: complete (0f1fb6f..9672bf3, review clean); minor (deferred): custo calculado 2x no log; deploy.md diz 'erro claro'; erro de rede no stream sem custo/log
- Task 10b: complete (9672bf3..08d526a, review clean); minor (deferred): sem teste unitário do campo nulo → ExtracaoFalhouError

## Teste real (Haiku 5.5)
- Task 10 (teste real, Haiku 5.5): 2/2 ok. Câmara 70p: 11 cargos, 9 matérias/110 tópicos (cargo Divulgação Institucional), sem pesos; 18s+25s; R$1,56. PCPR 108p: 3 cargos, Delegado 8 matérias/126 tópicos, pesos 20/20/20/10/10/10/5/5; 16s+29s; R$2,21.
- Verificação real pós-cache (Câmara): listar 74 centavos (escrita 211k), extrair 14 centavos (leitura 211k) → total R$0,88 (antes R$1,56)
