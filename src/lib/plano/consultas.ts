import type { DisciplinaPlano } from '@/lib/dominio/tipos';

export function progresso(
  disciplinas: DisciplinaPlano[],
  concluidos: string[],
): { total: number; concluidos: number; porDisciplina: Record<string, { total: number; concluidos: number }> } {
  const feitos = new Set(concluidos);
  const porDisciplina: Record<string, { total: number; concluidos: number }> = {};
  let total = 0;
  let feitosTotal = 0;
  for (const d of disciplinas) {
    const c = d.topicos.filter((t) => feitos.has(t.id)).length;
    porDisciplina[d.id] = { total: d.topicos.length, concluidos: c };
    total += d.topicos.length;
    feitosTotal += c;
  }
  return { total, concluidos: feitosTotal, porDisciplina };
}
