/** Mensagens compartilhadas entre a tela e a API de planos. */
export const MSG_DATA_PASSADA = 'A data da prova precisa ser depois de hoje.';
export const MSG_DATA_DISTANTE = 'A data da prova precisa estar nos próximos 3 anos.';
/** Até onde a data da prova pode ir (3 anos). Limita o tamanho do plano gerado no servidor. */
export const MAX_DIAS_ATE_PROVA = 1096;
export const MSG_SEM_HORAS = 'Informe ao menos um dia com horas de estudo.';
/** "Ajustar agora" antes de 60 min do último ajuste; `hora` = HH:MM em São Paulo. */
export const msgAjusteRecente = (hora: string) => `Você ajustou há pouco. Tente de novo depois das ${hora}.`;
export const MSG_ERRO_PLANO = 'Algo deu errado ao salvar seu plano. Tente de novo em instantes.';
/** Concluir/voltar bloco com a fila já mudada (outra aba, clique duplo ou ajuste). */
export const MSG_FILA_MUDOU = 'A fila mudou em outra tela. Atualizamos para você.';
/** Plano com data: a posição passou do último bloco. */
export const MSG_FILA_FIM = 'Você chegou ao fim da fila.';
