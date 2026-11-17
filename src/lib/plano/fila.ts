import type { BlocoEstudo, DisciplinaPlano, ItemCiclo, PlanoGerado } from '@/lib/dominio/tipos';

/** Quantos blocos a grade de "próximos blocos" mostra. */
export const QUANTIDADE_PROXIMOS = 12;

export interface BlocoFila { posicao: number; disciplinaId: string; topicoId: string | null; tipo: BlocoEstudo['tipo']; minutos: number }

export type Fila =
  | { modo: 'prazo'; blocos: Omit<BlocoFila, 'posicao'>[] }
  | { modo: 'ciclo'; itens: ItemCiclo[] };

/** Prazo: blocos dos dias com data >= filaDesde (null = todos), na ordem das datas e dos blocos. Ciclo: os itens do ciclo. */
export function montarFila(gerado: PlanoGerado, filaDesde: string | null): Fila {
  if (gerado.modo === 'ciclo') return { modo: 'ciclo', itens: gerado.ciclo };
  const dias = [...gerado.dias]
    .filter((d) => filaDesde === null || d.data >= filaDesde)
    .sort((x, y) => (x.data < y.data ? -1 : x.data > y.data ? 1 : 0));
  const blocos = dias.flatMap((d) =>
    d.blocos.map((b) => ({ disciplinaId: b.disciplinaId, topicoId: b.topicoId, tipo: b.tipo, minutos: b.minutos })),
  );
  return { modo: 'prazo', blocos };
}

/** Prazo: número de blocos da fila; ciclo: null (a fila não tem fim). */
export function totalDaFila(fila: Fila): number | null {
  return fila.modo === 'prazo' ? fila.blocos.length : null;
}

export function blocoDaFila(fila: Fila, posicao: number): BlocoFila | null {
  if (posicao < 0) return null;
  if (fila.modo === 'prazo') {
    const b = fila.blocos[posicao];
    return b ? { posicao, ...b } : null;
  }
  const n = fila.itens.length;
  if (n === 0) return null;
  const item = fila.itens[posicao % n];
  return { posicao, disciplinaId: item.disciplinaId, topicoId: null, tipo: 'estudo', minutos: item.minutos };
}

/** Blocos das posições posicao+1, posicao+2, …; no prazo para no fim da fila. */
export function proximosBlocos(fila: Fila, posicao: number, quantidade: number): BlocoFila[] {
  const lista: BlocoFila[] = [];
  for (let p = posicao + 1; lista.length < quantidade; p++) {
    const b = blocoDaFila(fila, p);
    if (!b) break;
    lista.push(b);
  }
  return lista;
}

export function numeracao(fila: Fila, posicao: number): { numero: number; total: number | null; volta: number | null } {
  if (fila.modo === 'prazo') return { numero: posicao + 1, total: fila.blocos.length, volta: null };
  const n = fila.itens.length;
  if (n === 0) return { numero: posicao + 1, total: null, volta: 1 };
  return { numero: (posicao % n) + 1, total: null, volta: Math.floor(posicao / n) + 1 };
}

/** 'Bloco 5 de 48' (prazo) ou 'Bloco 2 · volta 3' (ciclo). */
export function rotuloDoBloco(fila: Fila, posicao: number): string {
  const { numero, total, volta } = numeracao(fila, posicao);
  return total !== null ? `Bloco ${numero} de ${total}` : `Bloco ${numero} · volta ${volta}`;
}

/** Primeiro tópico pendente da matéria, na ordem do edital; null se não há matéria ou todos estão concluídos. */
export function topicoDoCiclo(disciplina: DisciplinaPlano | undefined, concluidos: ReadonlySet<string>): string | null {
  if (!disciplina) return null;
  return disciplina.topicos.find((t) => !concluidos.has(t.id))?.id ?? null;
}

/** Prazo: o tópico do próprio bloco (mesmo já concluído); ciclo: o primeiro tópico pendente da matéria. */
export function topicoDoBloco(
  bloco: BlocoFila,
  fila: Fila,
  disciplinas: DisciplinaPlano[],
  concluidos: ReadonlySet<string>,
): string | null {
  if (fila.modo === 'prazo') return bloco.topicoId;
  return topicoDoCiclo(disciplinas.find((d) => d.id === bloco.disciplinaId), concluidos);
}

/**
 * Prazo: o bloco da posição tem tópico e é o último bloco desse tópico daqui até o fim da fila (o
 * "Concluí este tópico" vem marcado). Ciclo, fim da fila ou bloco sem tópico: false.
 */
export function ultimoBlocoDoTopico(fila: Fila, posicao: number): boolean {
  if (fila.modo !== 'prazo') return false;
  const topicoId = fila.blocos[posicao]?.topicoId;
  if (!topicoId) return false;
  return !fila.blocos.slice(posicao + 1).some((b) => b.topicoId === topicoId);
}

/**
 * Converte a posição da fila do ciclo quando os itens mudam (ajuste): mantém a volta e aponta para a
 * mesma matéria no novo ciclo; se ela saiu, para o próximo item (na ordem antiga, dando a volta) que exista no novo.
 */
export function converterPosicaoFila(antigo: ItemCiclo[], posicao: number, novo: ItemCiclo[]): number {
  if (antigo.length === 0 || novo.length === 0) return 0;
  const volta = Math.floor(posicao / antigo.length);
  const atual = posicao % antigo.length;
  let indice = 0;
  for (let i = 0; i < antigo.length; i++) {
    const encontrado = novo.findIndex((item) => item.disciplinaId === antigo[(atual + i) % antigo.length].disciplinaId);
    if (encontrado >= 0) { indice = encontrado; break; }
  }
  return volta * novo.length + indice;
}
