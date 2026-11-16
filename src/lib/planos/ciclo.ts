import { diaDaSemana } from '@/lib/datas';
import type { BlocoEstudo, DisciplinaPlano, ItemCiclo, PosicaoCiclo } from '@/lib/dominio/tipos';

/** Minutos realmente registrados em sessões com `desde` <= data < `hoje` (ISO compara como texto). */
export function minutosRegistradosNoCiclo(sessoes: { data: string; minutos: number }[], desde: string, hoje: string): number {
  return sessoes.reduce((s, x) => (x.data >= desde && x.data < hoje ? s + Math.max(0, x.minutos) : s), 0);
}

/** Posição no ciclo em minutos: itens antes de `inicio.indice` + `inicio.minutos` + o estudo registrado. */
export function posicaoEmMinutos(ciclo: ItemCiclo[], inicio: PosicaoCiclo | null, registrados: number): number {
  const base = inicio ? ciclo.slice(0, inicio.indice).reduce((s, i) => s + i.minutos, 0) + inicio.minutos : 0;
  return base + registrados;
}

/** Leva a posição (minutos) do ciclo antigo para o novo, mantendo a matéria e a fração percorrida. */
export function converterPosicao(antigo: ItemCiclo[], offset: number, novo: ItemCiclo[]): PosicaoCiclo {
  const total = antigo.reduce((s, i) => s + i.minutos, 0);
  if (novo.length === 0 || total <= 0) return { indice: 0, minutos: 0 };
  let resto = Math.max(0, offset) % total;
  let indiceAntigo = 0;
  while (indiceAntigo < antigo.length - 1 && resto >= antigo[indiceAntigo].minutos) {
    resto -= antigo[indiceAntigo].minutos;
    indiceAntigo++;
  }
  const atual = antigo[indiceAntigo];
  const mesmo = novo.findIndex((i) => i.disciplinaId === atual.disciplinaId);
  if (mesmo >= 0) {
    const fracao = atual.minutos > 0 ? resto / atual.minutos : 0;
    return { indice: mesmo, minutos: Math.round(fracao * novo[mesmo].minutos) };
  }
  for (let k = 1; k < antigo.length; k++) {
    const id = antigo[(indiceAntigo + k) % antigo.length].disciplinaId;
    const indice = novo.findIndex((i) => i.disciplinaId === id);
    if (indice >= 0) return { indice, minutos: 0 };
  }
  return { indice: 0, minutos: 0 };
}

/** Hoje é dia de estudo? (no ciclo, dia sem horas fica livre). */
export function ehDiaDeEstudo(hoje: string, minutosPorDia: number[]): boolean {
  return minutosPorDia[diaDaSemana(hoje)] > 0;
}

/**
 * Tópico de cada bloco de estudo de hoje sem tópico próprio (ciclo), distinto entre blocos da mesma
 * matéria: primeiro um concluído hoje (para poder desmarcar), senão o próximo pendente.
 */
export function topicosDosBlocos(
  blocos: BlocoEstudo[],
  disciplinas: DisciplinaPlano[],
  concluidos: { topicoId: string; dia: string }[],
  hoje: string,
): (string | null)[] {
  const feitosHoje = new Set(concluidos.filter((c) => c.dia === hoje).map((c) => c.topicoId));
  const feitos = new Set(concluidos.map((c) => c.topicoId));
  const usados = new Set<string>(blocos.flatMap((b) => (b.topicoId ? [b.topicoId] : [])));
  return blocos.map((b) => {
    if (b.tipo !== 'estudo') return null;
    if (b.topicoId) return b.topicoId;
    const topicos = disciplinas.find((d) => d.id === b.disciplinaId)?.topicos ?? [];
    const escolhido =
      topicos.find((t) => feitosHoje.has(t.id) && !usados.has(t.id)) ??
      topicos.find((t) => !feitos.has(t.id) && !usados.has(t.id));
    if (!escolhido) return null;
    usados.add(escolhido.id);
    return escolhido.id;
  });
}
