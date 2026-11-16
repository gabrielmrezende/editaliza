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
