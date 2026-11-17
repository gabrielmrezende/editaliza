import { describe, expect, it } from 'vitest';
import { associarSessoes, type BlocoRapido } from '@/components/plano/useRegistroRapido';

const bloco = (chave: string, disciplinaId: string, topicoId: string): BlocoRapido => ({
  chave,
  disciplinaId,
  topicoId,
  nome: topicoId,
  minutos: 60,
});

describe('associarSessoes', () => {
  it('cada bloco usa a primeira sessão ainda livre da mesma matéria/tópico', () => {
    const blocos = [bloco('0', 'd0', 'd0-t0'), bloco('1', 'd0', 'd0-t0'), bloco('2', 'd1', 'd1-t0')];
    const sessoes = [
      { id: 's1', disciplinaId: 'd0', topicoId: 'd0-t0' },
      { id: 's2', disciplinaId: 'd1', topicoId: 'd1-t0' },
    ];
    expect([...associarSessoes(blocos, sessoes)]).toEqual([
      ['0', 's1'],
      ['2', 's2'],
    ]);
  });

  it('sessão de outro tópico ou sem tópico não marca o bloco', () => {
    const sessoes = [
      { id: 's1', disciplinaId: 'd0', topicoId: 'd0-t1' },
      { id: 's2', disciplinaId: 'd0', topicoId: null },
    ];
    expect(associarSessoes([bloco('0', 'd0', 'd0-t0')], sessoes).size).toBe(0);
  });
});
