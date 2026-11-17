import { describe, expect, it } from 'vitest';
import type { DisciplinaPlano, ItemCiclo, PlanoGerado } from '@/lib/dominio/tipos';
import {
  QUANTIDADE_PROXIMOS,
  blocoDaFila,
  converterPosicaoFila,
  montarFila,
  numeracao,
  proximosBlocos,
  rotuloDoBloco,
  topicoDoBloco,
  topicoDoCiclo,
  totalDaFila,
  ultimoBlocoDoTopico,
  type Fila,
} from '@/lib/plano/fila';

const prazo: PlanoGerado = {
  modo: 'prazo',
  dias: [
    {
      data: '2026-11-16',
      blocos: [
        { disciplinaId: 'd0', topicoId: 'd0-t0', tipo: 'estudo', minutos: 60 },
        { disciplinaId: 'd1', topicoId: 'd1-t0', tipo: 'estudo', minutos: 45 },
      ],
    },
    { data: '2026-11-17', blocos: [] },
    { data: '2026-11-18', blocos: [{ disciplinaId: 'd0', topicoId: null, tipo: 'simulado', minutos: 60 }] },
  ],
  inicioReserva: null,
  avisos: [],
};

const itensCiclo: ItemCiclo[] = [
  { disciplinaId: 'd0', minutos: 90 },
  { disciplinaId: 'd1', minutos: 60 },
];
const ciclo: PlanoGerado = { modo: 'ciclo', ciclo: itensCiclo, avisos: [] };

const disciplinas: DisciplinaPlano[] = [
  { id: 'd0', nome: 'D0', questoes: null, pontos: null, nivel: 'basico', topicos: [{ id: 't0', nome: 'T0' }, { id: 't1', nome: 'T1' }] },
];

function filaPrazoCom(n: number): Fila {
  return { modo: 'prazo', blocos: Array.from({ length: n }, () => ({ disciplinaId: 'd0', topicoId: 't0', tipo: 'estudo' as const, minutos: 60 })) };
}

describe('fila', () => {
  it('QUANTIDADE_PROXIMOS é 12', () => {
    expect(QUANTIDADE_PROXIMOS).toBe(12);
  });

  it('montarFila prazo achata na ordem das datas', () => {
    const fila = montarFila(prazo, null);
    expect(fila.modo).toBe('prazo');
    if (fila.modo !== 'prazo') return;
    expect(fila.blocos.map((b) => b.topicoId ?? b.tipo)).toEqual(['d0-t0', 'd1-t0', 'simulado']);
    const desde = montarFila(prazo, '2026-11-17');
    expect(desde).toEqual({ modo: 'prazo', blocos: [{ disciplinaId: 'd0', topicoId: null, tipo: 'simulado', minutos: 60 }] });
  });

  it('montarFila ciclo', () => {
    expect(montarFila(ciclo, '2026-11-17')).toEqual({ modo: 'ciclo', itens: itensCiclo });
  });

  it('totalDaFila', () => {
    expect(totalDaFila(montarFila(prazo, null))).toBe(3);
    expect(totalDaFila(montarFila(ciclo, null))).toBeNull();
  });

  it('blocoDaFila', () => {
    const fp = montarFila(prazo, null);
    expect(blocoDaFila(fp, 2)).toEqual({ posicao: 2, disciplinaId: 'd0', topicoId: null, tipo: 'simulado', minutos: 60 });
    expect(blocoDaFila(fp, 3)).toBeNull();
    const fc = montarFila(ciclo, null);
    expect(blocoDaFila(fc, 5)).toEqual({ posicao: 5, disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 60 });
    expect(blocoDaFila({ modo: 'ciclo', itens: [] }, 0)).toBeNull();
  });

  it('numeracao e rotuloDoBloco', () => {
    const f48 = filaPrazoCom(48);
    expect(numeracao(f48, 4)).toEqual({ numero: 5, total: 48, volta: null });
    expect(rotuloDoBloco(f48, 4)).toBe('Bloco 5 de 48');
    const fc = montarFila(ciclo, null);
    expect(numeracao(fc, 5)).toEqual({ numero: 2, total: null, volta: 3 });
    expect(rotuloDoBloco(fc, 5)).toBe('Bloco 2 · volta 3');
  });

  it('proximosBlocos', () => {
    expect(proximosBlocos(montarFila(prazo, null), 0, 12).map((b) => b.posicao)).toEqual([1, 2]);
    expect(proximosBlocos(montarFila(ciclo, null), 1, 3).map((b) => `${b.disciplinaId}@${b.posicao}`)).toEqual(['d0@2', 'd1@3', 'd0@4']);
  });

  it('topicoDoCiclo', () => {
    expect(topicoDoCiclo(disciplinas[0], new Set(['t0']))).toBe('t1');
    expect(topicoDoCiclo(disciplinas[0], new Set(['t0', 't1']))).toBeNull();
    expect(topicoDoCiclo(undefined, new Set())).toBeNull();
  });

  it('topicoDoBloco', () => {
    const fp: Fila = { modo: 'prazo', blocos: [{ disciplinaId: 'd0', topicoId: 't0', tipo: 'estudo', minutos: 60 }] };
    const bp = blocoDaFila(fp, 0)!;
    expect(topicoDoBloco(bp, fp, disciplinas, new Set(['t0']))).toBe('t0');
    const fc: Fila = { modo: 'ciclo', itens: [{ disciplinaId: 'd0', minutos: 90 }] };
    const bc = blocoDaFila(fc, 0)!;
    expect(topicoDoBloco(bc, fc, disciplinas, new Set(['t0']))).toBe('t1');
  });

  it('ultimoBlocoDoTopico: só o último bloco do tópico daqui em diante, no prazo', () => {
    const f: Fila = {
      modo: 'prazo',
      blocos: [
        { disciplinaId: 'd0', topicoId: 't0', tipo: 'estudo', minutos: 60 },
        { disciplinaId: 'd1', topicoId: 'u0', tipo: 'estudo', minutos: 60 },
        { disciplinaId: 'd0', topicoId: 't0', tipo: 'estudo', minutos: 30 },
        { disciplinaId: 'd0', topicoId: null, tipo: 'simulado', minutos: 60 },
      ],
    };
    expect([0, 1, 2, 3, 4].map((p) => ultimoBlocoDoTopico(f, p))).toEqual([false, true, true, false, false]);
    expect(ultimoBlocoDoTopico(montarFila(ciclo, null), 0)).toBe(false);
  });

  it('converterPosicaoFila', () => {
    const a = { disciplinaId: 'a', minutos: 60 };
    const b = { disciplinaId: 'b', minutos: 60 };
    const c = { disciplinaId: 'c', minutos: 60 };
    expect(converterPosicaoFila([a, b, c], 7, [c, b])).toBe(5);
    expect(converterPosicaoFila([a, b, c], 1, [a, c])).toBe(1);
    expect(converterPosicaoFila([a, b, c], 4, [])).toBe(0);
    expect(converterPosicaoFila([], 4, [a])).toBe(0);
  });
});
