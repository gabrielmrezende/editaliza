/** Mensagens compartilhadas entre a tela e a API de acompanhamento. */
export const MSG_ERRO_ACOMPANHAMENTO = 'Algo deu errado ao salvar seu estudo. Tente de novo em instantes.';
export const MSG_SEM_PLANO_ATIVO = 'Você precisa de um plano ativo para registrar estudo.';
export const MSG_FORA_DO_PLANO = 'Esta matéria ou tópico não faz parte do plano.';
export const MSG_DATA_FUTURA = 'A data não pode ser no futuro.';
export const MSG_DATA_ANTIGA = 'A data é antiga demais.';
export const MSG_MUITAS_SESSOES = 'Você registrou muitas sessões hoje.';
export const MSG_TEMPO_OU_QUESTOES = 'Informe o tempo ou as questões.';
export const MSG_PLANO_ANTIGO =
  'Esta sessão é de um plano antigo: só dá para mudar data, tempo, questões, tipo e observação.';
export const MSG_REVISAO_REPETIDA = 'Já existe uma revisão pendente igual a esta.';
/** Máximo de sessões criadas por usuário em um dia (São Paulo). */
export const MAX_SESSOES_POR_DIA = 200;
/** Até quantos dias atrás uma sessão pode ser datada. */
export const MAX_DIAS_PASSADO = 365;
