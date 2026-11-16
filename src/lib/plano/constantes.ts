import type { Nivel } from '@/lib/dominio/tipos';

/** Multiplicador de prioridade por nível de conhecimento. */
export const FATOR_NIVEL: Record<Nivel, number> = { nunca_vi: 1.5, basico: 1.0, domino: 0.6 };

/** Peso usado quando a disciplina não informa questões nem pontos (ou o valor é inválido). */
export const PESO_PADRAO = 1;

export const MINUTOS_MINIMOS_TOPICO = 45;
export const MINUTOS_MAXIMOS_BLOCO = 60;

/** Ciclo semanal: arredonda para múltiplos de 15, com mínimo de 30. */
export const PASSO_CICLO = 15;
export const MINUTOS_MINIMOS_CICLO = 30;

/** Reserva final (revisão geral + simulados). */
export const FRACAO_RESERVA = 0.15;
export const DIAS_MINIMOS_RESERVA = 7;
export const DIAS_MINIMOS_PARA_RESERVA = 14;
export const DIAS_POR_SIMULADO = 7;

/** Ajuste semanal: a cada 7 dias (ou botão, no máximo 1 por 60 min). */
export const INTERVALO_AJUSTE_DIAS = 7;
export const INTERVALO_AJUSTE_MANUAL_MIN = 60;
/** Acerto por matéria: janela de 28 dias e mínimo de 10 questões. */
export const JANELA_ACERTO_DIAS = 28;
export const MIN_QUESTOES_ACERTO = 10;
export const ACERTO_BAIXO = 0.6;
export const ACERTO_ALTO = 0.8;
export const FATOR_ACERTO_BAIXO = 1.25;
export const FATOR_ACERTO_ALTO = 0.85;
/** Matéria com 2 ou mais revisões atrasadas. */
export const MIN_REVISOES_ATRASADAS = 2;
export const FATOR_REVISOES = 1.1;
/** Limites do multiplicador final. */
export const AJUSTE_MIN = 0.8;
export const AJUSTE_MAX = 1.4;
