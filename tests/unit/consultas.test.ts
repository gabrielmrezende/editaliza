import { describe, it, expect } from 'vitest';
import { tarefasDoDia, semana, progresso } from '@/lib/plano/consultas';
import type { PlanoGerado, DisciplinaPlano } from '@/lib/dominio/tipos';

const prazo: PlanoGerado = {
  modo: 'prazo',
  inicioReserva: null,
  avisos: [],
  dias: [
    { data: '2026-11-16', blocos: [{ disciplinaId: 'd1', topicoId: 't1', tipo: 'estudo', minutos: 60 }] },
    { data: '2026-11-17', blocos: [] },
    { data: '2026-11-19', blocos: [{ disciplinaId: 'd2', topicoId: 't3', tipo: 'simulado', minutos: 90 }] },
  ],
};
const ciclo: PlanoGerado = {
  modo: 'ciclo',
  avisos: [],
  ciclo: [{ disciplinaId: 'd1', minutos: 60 }, { disciplinaId: 'd2', minutos: 45 }],
};
const disc = (id: string, topicos: string[]): DisciplinaPlano => ({
  id, nome: id, questoes: null, pontos: null, nivel: 'basico',
  topicos: topicos.map((t) => ({ id: t, nome: t })),
});

describe('tarefasDoDia', () => {
  it('devolve blocos do dia', () => {
    expect(tarefasDoDia(prazo, '2026-11-16')).toHaveLength(1);
  });
  it('dia sem estudo e data fora do plano -> []', () => {
    expect(tarefasDoDia(prazo, '2026-11-17')).toEqual([]);
    expect(tarefasDoDia(prazo, '2030-01-01')).toEqual([]);
  });
  it('ciclo: item na posicao, com modulo', () => {
    expect(tarefasDoDia(ciclo, '2026-11-16')).toEqual([{ disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 60 }]);
    expect(tarefasDoDia(ciclo, 'x', 1)[0].disciplinaId).toBe('d2');
    expect(tarefasDoDia(ciclo, 'x', 3)[0].disciplinaId).toBe('d2');
  });
  it('ciclo: vazio, negativo e nao inteiro', () => {
    expect(tarefasDoDia({ modo: 'ciclo', ciclo: [], avisos: [] }, 'x', 2)).toEqual([]);
    expect(tarefasDoDia(ciclo, 'x', -1)[0].disciplinaId).toBe('d1');
    expect(tarefasDoDia(ciclo, 'x', 1.5)[0].disciplinaId).toBe('d1');
  });
});

describe('semana', () => {
  it('7 dias, preenchendo ausentes', () => {
    const s = semana(prazo, '2026-11-16');
    expect(s.map((d) => d.data)).toEqual(['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22']);
    expect(s[0].blocos).toHaveLength(1);
    expect(s[2].blocos).toEqual([]);
    expect(s[3].blocos).toHaveLength(1);
  });
  it('cruza mes/ano em UTC', () => {
    expect(semana(prazo, '2026-12-29').map((d) => d.data)[6]).toBe('2027-01-04');
  });
  it('ciclo -> 7 dias vazios', () => {
    const s = semana(ciclo, '2026-11-16');
    expect(s).toHaveLength(7);
    expect(s.every((d) => d.blocos.length === 0)).toBe(true);
  });
});

describe('progresso', () => {
  const ds = [disc('d1', ['t1', 't2']), disc('d2', ['t3']), disc('d3', [])];
  it('conta, inclui disciplinas zeradas, ignora inexistentes e duplicados', () => {
    const p = progresso(ds, ['t1', 't1', 't3', 'fantasma']);
    expect(p.total).toBe(3);
    expect(p.concluidos).toBe(2);
    expect(p.porDisciplina).toEqual({
      d1: { total: 2, concluidos: 1 },
      d2: { total: 1, concluidos: 1 },
      d3: { total: 0, concluidos: 0 },
    });
  });
});
