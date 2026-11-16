import { diaDaSemana, diasEntre, somarDias } from '@/lib/datas';

/**
 * Posição no ciclo (modo sem data de prova): quantos dias de estudo (dias da semana com
 * minutos > 0) houve desde o início do plano até ontem. Dias livres não avançam o ciclo.
 */
export function posicaoNoCiclo(inicio: string, hoje: string, minutosPorDia: number[]): number {
  const total = diasEntre(inicio, hoje);
  if (total <= 0) return 0;
  const porSemana = minutosPorDia.filter((m) => m > 0).length;
  const semanas = Math.floor(total / 7);
  let posicao = semanas * porSemana;
  for (let i = semanas * 7; i < total; i++) {
    if (minutosPorDia[diaDaSemana(somarDias(inicio, i))] > 0) posicao++;
  }
  return posicao;
}

/** Hoje é dia de estudo? (no ciclo, dia sem horas fica livre). */
export function ehDiaDeEstudo(hoje: string, minutosPorDia: number[]): boolean {
  return minutosPorDia[diaDaSemana(hoje)] > 0;
}
