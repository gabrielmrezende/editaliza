import { diaDaSemana, somarDias } from '@/lib/datas';
import type { BlocoEstudo, DiaPlano, DisciplinaPlano, ItemCiclo, PlanoGerado } from '@/lib/dominio/tipos';

const inteiroNaoNegativo = (n: number) => (Number.isInteger(n) && n > 0 ? n : 0);

/**
 * Blocos do ciclo para um dia: anda pelos itens do ciclo a partir de `offsetMinutos` (módulo o total
 * do ciclo) até preencher exatamente `minutosDoDia`, cortando nos limites dos itens e dando a volta.
 * Pedaços seguidos da mesma matéria viram um bloco só.
 */
function blocosDoCiclo(ciclo: ItemCiclo[], offsetMinutos: number, minutosDoDia: number): BlocoEstudo[] {
  const total = ciclo.reduce((s, i) => s + i.minutos, 0);
  let restante = inteiroNaoNegativo(minutosDoDia);
  if (total <= 0 || restante === 0) return [];

  let pos = inteiroNaoNegativo(offsetMinutos) % total;
  let indice = 0;
  while (pos >= ciclo[indice].minutos) {
    pos -= ciclo[indice].minutos;
    indice++;
  }
  const blocos: BlocoEstudo[] = [];
  while (restante > 0) {
    const item = ciclo[indice];
    const minutos = Math.min(item.minutos - pos, restante);
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.disciplinaId === item.disciplinaId) ultimo.minutos += minutos;
    else blocos.push({ disciplinaId: item.disciplinaId, topicoId: null, tipo: 'estudo', minutos });
    restante -= minutos;
    pos = 0;
    indice = (indice + 1) % ciclo.length;
  }
  return blocos;
}

/**
 * Blocos de um dia. No prazo, os do calendário gerado. No ciclo, preenche exatamente `minutosDoDia`
 * a partir de `offsetMinutos` (minutos de estudo já feitos no ciclo desde o início do plano).
 */
export function tarefasDoDia(plano: PlanoGerado, data: string, offsetMinutos = 0, minutosDoDia = 0): BlocoEstudo[] {
  if (plano.modo === 'prazo') {
    return plano.dias.find((d) => d.data === data)?.blocos ?? [];
  }
  return blocosDoCiclo(plano.ciclo, offsetMinutos, minutosDoDia);
}

/** Os 7 dias a partir de `inicio`. No ciclo, cada dia continua de onde o anterior parou. */
export function semana(
  plano: PlanoGerado,
  inicio: string,
  ciclo?: { offsetMinutos: number; minutosPorDia: number[] },
): DiaPlano[] {
  let offset = ciclo?.offsetMinutos ?? 0;
  return Array.from({ length: 7 }, (_, i) => {
    const data = somarDias(inicio, i);
    if (plano.modo === 'prazo') return { data, blocos: tarefasDoDia(plano, data) };
    if (!ciclo) return { data, blocos: [] };
    const minutos = ciclo.minutosPorDia[diaDaSemana(data)] ?? 0;
    const blocos = tarefasDoDia(plano, data, offset, minutos);
    offset += minutos;
    return { data, blocos };
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
