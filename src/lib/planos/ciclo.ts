import { diaDaSemana, diasEntre, somarDias } from '@/lib/datas';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';

/**
 * Deslocamento no ciclo (modo sem data de prova), em minutos: a soma dos minutos de estudo de cada
 * dia desde o início do plano até ontem. Dias livres não avançam o ciclo.
 */
export function minutosNoCiclo(inicio: string, hoje: string, minutosPorDia: number[]): number {
  const total = diasEntre(inicio, hoje);
  if (total <= 0) return 0;
  const porSemana = minutosPorDia.reduce((s, m) => s + Math.max(0, m), 0);
  const semanas = Math.floor(total / 7);
  let minutos = semanas * porSemana;
  for (let i = semanas * 7; i < total; i++) {
    minutos += Math.max(0, minutosPorDia[diaDaSemana(somarDias(inicio, i))] ?? 0);
  }
  return minutos;
}

/** Hoje é dia de estudo? (no ciclo, dia sem horas fica livre). */
export function ehDiaDeEstudo(hoje: string, minutosPorDia: number[]): boolean {
  return minutosPorDia[diaDaSemana(hoje)] > 0;
}

/**
 * Tópico do bloco de ciclo de hoje, fixo durante o dia: o que o aluno concluiu hoje (para poder
 * desmarcar) ou, se nenhum, o primeiro ainda pendente. Null se a matéria já foi toda concluída.
 */
export function topicoDoCicloHoje(
  disciplina: DisciplinaPlano,
  concluidos: { topicoId: string; dia: string }[],
  hoje: string,
): string | null {
  const feitosHoje = new Set(concluidos.filter((c) => c.dia === hoje).map((c) => c.topicoId));
  const feitos = new Set(concluidos.map((c) => c.topicoId));
  return (
    disciplina.topicos.find((t) => feitosHoje.has(t.id))?.id ??
    disciplina.topicos.find((t) => !feitos.has(t.id))?.id ??
    null
  );
}
