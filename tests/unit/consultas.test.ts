import { describe, it, expect } from 'vitest';
import { progresso } from '@/lib/plano/consultas';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';

const disc = (id: string, topicos: string[]): DisciplinaPlano => ({
  id, nome: id, questoes: null, pontos: null, nivel: 'basico',
  topicos: topicos.map((t) => ({ id: t, nome: t })),
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
