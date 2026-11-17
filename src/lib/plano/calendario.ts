// Calendário do mês: projeção da fila de blocos nos dias futuros e resumo de cada dia (módulo puro, sem I/O).
import { dataPorExtenso, diaDaSemana, somarDias } from '@/lib/datas';
import { formatarMinutos } from '@/lib/formatar';
import { blocoDaFila, type BlocoFila, type Fila } from '@/lib/plano/fila';

export interface EntradaProjecao {
  fila: Fila;
  posicao: number;
  minutosPorDia: number[];
  hoje: string;
  registradosHoje: number;
  dataProva: string | null;
  ate: string;
}

/** Distribui os próximos blocos da fila nos dias com tempo disponível; bloco maior que o dia ocupa um dia sozinho. */
export function projetarFila(e: EntradaProjecao): Map<string, BlocoFila[]> {
  const mapa = new Map<string, BlocoFila[]>();
  if (e.minutosPorDia.reduce((s, m) => s + m, 0) === 0 || blocoDaFila(e.fila, e.posicao) === null) return mapa;
  // Bloco sem minutos não ocupa dia; um ciclo só com eles não tem o que projetar (e não acabaria).
  if (e.fila.modo === 'ciclo' && e.fila.itens.every((i) => i.minutos <= 0)) return mapa;
  const cap = (d: string) => e.minutosPorDia[diaDaSemana(d)];
  let dia = e.hoje;
  let livre = Math.max(0, cap(dia) - e.registradosHoje);
  let vazio = true;
  let p = e.posicao;
  const poe = (b: BlocoFila) => {
    const lista = mapa.get(dia) ?? [];
    lista.push(b);
    mapa.set(dia, lista);
  };
  while (dia <= e.ate && (e.dataProva === null || dia < e.dataProva)) {
    const b = blocoDaFila(e.fila, p);
    if (!b) break;
    if (b.minutos <= 0) {
      p++;
    } else if (cap(dia) > 0 && b.minutos <= livre) {
      poe(b);
      livre -= b.minutos;
      vazio = false;
      p++;
    } else if (cap(dia) > 0 && vazio && livre === cap(dia)) {
      poe(b);
      livre = 0;
      vazio = false;
      p++;
    } else {
      dia = somarDias(dia, 1);
      livre = cap(dia);
      vazio = true;
    }
  }
  return mapa;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'aaaa-mm' → datas de domingo a sábado cobrindo o mês. */
export function gradeDoMes(mes: string): string[] {
  const primeiro = `${mes}-01`;
  const [a, m] = mes.split('-').map(Number);
  const ultimo = somarDias(`${m === 12 ? a + 1 : a}-${pad(m === 12 ? 1 : m + 1)}-01`, -1);
  const inicio = somarDias(primeiro, -diaDaSemana(primeiro));
  const fim = somarDias(ultimo, 6 - diaDaSemana(ultimo));
  const datas: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) datas.push(d);
  return datas;
}

const indiceMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  return a * 12 + (m - 1);
};

/** 'aaaa-mm' entre hoje −24 e +24 meses; senão o mês de hoje. */
export function mesValido(valor: string | undefined, hoje: string): string {
  const atual = hoje.slice(0, 7);
  if (!valor || !/^\d{4}-(0[1-9]|1[0-2])$/.test(valor)) return atual;
  return Math.abs(indiceMes(valor) - indiceMes(atual)) <= 24 ? valor : atual;
}

export function mesVizinho(mes: string, delta: -1 | 1): string {
  const i = indiceMes(mes) + delta;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}

export interface DiaCalendario {
  data: string;
  doMes: boolean;
  ehHoje: boolean;
  passado: boolean;
  minutosEstudados: number;
  revisoesPendentes: number;
  revisoesFeitas: number;
  previstos: BlocoFila[];
}

export function montarCalendario(e: {
  mes: string;
  hoje: string;
  sessoes: { data: string; minutos: number }[];
  revisoes: { dataRevisao: string; concluidaEm: string | null }[];
  projecao: Map<string, BlocoFila[]>;
}): DiaCalendario[] {
  return gradeDoMes(e.mes).map((data) => {
    const revisoesDoDia = e.revisoes.filter((r) => r.dataRevisao === data);
    return {
      data,
      doMes: data.startsWith(`${e.mes}-`),
      ehHoje: data === e.hoje,
      passado: data < e.hoje,
      minutosEstudados: data > e.hoje ? 0 : e.sessoes.filter((s) => s.data === data).reduce((s, x) => s + x.minutos, 0),
      revisoesPendentes: revisoesDoDia.filter((r) => r.concluidaEm === null).length,
      revisoesFeitas: revisoesDoDia.filter((r) => r.concluidaEm !== null).length,
      previstos: data >= e.hoje ? (e.projecao.get(data) ?? []) : [],
    };
  });
}

/** Texto para leitor de tela: '18 de novembro: 1 h previstos, 1 revisão pendente, 1 revisão feita'. */
export function rotuloDoDia(d: DiaCalendario): string {
  const partes: string[] = [];
  if (d.minutosEstudados > 0) partes.push(`${formatarMinutos(d.minutosEstudados)} estudados`);
  const previstos = d.previstos.reduce((s, b) => s + b.minutos, 0);
  if (previstos > 0) partes.push(`${formatarMinutos(previstos)} previstos`);
  if (d.revisoesPendentes > 0) partes.push(`${d.revisoesPendentes} ${d.revisoesPendentes === 1 ? 'revisão pendente' : 'revisões pendentes'}`);
  if (d.revisoesFeitas > 0) partes.push(`${d.revisoesFeitas} ${d.revisoesFeitas === 1 ? 'revisão feita' : 'revisões feitas'}`);
  const data = dataPorExtenso(d.data, { day: 'numeric', month: 'long' });
  return `${data}: ${partes.length > 0 ? partes.join(', ') : 'sem estudo'}`;
}
