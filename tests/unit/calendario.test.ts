import { describe, expect, it } from 'vitest';
import type { Fila, BlocoFila } from '@/lib/plano/fila';
import {
  gradeDoMes,
  mesValido,
  mesVizinho,
  montarCalendario,
  projetarFila,
  rotuloDoDia,
  type EntradaProjecao,
} from '@/lib/plano/calendario';

const HOJE = '2026-11-17';
const CAP = [0, 60, 60, 60, 60, 60, 0];
const ciclo: Fila = { modo: 'ciclo', itens: [{ disciplinaId: 'a', minutos: 45 }, { disciplinaId: 'b', minutos: 30 }] };

const entrada = (e: Partial<EntradaProjecao> = {}): EntradaProjecao => ({
  fila: ciclo, posicao: 0, minutosPorDia: CAP, hoje: HOJE, registradosHoje: 0, dataProva: null, ate: '2026-11-21', ...e,
});
const resumo = (m: Map<string, BlocoFila[]>) => [...m.entries()].map(([d, bs]) => [d, bs.map((b) => `${b.disciplinaId}@${b.posicao}`)]);

describe('gradeDoMes', () => {
  it('cobre de domingo a sábado', () => {
    const g = gradeDoMes('2026-11');
    expect(g).toHaveLength(35);
    expect([g[0], g[34]]).toEqual(['2026-11-01', '2026-12-05']);
    const f = gradeDoMes('2027-02');
    expect([f[0], f[f.length - 1]]).toEqual(['2027-01-31', '2027-03-06']);
    const d = gradeDoMes('2026-12');
    expect([d[0], d[d.length - 1]]).toEqual(['2026-11-29', '2027-01-02']);
  });
});

describe('mesValido / mesVizinho', () => {
  it('valida o mês', () => {
    expect(mesValido('2026-13', HOJE)).toBe('2026-11');
    expect(mesValido(undefined, HOJE)).toBe('2026-11');
    expect(mesValido('2030-01', HOJE)).toBe('2026-11');
    expect(mesValido('2026-12', HOJE)).toBe('2026-12');
  });
  it('vizinho', () => {
    expect(mesVizinho('2026-12', 1)).toBe('2027-01');
    expect(mesVizinho('2026-01', -1)).toBe('2025-12');
  });
});

describe('projetarFila', () => {
  it('ciclo em dias úteis', () => {
    expect(resumo(projetarFila(entrada()))).toEqual([
      ['2026-11-17', ['a@0']], ['2026-11-18', ['b@1']], ['2026-11-19', ['a@2']], ['2026-11-20', ['b@3']],
    ]);
  });
  it('hoje com minutos já registrados só recebe o que cabe', () => {
    const m = projetarFila(entrada({ registradosHoje: 40 }));
    expect(m.has('2026-11-17')).toBe(false);
    expect(m.get('2026-11-18')?.map((b) => b.disciplinaId)).toEqual(['a']);
    expect(m.get('2026-11-19')?.map((b) => b.disciplinaId)).toEqual(['b']);
  });
  it('hoje já passou do dia', () => {
    expect(projetarFila(entrada({ registradosHoje: 90 })).has('2026-11-17')).toBe(false);
  });
  it('bloco maior que o dia ocupa um dia sozinho', () => {
    const m = projetarFila(entrada({ fila: { modo: 'ciclo', itens: [{ disciplinaId: 'a', minutos: 120 }] }, ate: '2026-11-23' }));
    expect([...m.keys()]).toEqual(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23']);
  });
  it('para antes da data da prova e no fim da fila', () => {
    const blocos = Array.from({ length: 5 }, () => ({ disciplinaId: 'a', topicoId: null, tipo: 'estudo' as const, minutos: 60 }));
    const fila: Fila = { modo: 'prazo', blocos };
    expect([...projetarFila(entrada({ fila, dataProva: '2026-11-19' })).keys()]).toEqual(['2026-11-17', '2026-11-18']);
    expect(projetarFila(entrada({ fila, posicao: 5 })).size).toBe(0);
  });
  it('sem tempo ou sem itens: vazio', () => {
    expect(projetarFila(entrada({ minutosPorDia: [0, 0, 0, 0, 0, 0, 0] })).size).toBe(0);
    expect(projetarFila(entrada({ fila: { modo: 'ciclo', itens: [] } })).size).toBe(0);
  });
  it('bloco de 0 minuto não trava nem ocupa dia', () => {
    expect(projetarFila(entrada({ fila: { modo: 'ciclo', itens: [{ disciplinaId: 'a', minutos: 0 }] } })).size).toBe(0);
    const comZero: Fila = { modo: 'ciclo', itens: [{ disciplinaId: 'a', minutos: 0 }, { disciplinaId: 'b', minutos: 60 }] };
    expect(resumo(projetarFila(entrada({ fila: comZero, ate: '2026-11-18' })))).toEqual([['2026-11-17', ['b@1']], ['2026-11-18', ['b@3']]]);
    const prazo: Fila = {
      modo: 'prazo',
      blocos: [0, 60, 0].map((minutos) => ({ disciplinaId: 'a', topicoId: null, tipo: 'estudo' as const, minutos })),
    };
    expect(resumo(projetarFila(entrada({ fila: prazo })))).toEqual([['2026-11-17', ['a@1']]]);
  });
});

describe('montarCalendario / rotuloDoDia', () => {
  const bloco = (posicao: number, minutos: number): BlocoFila => ({ posicao, disciplinaId: 'a', topicoId: null, tipo: 'estudo', minutos });
  const projecao = new Map<string, BlocoFila[]>([['2026-11-17', [bloco(0, 45)]], ['2026-11-18', [bloco(1, 60)]]]);
  const dias = montarCalendario({
    mes: '2026-11',
    hoje: HOJE,
    sessoes: [{ data: '2026-11-16', minutos: 30 }, { data: '2026-11-16', minutos: 20 }, { data: '2026-11-17', minutos: 25 }],
    revisoes: [
      { dataRevisao: '2026-11-16', concluidaEm: null },
      { dataRevisao: '2026-11-18', concluidaEm: null },
      { dataRevisao: '2026-11-18', concluidaEm: '2026-11-18T10:00:00Z' },
    ],
    projecao,
  });
  const dia = (d: string) => dias.find((x) => x.data === d)!;

  it('monta os dias', () => {
    expect(dia('2026-11-16')).toMatchObject({ passado: true, minutosEstudados: 50, revisoesPendentes: 1, previstos: [] });
    expect(dia('2026-11-17')).toMatchObject({ ehHoje: true, passado: false, minutosEstudados: 25, previstos: [bloco(0, 45)] });
    expect(dia('2026-11-18')).toMatchObject({ revisoesPendentes: 1, revisoesFeitas: 1 });
    expect(dia('2026-12-01').doMes).toBe(false);
  });
  it('dia futuro não tem minutos estudados', () => {
    const [d] = montarCalendario({ mes: '2026-11', hoje: HOJE, sessoes: [{ data: '2026-11-20', minutos: 30 }], revisoes: [], projecao: new Map() })
      .filter((x) => x.data === '2026-11-20');
    expect(d.minutosEstudados).toBe(0);
  });
  it('rótulos', () => {
    expect(rotuloDoDia(dia('2026-11-18'))).toBe('18 de novembro: 1 h previstos, 1 revisão pendente, 1 revisão feita');
    expect(rotuloDoDia(dia('2026-11-20'))).toBe('20 de novembro: sem estudo');
  });
});
