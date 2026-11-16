import type { BlocoEstudo, DiaPlano, DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';

export function tarefasDoDia(plano: PlanoGerado, data: string, posicaoCiclo = 0): BlocoEstudo[] {
  if (plano.modo === 'prazo') {
    return plano.dias.find((d) => d.data === data)?.blocos ?? [];
  }
  if (plano.ciclo.length === 0) return [];
  const pos = Number.isInteger(posicaoCiclo) && posicaoCiclo > 0 ? posicaoCiclo : 0;
  const item = plano.ciclo[pos % plano.ciclo.length];
  return [{ disciplinaId: item.disciplinaId, topicoId: null, tipo: 'estudo', minutos: item.minutos }];
}

function somaDias(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function semana(plano: PlanoGerado, inicio: string): DiaPlano[] {
  return Array.from({ length: 7 }, (_, i) => {
    const data = somaDias(inicio, i);
    return { data, blocos: plano.modo === 'prazo' ? tarefasDoDia(plano, data) : [] };
  });
}

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
