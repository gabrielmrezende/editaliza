import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { calcularCustoCentavos, interpretarResposta, lerMensagem, montarRequisicao } from '@/lib/extracao/claude';
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

describe('lerMensagem', () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 0 };
  it('sucesso devolve dados e custo', () => {
    const msg = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":2}' }], usage };
    expect(lerMensagem(msg, Esq)).toEqual({ dados: { a: 2 }, custoCentavos: 2200 });
  });
  it.each([
    ['max_tokens', [{ type: 'text', text: '{"a":1}' }]],
    ['end_turn', [{ type: 'text', text: '{nope' }]],
    ['refusal', []],
  ])('falha (%s) carrega o custo da chamada', (stop, content) => {
    const erro = (() => {
      try {
        lerMensagem({ stop_reason: stop, content, usage }, Esq);
      } catch (e) {
        return e;
      }
    })();
    expect(erro).toBeInstanceOf(ExtracaoFalhouError);
    expect((erro as ExtracaoFalhouError).custoCentavos).toBe(2200);
  });
});

describe('montarRequisicao', () => {
  it('usa o modelo com esforco medio, fallbacks e cache no documento', () => {
    const req = montarRequisicao('file_1', 'prompt', Esq);
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.output_config?.effort).toBe('medium');
    expect(req.fallbacks).toBe('default');
    const [doc, texto] = req.messages[0].content as { type: string; cache_control?: unknown }[];
    expect(doc).toMatchObject({ type: 'document', source: { type: 'file', file_id: 'file_1' }, cache_control: { type: 'ephemeral' } });
    expect(texto).toMatchObject({ type: 'text', text: 'prompt' });
  });
});
