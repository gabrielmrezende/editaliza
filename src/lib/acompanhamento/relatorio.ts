// Relatório de estudo por período: agregação pura de sessões e revisões (sem I/O).
import { diaDaSemana, diasEntre, somarDias } from '@/lib/datas';
import type { Revisao, Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano, MinutosPorDia, PlanoGerado } from '@/lib/dominio/tipos';

export type Periodo = 'semana' | 'semana_passada' | '30dias' | 'plano';
export interface Intervalo { inicio: string; fim: string }

export type Orientacao =
  | { tipo: 'reforcar'; topicoNome: string; percentual: number; questoes: number }
  | { tipo: 'uma_materia' }
  | { tipo: 'revisoes_atrasadas'; quantidade: number }
  | { tipo: 'sem_estudo' }
  | { tipo: 'menos_que_anterior' };

export interface Relatorio {
  intervalo: Intervalo;
  minutos: number;
  questoes: number;
  acertos: number;
  percentualAcerto: number | null;
  diasComEstudo: number;
  anterior: { minutos: number; questoes: number; percentualAcerto: number | null };
  porDisciplina: {
    disciplinaId: string;
    nome: string;
    minutos: number;
    fracaoEstudada: number;
    fracaoPlanejada: number;
    diasSemEstudo: number | null;
  }[];
  reforcar: { disciplinaNome: string; topicoId: string; topicoNome: string; questoes: number; percentual: number }[];
  revisoes: { agendadas: number; concluidas: number; atrasadas: number };
  orientacoes: Orientacao[];
}

const MIN_QUESTOES_REFORCAR = 5;
const LIMITE_ACERTO_REFORCAR = 70;
const MAX_REFORCAR = 10;
const MAX_ORIENTACOES = 3;

export function intervaloDoPeriodo(p: Periodo, hoje: string, inicioPlano: string): Intervalo {
  const domingo = somarDias(hoje, -diaDaSemana(hoje));
  switch (p) {
    case 'semana':
      return { inicio: domingo, fim: somarDias(domingo, 6) };
    case 'semana_passada':
      return { inicio: somarDias(domingo, -7), fim: somarDias(domingo, -1) };
    case '30dias':
      return { inicio: somarDias(hoje, -29), fim: hoje };
    case 'plano':
      return { inicio: inicioPlano, fim: hoje };
  }
}

/** Intervalo de mesmo tamanho, imediatamente antes. */
export function periodoAnterior(i: Intervalo): Intervalo {
  const tamanho = diasEntre(i.inicio, i.fim) + 1;
  return { inicio: somarDias(i.inicio, -tamanho), fim: somarDias(i.inicio, -1) };
}

const dentro = (data: string, i: Intervalo) => data >= i.inicio && data <= i.fim;

/** Minutos planejados por matéria (disciplinaId → minutos) dentro do intervalo. */
export function planejadoNoIntervalo(gerado: PlanoGerado, minutosPorDia: MinutosPorDia, i: Intervalo): Record<string, number> {
  const saida: Record<string, number> = {};
  if (gerado.modo === 'prazo') {
    for (const dia of gerado.dias) {
      if (!dentro(dia.data, i)) continue;
      for (const b of dia.blocos) saida[b.disciplinaId] = (saida[b.disciplinaId] ?? 0) + b.minutos;
    }
    return saida;
  }
  let totalMinutos = 0;
  for (let d = i.inicio; d <= i.fim; d = somarDias(d, 1)) totalMinutos += minutosPorDia[diaDaSemana(d)];
  const somaCiclo = gerado.ciclo.reduce((s, c) => s + c.minutos, 0);
  if (somaCiclo === 0) return saida;
  for (const c of gerado.ciclo) saida[c.disciplinaId] = Math.round((c.minutos * totalMinutos) / somaCiclo);
  return saida;
}

const percentual = (acertos: number, questoes: number) => (questoes > 0 ? Math.round((100 * acertos) / questoes) : null);

function totais(sessoes: Sessao[]) {
  let minutos = 0;
  let acertos = 0;
  let questoes = 0;
  for (const s of sessoes) {
    minutos += s.minutos;
    acertos += s.acertos;
    questoes += s.acertos + s.erros;
  }
  return { minutos, acertos, questoes, percentualAcerto: percentual(acertos, questoes) };
}

export function montarRelatorio(e: {
  sessoes: Sessao[];
  revisoes: Revisao[];
  disciplinas: DisciplinaPlano[];
  gerado: PlanoGerado;
  minutosPorDia: MinutosPorDia;
  intervalo: Intervalo;
  hoje: string;
}): Relatorio {
  const { intervalo, hoje } = e;
  const noIntervalo = e.sessoes.filter((s) => dentro(s.data, intervalo));
  const t = totais(noIntervalo);
  const ant = totais(e.sessoes.filter((s) => dentro(s.data, periodoAnterior(intervalo))));

  const diasComEstudo = new Set(noIntervalo.filter((s) => s.minutos > 0).map((s) => s.data)).size;

  const planejado = planejadoNoIntervalo(e.gerado, e.minutosPorDia, intervalo);
  const somaPlanejada = e.disciplinas.reduce((s, d) => s + (planejado[d.id] ?? 0), 0);

  const porDisciplina = e.disciplinas
    .map((d, ordem) => {
      const minutos = noIntervalo.filter((s) => s.disciplinaId === d.id).reduce((s, x) => s + x.minutos, 0);
      const ultima = e.sessoes
        .filter((s) => s.disciplinaId === d.id)
        .reduce<string | null>((m, s) => (m === null || s.data > m ? s.data : m), null);
      return {
        ordem,
        disciplinaId: d.id,
        nome: d.nome,
        minutos,
        fracaoEstudada: t.minutos > 0 ? minutos / t.minutos : 0,
        fracaoPlanejada: somaPlanejada > 0 ? (planejado[d.id] ?? 0) / somaPlanejada : 0,
        diasSemEstudo: ultima === null ? null : diasEntre(ultima, hoje),
      };
    })
    .sort((a, b) => b.minutos - a.minutos || a.ordem - b.ordem)
    .map((d) => ({ disciplinaId: d.disciplinaId, nome: d.nome, minutos: d.minutos, fracaoEstudada: d.fracaoEstudada, fracaoPlanejada: d.fracaoPlanejada, diasSemEstudo: d.diasSemEstudo }));

  const topicos = new Map<string, { disciplinaNome: string; topicoNome: string; acertos: number; questoes: number }>();
  for (const s of noIntervalo) {
    if (!s.topicoId) continue;
    const g = topicos.get(s.topicoId) ?? { disciplinaNome: s.disciplinaNome, topicoNome: s.topicoNome ?? '', acertos: 0, questoes: 0 };
    g.acertos += s.acertos;
    g.questoes += s.acertos + s.erros;
    topicos.set(s.topicoId, g);
  }
  const reforcar = [...topicos.entries()]
    .filter(([, g]) => g.questoes >= MIN_QUESTOES_REFORCAR && (100 * g.acertos) / g.questoes < LIMITE_ACERTO_REFORCAR)
    .map(([topicoId, g]) => ({
      bruto: g.acertos / g.questoes,
      disciplinaNome: g.disciplinaNome,
      topicoId,
      topicoNome: g.topicoNome,
      questoes: g.questoes,
      percentual: Math.round((100 * g.acertos) / g.questoes),
    }))
    .sort((a, b) => a.bruto - b.bruto || b.questoes - a.questoes)
    .slice(0, MAX_REFORCAR)
    .map((g) => ({ disciplinaNome: g.disciplinaNome, topicoId: g.topicoId, topicoNome: g.topicoNome, questoes: g.questoes, percentual: g.percentual }));

  const revisoes = {
    agendadas: e.revisoes.filter((r) => dentro(r.dataRevisao, intervalo)).length,
    concluidas: e.revisoes.filter((r) => dentro(r.dataRevisao, intervalo) && r.concluidaEm !== null).length,
    atrasadas: e.revisoes.filter((r) => r.concluidaEm === null && r.dataRevisao < hoje).length,
  };

  const orientacoes: Orientacao[] = [];
  if (t.minutos === 0) orientacoes.push({ tipo: 'sem_estudo' });
  if (reforcar.length > 0) {
    const p = reforcar[0];
    orientacoes.push({ tipo: 'reforcar', topicoNome: p.topicoNome, percentual: p.percentual, questoes: p.questoes });
  }
  if (revisoes.atrasadas > 0) orientacoes.push({ tipo: 'revisoes_atrasadas', quantidade: revisoes.atrasadas });
  if (t.minutos > 0 && new Set(noIntervalo.filter((s) => s.minutos > 0).map((s) => s.disciplinaId)).size === 1) {
    orientacoes.push({ tipo: 'uma_materia' });
  }
  if (t.minutos < ant.minutos) orientacoes.push({ tipo: 'menos_que_anterior' });

  return {
    intervalo,
    minutos: t.minutos,
    questoes: t.questoes,
    acertos: t.acertos,
    percentualAcerto: t.percentualAcerto,
    diasComEstudo,
    anterior: { minutos: ant.minutos, questoes: ant.questoes, percentualAcerto: ant.percentualAcerto },
    porDisciplina,
    reforcar,
    revisoes,
    orientacoes: orientacoes.slice(0, MAX_ORIENTACOES),
  };
}
