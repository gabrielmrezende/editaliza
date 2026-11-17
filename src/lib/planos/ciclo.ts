import { diaDaSemana } from '@/lib/datas';

/** Hoje é dia de estudo? (no ciclo, dia sem horas fica livre). */
export function ehDiaDeEstudo(hoje: string, minutosPorDia: number[]): boolean {
  return minutosPorDia[diaDaSemana(hoje)] > 0;
}
