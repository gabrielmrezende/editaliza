import { diasEntre, hojeEmSaoPaulo, somarDias } from '@/lib/datas';
import type { Revisao } from '@/lib/dominio/acompanhamento';

/** Tempo estimado de uma revisão, usado no planejamento do dia. */
export const MINUTOS_POR_REVISAO = 15;

/** Revisões a criar para um estudo, sem repetir as já pendentes (mesmo tópico + intervalo). */
export function revisoesParaCriar(
  topicoId: string,
  dataEstudo: string,
  intervalos: readonly number[],
  pendentes: { topicoId: string; intervalo: number }[],
): { intervalo: number; dataRevisao: string }[] {
  return intervalos
    .filter((i) => !pendentes.some((p) => p.topicoId === topicoId && p.intervalo === i))
    .map((intervalo) => ({ intervalo, dataRevisao: somarDias(dataEstudo, intervalo) }));
}

export interface Agenda {
  atrasadas: Revisao[];
  hoje: Revisao[];
  semana: Revisao[];
  proximas: Revisao[];
  concluidas: Revisao[];
}

/** Dias que a revisão está atrasada (0 se não está). */
export function diasDeAtraso(r: Revisao, hoje: string): number {
  return Math.max(0, diasEntre(r.dataRevisao, hoje));
}

/** Concluídas aparecem por este número de dias. */
const DIAS_CONCLUIDAS = 30;

const porDataEDisciplina = (a: Revisao, b: Revisao) =>
  a.dataRevisao.localeCompare(b.dataRevisao) || a.disciplinaNome.localeCompare(b.disciplinaNome, 'pt-BR');

export function agruparAgenda(revisoes: Revisao[], hoje: string): Agenda {
  const agenda: Agenda = { atrasadas: [], hoje: [], semana: [], proximas: [], concluidas: [] };
  for (const r of revisoes) {
    if (r.concluidaEm) {
      const dia = hojeEmSaoPaulo(new Date(r.concluidaEm));
      if (diasEntre(dia, hoje) <= DIAS_CONCLUIDAS) agenda.concluidas.push(r);
      continue;
    }
    const d = diasEntre(hoje, r.dataRevisao);
    if (d < 0) agenda.atrasadas.push(r);
    else if (d === 0) agenda.hoje.push(r);
    else if (d <= 7) agenda.semana.push(r);
    else agenda.proximas.push(r);
  }
  agenda.atrasadas.sort(porDataEDisciplina);
  agenda.hoje.sort(porDataEDisciplina);
  agenda.semana.sort(porDataEDisciplina);
  agenda.proximas.sort(porDataEDisciplina);
  agenda.concluidas.sort((a, b) => (b.concluidaEm ?? '').localeCompare(a.concluidaEm ?? ''));
  return agenda;
}
