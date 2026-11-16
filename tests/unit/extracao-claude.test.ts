import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { calcularCustoCentavos, interpretarResposta } from '@/lib/extracao/claude';
import { ExtracaoFalhouError, obterExtrator } from '@/lib/extracao';

const Esq = z.object({ a: z.number() });

describe('interpretarResposta', () => {
  it('devolve o valor validado em end_turn', () => {
    expect(interpretarResposta('end_turn', '{"a":1}', Esq)).toEqual({ a: 1 });
  });
  it.each(['refusal', 'max_tokens', 'pause_turn', null])('stop_reason %s falha', (sr) => {
    expect(() => interpretarResposta(sr, '{"a":1}', Esq)).toThrow(ExtracaoFalhouError);
  });
  it('texto vazio falha', () => {
    expect(() => interpretarResposta('end_turn', '  ', Esq)).toThrow(ExtracaoFalhouError);
  });
  it('JSON malformado falha com cause', () => {
    try {
      interpretarResposta('end_turn', '{nope', Esq);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExtracaoFalhouError);
      expect((e as Error).cause).toBeInstanceOf(SyntaxError);
    }
  });
  it('schema inválido falha sem vazar detalhes do zod', () => {
    try {
      interpretarResposta('end_turn', '{"a":"x"}', Esq);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ExtracaoFalhouError);
      expect((e as Error).message).not.toMatch(/expected|invalid/i);
      expect((e as Error).cause).toBeInstanceOf(z.ZodError);
    }
  });
});

describe('calcularCustoCentavos', () => {
  it('0/0 = 0', () => expect(calcularCustoCentavos(0, 0)).toBe(0));
  it('1M entrada = US$4 × 550 = 2200', () => expect(calcularCustoCentavos(1_000_000, 0)).toBe(2200));
  it('1M saída = US$20 × 550 = 11000', () => expect(calcularCustoCentavos(0, 1_000_000)).toBe(11000));
  it('arredonda para cima', () => expect(calcularCustoCentavos(1, 0)).toBe(1));
});

describe('obterExtrator em produção', () => {
  it('recusa EXTRACAO_MODO=fake', () => {
    const ant = { m: process.env.EXTRACAO_MODO, n: process.env.NODE_ENV };
    process.env.EXTRACAO_MODO = 'fake';
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      expect(() => obterExtrator()).toThrow(/produção/);
    } finally {
      if (ant.m === undefined) delete process.env.EXTRACAO_MODO; else process.env.EXTRACAO_MODO = ant.m;
      (process.env as Record<string, string>).NODE_ENV = ant.n as string;
    }
  });
});
