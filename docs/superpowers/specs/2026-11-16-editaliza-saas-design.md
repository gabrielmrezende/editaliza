# Editaliza — SaaS de planejamento de estudos a partir do edital

Data: 2026-11-16
Status: pronto para aprovação (revisado por um builder independente)

## 1. Intenção e porquê

Hoje existe um app pessoal de estudos (`index.html`, arquivo único, ~2.800 linhas) feito para concursos de TI (BACEN, CGU, BB). O edital está fixo no código (`const EDITAL=[...]`) e os dados ficam só no `localStorage` do navegador. Não há login, servidor, banco nem cobrança.

O dono quer transformar isso num **produto vendável (SaaS)** para **qualquer concurso público**, não só TI. A promessa central:

> O aluno envia o edital do concurso dele e recebe, automaticamente, um plano de estudos personalizado — que se ajusta sozinho conforme ele estuda.

O app atual já tem a parte de "acompanhar o estudo" (cronômetro, registro, revisões espaçadas, histórico, relatório, ciclo). Isso é reaproveitado como lógica, reescrito na nova base e generalizado para qualquer matéria.

## 2. Objetivos

1. Aluno cria conta, envia o PDF do edital, escolhe o cargo e recebe o plano em poucos minutos.
2. Funciona com editais de qualquer área e banca (CESPE/Cebraspe, FGV, FCC, Vunesp, Cesgranrio etc.).
3. O plano considera: conteúdo e peso de cada matéria no edital, data da prova, horas disponíveis por dia da semana e nível do aluno em cada matéria.
4. O plano se ajusta semanalmente com o desempenho registrado (horas, acertos/erros, revisões, atrasos).
5. Cobrança recorrente (mensal/anual) com Pix e cartão; recursos pagos só ficam liberados para assinantes.
6. Base técnica que aguente crescer para milhares de alunos e que o dono consiga manter e vender.

## 3. Não-objetivos (v1)

- App mobile nativo (o site deve funcionar bem no celular; app de loja fica para depois).
- Banco de questões, videoaulas, PDFs de conteúdo ou mentoria humana.
- Comunidade/ranking entre alunos.
- Estudar vários editais ao mesmo tempo no mesmo plano (v1: um plano ativo por aluno; pode trocar de edital).
- Importar dados do app HTML antigo.
- Painel administrativo completo (v1 tem apenas o mínimo descrito na seção 7.8).

## 4. Anti-objetivos (seria um fracasso mesmo "funcionando")

- **O plano incluir matérias ou tópicos que não estão no edital**, ou omitir algum que está. O aluno sempre revisa e pode corrigir o que a IA extraiu antes de gerar o plano.
- **Custo de IA por aluno descontrolado.** A IA roda uma vez por edital (não por aluno, nem diariamente); editais repetidos são reaproveitados.
- **Plano impossível de cumprir** (mais horas do que o aluno informou ter). O plano respeita a disponibilidade; se não couber o edital inteiro até a prova, ele avisa e prioriza por peso.
- **Aluno perder dados** de estudo.
- **Recursos pagos acessíveis sem pagar** por manipulação no navegador. Toda checagem de assinatura é feita no servidor.

## 5. Restrições

- Público brasileiro: interface em português, Pix obrigatório, datas/formatos brasileiros.
- LGPD: termos de uso, política de privacidade, exclusão de conta e dados pelo próprio aluno.
- Editais são PDFs longos (frequentemente 50–200+ páginas), às vezes escaneados (imagem), com vários cargos e o conteúdo programático em anexo.
- Projeto começa do zero (a pasta não é repositório git). O app HTML atual permanece como referência de regras e UX, não é mantido.

## 6. Abordagens consideradas

| Abordagem | Vantagens | Desvantagens |
|---|---|---|
| **A. App novo (Next.js + Supabase + IA), reaproveitando a lógica do atual** ✅ escolhida | Escala, pagamento seguro no servidor, fácil de manter e vender | Mais tempo até a primeira versão |
| B. Manter o HTML único e acrescentar login/banco | Primeira versão mais rápida | Arquivo de 2.800 linhas difícil de crescer; pagamento burlável no navegador; reescrita inevitável depois |
| C. Construtor sem código (Bubble etc.) | Rápido para telas simples | A leitura do edital e o algoritmo do plano — o coração do produto — ficariam presos e limitados |

O dono escolheu **A** porque o objetivo é vender o produto; B só adia a reescrita.

## 7. O produto

### 7.1 Fluxo de entrada (onboarding)

```
[ Envie o PDF do edital ]  (ou escolha um edital já disponível no catálogo)
→ "Encontrei 4 cargos. Qual é o seu?"
→ Revisão do conteúdo extraído: matérias, tópicos e peso — aluno pode editar, adicionar, remover
→ Data da prova: [__/__/____]   ( ) ainda não saiu
→ Horas por dia:  Seg [2h] Ter [2h] ... Sáb [5h] Dom [0h]
→ Seu nível por matéria:  [nunca vi | básico | domino]
→ [ Gerar meu plano ]
```

### 7.2 Leitura do edital (IA)

- Upload do PDF para o armazenamento do Supabase.
- Calcula-se um identificador do arquivo (hash do conteúdo). Se o mesmo edital já foi processado, o resultado é reaproveitado na hora, sem custo de IA.
- Se não, a IA (API do Claude, que lê PDF inclusive escaneado) extrai um JSON estruturado:
  - órgão, banca, ano, data da prova (se houver);
  - lista de cargos; para cada cargo: matérias, tópicos (do conteúdo programático), peso de cada matéria (número de questões e/ou pontos), tipo de prova (objetiva, discursiva, certo/errado).
- Editais longos que ultrapassem o limite de uma requisição são divididos em partes e o resultado é consolidado.
- O processamento é assíncrono: o aluno vê uma tela de "lendo seu edital…" com progresso; leva de segundos a poucos minutos.
- Se o edital não trouxer pesos, o sistema assume peso igual entre as matérias e avisa o aluno (que pode ajustar).
- Edições do aluno valem só para o plano dele; o edital-base no catálogo não muda.
- *(Escolha do Claude)* Cada plano guarda uma **cópia própria** do conteúdo do edital. Quando o edital-base ganha uma nova versão (retificação oficial ou correção do dono), os planos existentes **não mudam sozinhos**: o aluno recebe um aviso "este edital foi atualizado" e pode aplicar a atualização, que acrescenta/remove tópicos preservando o progresso já registrado. Editais têm versões; uma retificação é ligada ao edital original (mesmo órgão + ano + banca + cargo).

### 7.3 Catálogo de editais

- *(Escolha do Claude)* Todo edital processado fica guardado para reaproveitamento (hash do arquivo e chave órgão + ano + banca para detectar duplicatas), mas **só aparece no catálogo público depois que o dono aprova** no painel administrativo. Antes disso, só quem enviou o usa. Isso evita expor erros da IA, duplicatas ou PDFs que não são editais na vitrine.
- Na entrada, o aluno pode buscar um concurso já disponível em vez de enviar o PDF.
- Serve também como vitrine para vender ("editais já prontos: INSS, PF, TJ-SP…").
- *(Escolha do Claude)* Antes do lançamento, o catálogo é pré-carregado com cerca de 10–20 editais abertos ou muito procurados no momento, escolhidos pelo dono e processados pelo próprio sistema. O painel administrativo precisa então da fila de aprovação e da correção de editais já na primeira versão.

### 7.4 Geração do plano (regras, sem IA)

O plano é calculado por regras fixas — mesmo resultado para os mesmos dados, barato e explicável ao aluno.

- **Prioridade de cada matéria** = peso no edital × fator de nível (nunca vi > básico > domino). Valores exatos dos fatores: decisão do builder, ajustáveis por configuração.
- **Tempo total disponível** = soma das horas por dia da semana × semanas até a prova.
- **Reserva final**: as últimas semanas antes da prova são para revisão geral e simulados (proporção decidida pelo builder; sugestão ~15% do tempo, mínimo 1 semana).
- **Distribuição**: o tempo restante é dividido entre matérias pela prioridade; tópicos de cada matéria são sequenciados na ordem do edital.
- **Sem data de prova**: o plano vira um **ciclo contínuo** de matérias (como o ciclo do app atual), com minutos por matéria proporcionais à prioridade.
- **Não cabe tudo**: se o tempo não fecha o edital, o plano avisa e prioriza tópicos das matérias de maior peso.
- **Revisões espaçadas** de cada tópico estudado: 1, 7, 21 e 30 dias (os mesmos do app atual).
- Saídas para o aluno: **o que estudar hoje**, visão da semana, progresso no edital (% de tópicos vistos).

### 7.5 Ajuste semanal

Uma vez por semana (e quando o aluno pedir), o plano é recalculado com:
- horas realmente estudadas vs. planejadas (atraso redistribui o conteúdo restante);
- taxa de acerto por matéria (acerto baixo aumenta a prioridade da matéria; alto reduz);
- revisões vencidas.
O aluno vê um resumo curto do que mudou e por quê.

### 7.6 Acompanhamento (portado do app atual, generalizado)

- Cronômetro de estudo (iniciar/pausar/parar, rascunho salvo se fechar a aba).
- Registro manual e registro rápido de sessão (matéria, tópico, tempo, questões, acertos/erros, observação, tipo).
- Revisões espaçadas com agenda.
- Histórico com edição e exclusão de registros.
- Relatório: tempo por matéria, assuntos para reforçar, revisões da semana.
- Tema claro/escuro.
Tudo salvo no banco, por aluno, disponível em qualquer dispositivo.

### 7.7 Conta e cobrança

- Login por e-mail e por Google.
- **Teste grátis de 7 dias** (decisão do dono): tudo liberado, limitado a **1 edital por conta** (enviado ou do catálogo). Depois do teste, todo o produto é só para assinantes. Envio de edital tem limite de tamanho e de tentativas por conta, para conter abuso e custo de IA.
- *(Escolha do Claude)* Quando o teste ou a assinatura acaba, o aluno continua entrando e **vê** os dados dele (plano, histórico, relatório), mas não registra, não gera nem ajusta plano. Os dados são guardados por 12 meses após o fim do acesso e depois apagados, com aviso por e-mail antes.
- Assinatura mensal e anual, com Pix e cartão. Status da assinatura confirmado pelo servidor (webhook do provedor de pagamento). Toda checagem de acesso (onboarding, geração de plano, registro, ajuste semanal) acontece no servidor.
- Página pública de venda (landing page) e página de preços.
- Termos de uso, política de privacidade, exclusão de conta.

### 7.8 Mínimo administrativo

- O dono consegue ver: número de alunos, assinantes ativos, editais processados e custo de IA aproximado.
- Pode corrigir um edital do catálogo que a IA leu errado (gera nova versão).
- Fila de aprovação de editais para o catálogo público.
- *(Escolha do Claude)* Custo-alvo de IA: poucos reais por edital novo processado; o builder escolhe o modelo com isso em mente e registra o custo de cada extração.

## 8. Decisões técnicas (escolhas do Claude, não do dono)

- **Next.js (App Router) + TypeScript + Tailwind**, hospedado na **Vercel**.
- **Supabase**: Auth, Postgres com Row Level Security (cada aluno só vê os próprios dados), Storage para PDFs.
- **API do Claude** para leitura do edital, com saída em JSON validado por schema.
- **Provedor de pagamento: Asaas** (confirmado pelo dono, que ainda não tem conta em nenhum provedor) — suporta assinatura com Pix e cartão e é comum no Brasil. Desenvolver contra o sandbox do Asaas; a conta de produção (com CNPJ/MEI) é aberta pelo dono antes do lançamento. O checkout coleta CPF do aluno, exigido pelo Asaas.
- Regras de plano e revisão em módulos puros de TypeScript, com testes automatizados.
- Repositório git novo dentro desta pasta; os HTMLs atuais ficam numa pasta `legado/` como referência.

## 9. Deixado para o builder

- Esquema exato do banco de dados.
- Prompt e schema JSON da extração; estratégia de divisão de PDFs longos.
- Valores dos fatores de nível e da reserva final.
- Design visual (deve ser limpo, moderno, funcionar bem no celular).
- Ordem de entrega das partes.

## 10. Pendências (a confirmar com o dono)

- Valores dos planos mensal e anual (não muda a construção; pode ser definido perto do lançamento).
- Dono abrir conta de produção no Asaas com CNPJ (MEI serve para começar) antes do lançamento.
