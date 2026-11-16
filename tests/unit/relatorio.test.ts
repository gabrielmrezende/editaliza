import { describe, expect, it } from 'vitest';
import type { Revisao, Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano, MinutosPorDia, PlanoGerado } from '@/lib/dominio/tipos';
import {
  intervaloDoPeriodo,
  montarRelatorio,
  periodoAnterior,
  planejadoNoIntervalo,
} from '@/lib/acompanhamento/relatorio';

const disc = (id: string, nome: string): DisciplinaPlano => ({
  id,
  nome,
  questoes: null,
  pontos: null,
  nivel: 'basico',
  topicos: [],
});
const DISCS = [disc('d0', 'Português'), disc('d1', 'Direito')];
const MIN: MinutosPorDia = [60, 60, 60, 60, 60, 60, 60];
const CICLO: PlanoGerado = {
  modo: 'ciclo',
  ciclo: [
    { disciplinaId: 'd0', minutos: 60 },
    { disciplinaId: 'd1', minutos: 30 },
  ],
  avisos: [],
};

let n = 0;
const sessao = (p: Partial<Sessao>): Sessao => ({
  id: `s${++n}`,
  planoId: 'p1',
  data: '2026-11-16',
  disciplinaId: 'd0',
  disciplinaNome: 'Português',
  topicoId: null,
  topicoNome: null,
  minutos: 30,
  acertos: 0,
  erros: 0,
  tipo: null,
  observacao: null,
  origem: 'manual',
  criadaEm: '2026-11-16T10:00:00Z',
  ...p,
});
const revisao = (p: Partial<Revisao>): Revisao => ({
  id: `r${++n}`,
  planoId: 'p1',
  disciplinaId: 'd0',
  disciplinaNome: 'Português',
  topicoId: 't1',
  topicoNome: 'Crase',
  dataEstudo: '2026-11-10',
  dataRevisao: '2026-11-17',
  intervalo: 7,
  sessaoId: null,
  origem: 'sessao',
  concluidaEm: null,
  ...p,
});

const INT = { inicio: '2026-11-15', fim: '2026-11-21' };
const montar = (sessoes: Sessao[], revisoes: Revisao[] = [], hoje = '2026-11-18') =>
  montarRelatorio({ sessoes, revisoes, disciplinas: DISCS, gerado: CICLO, minutosPorDia: MIN, intervalo: INT, hoje });

describe('intervaloDoPeriodo', () => {
  it('semana = domingo a sábado', () => {
    expect(intervaloDoPeriodo('semana', '2026-11-18', '2026-11-01')).toEqual({ inicio: '2026-11-15', fim: '2026-11-21' });
  });
  it('semana passada', () => {
    expect(intervaloDoPeriodo('semana_passada', '2026-11-18', '2026-11-01')).toEqual({ inicio: '2026-11-08', fim: '2026-11-14' });
  });
  it('30 dias', () => {
    expect(intervaloDoPeriodo('30dias', '2026-11-18', '2026-11-01')).toEqual({ inicio: '2026-10-20', fim: '2026-11-18' });
  });
  it('plano', () => {
    expect(intervaloDoPeriodo('plano', '2026-11-18', '2026-11-01')).toEqual({ inicio: '2026-11-01', fim: '2026-11-18' });
  });
});

describe('periodoAnterior', () => {
  it('mesmo tamanho, imediatamente antes', () => {
    expect(periodoAnterior(INT)).toEqual({ inicio: '2026-11-08', fim: '2026-11-14' });
  });
});

describe('planejadoNoIntervalo', () => {
  it('prazo soma só blocos dentro do intervalo', () => {
    const g: PlanoGerado = {
      modo: 'prazo',
      inicioReserva: null,
      avisos: [],
      dias: [
        { data: '2026-11-14', blocos: [{ disciplinaId: 'd0', topicoId: null, tipo: 'estudo', minutos: 50 }] },
        {
          data: '2026-11-16',
          blocos: [
            { disciplinaId: 'd0', topicoId: null, tipo: 'estudo', minutos: 40 },
            { disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 20 },
          ],
        },
        { data: '2026-11-22', blocos: [{ disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 30 }] },
      ],
    };
    expect(planejadoNoIntervalo(g, MIN, INT)).toEqual({ d0: 40, d1: 20 });
  });
  it('ciclo distribui pela fração', () => {
    expect(planejadoNoIntervalo(CICLO, MIN, INT)).toEqual({ d0: 280, d1: 140 });
  });
});

describe('montarRelatorio', () => {
  it('totais, percentual arredondado, dias com estudo e anterior', () => {
    const r = montar([
      sessao({ data: '2026-11-16', minutos: 60, acertos: 7, erros: 3 }),
      sessao({ data: '2026-11-16', disciplinaId: 'd1', disciplinaNome: 'Direito', minutos: 30, acertos: 1, erros: 1 }),
      sessao({ data: '2026-11-17', minutos: 30, acertos: 2, erros: 0 }),
      sessao({ data: '2026-11-10', minutos: 45, acertos: 3, erros: 1 }),
    ]);
    expect(r.minutos).toBe(120);
    expect(r.questoes).toBe(14);
    expect(r.acertos).toBe(10);
    expect(r.percentualAcerto).toBe(71);
    expect(r.diasComEstudo).toBe(2);
    expect(r.anterior).toEqual({ minutos: 45, questoes: 4, percentualAcerto: 75 });
    expect(r.porDisciplina.map((d) => d.disciplinaId)).toEqual(['d0', 'd1']);
    expect(r.porDisciplina[0].fracaoEstudada).toBeCloseTo(90 / 120);
    expect(r.porDisciplina[0].fracaoPlanejada).toBeCloseTo(2 / 3);
  });

  it('sem questões o percentual é nulo e sem minutos as frações são 0', () => {
    const r = montar([]);
    expect(r.percentualAcerto).toBeNull();
    expect(r.porDisciplina.every((d) => d.fracaoEstudada === 0 && d.diasSemEstudo === null)).toBe(true);
  });

  it('diasSemEstudo usa todas as sessões; sessão de matéria fora do plano entra nos totais', () => {
    const r = montar([
      sessao({ data: '2026-10-01', disciplinaId: 'd1', disciplinaNome: 'Direito' }),
      sessao({ data: '2026-11-16', disciplinaId: 'x', disciplinaNome: 'Antiga', minutos: 20 }),
    ]);
    expect(r.porDisciplina.find((d) => d.disciplinaId === 'd1')?.diasSemEstudo).toBe(48);
    expect(r.porDisciplina).toHaveLength(2);
    expect(r.minutos).toBe(20);
  });

  it('ordena por minutos; empate pela ordem do plano', () => {
    const r = montar([sessao({ disciplinaId: 'd1', disciplinaNome: 'Direito', minutos: 10 })]);
    expect(r.porDisciplina.map((d) => d.disciplinaId)).toEqual(['d1', 'd0']);
  });

  it('reforçar: 4 questões não entra; 10 com 60% entra', () => {
    const r = montar([
      sessao({ topicoId: 'a', topicoNome: 'A', acertos: 0, erros: 4 }),
      sessao({ topicoId: 'b', topicoNome: 'B', acertos: 3, erros: 2 }),
      sessao({ topicoId: 'b', topicoNome: 'B', acertos: 3, erros: 2 }),
      sessao({ topicoId: 'c', topicoNome: 'C', acertos: 9, erros: 1 }),
    ]);
    expect(r.reforcar).toEqual([{ disciplinaNome: 'Português', topicoId: 'b', topicoNome: 'B', questoes: 10, percentual: 60 }]);
  });

  it('revisões: agendadas, concluídas e atrasadas', () => {
    const r = montar(
      [],
      [
        revisao({ dataRevisao: '2026-11-17', concluidaEm: '2026-11-17T10:00:00Z' }),
        revisao({ dataRevisao: '2026-11-17' }),
        revisao({ dataRevisao: '2026-11-20' }),
        revisao({ dataRevisao: '2026-11-10' }),
        revisao({ dataRevisao: '2026-11-05', concluidaEm: '2026-11-06T10:00:00Z' }),
      ],
    );
    expect(r.revisoes).toEqual({ agendadas: 3, concluidas: 1, atrasadas: 2 });
  });

  it('orientações: ordem de prioridade, no máximo 3', () => {
    const r = montar([], [revisao({ dataRevisao: '2026-11-10' })]);
    expect(r.orientacoes).toEqual([{ tipo: 'sem_estudo' }, { tipo: 'revisoes_atrasadas', quantidade: 1 }]);

    const r2 = montar(
      [
        sessao({ data: '2026-11-16', topicoId: 'b', topicoNome: 'B', acertos: 3, erros: 7 }),
        sessao({ data: '2026-11-08', minutos: 500 }),
      ],
      [revisao({ dataRevisao: '2026-11-10' })],
    );
    expect(r2.orientacoes).toEqual([
      { tipo: 'reforcar', topicoNome: 'B', percentual: 30, questoes: 10 },
      { tipo: 'revisoes_atrasadas', quantidade: 1 },
      { tipo: 'uma_materia' },
    ]);
  });

  it('menos que o período anterior', () => {
    const r = montar([
      sessao({ data: '2026-11-16', minutos: 30 }),
      sessao({ data: '2026-11-16', disciplinaId: 'd1', disciplinaNome: 'Direito', minutos: 30 }),
      sessao({ data: '2026-11-10', minutos: 300 }),
    ]);
    expect(r.orientacoes).toEqual([{ tipo: 'menos_que_anterior' }]);
  });
});
