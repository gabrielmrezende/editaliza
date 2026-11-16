export const MAX_BYTES = 50 * 1024 * 1024;
export const MAX_PAGINAS = 600;
/** Editais novos (hash inédito) que um usuário pode enviar por janela. */
export const MAX_NOVOS_POR_JANELA = 5;
export const JANELA_HORAS = 24;
/** Edital em 'processando' além disto é tratado como erro. */
export const PROCESSANDO_MAX_MINUTOS = 10;

export const MSG_ERRO_GENERICO = 'Não conseguimos ler este edital. Tente de novo ou envie outro arquivo.';
export const MSG_EDITAL_INVALIDO = 'Este arquivo não parece ser um edital de concurso.';

/** Chamadas de IA (listar cargos + extrair conteúdo, inclusive novas tentativas) por usuário na janela. */
export const MAX_CHAMADAS_IA = 15;
export const JANELA_IA_MINUTOS = 24 * 60;
/** Só na resposta 429 de quem estourou a cota; nunca gravada na linha compartilhada do edital/cargo. */
export const MSG_COTA_IA = 'Você atingiu o limite de leituras por hoje. Tente novamente amanhã.';
/** Gravada na linha compartilhada quando a leitura não começou por causa da cota de quem pediu. */
export const MSG_LEITURA_INTERROMPIDA = 'A leitura foi interrompida. Tente de novo.';

/** URLs assinadas de envio por usuário na janela. */
export const MAX_URLS_ENVIO = 20;
export const JANELA_URLS_MINUTOS = 60;
export const MSG_COTA_URLS = 'Você fez muitos envios na última hora. Aguarde um pouco e tente de novo.';
