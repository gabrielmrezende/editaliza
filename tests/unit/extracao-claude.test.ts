import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  calcularCustoCentavos,
  ESQUEMA_SAIDA,
  escolherModelo,
  interpretarResposta,
  lerMensagem,
  montarRequisicao,
  normalizarConteudo,
  normalizarResumo,
} from '@/lib/extracao/claude';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo } from '@/lib/dominio/esquemas';
import { ExtracaoFalhouError, obterExtrator } from '@/lib/extracao';
import { PROMPT_LISTAR_CARGOS, promptExtrairConteudo } from '@/lib/extracao/prompts';

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

describe('escolherModelo', () => {
  it('ausente ou vazio = haiku (padrão)', () => {
    expect(escolherModelo(undefined)).toBe('claude-haiku-5-5');
    expect(escolherModelo('')).toBe('claude-haiku-5-5');
    expect(escolherModelo('  ')).toBe('claude-haiku-5-5');
  });
  it.each(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'])('aceita %s', (m) => {
    expect(escolherModelo(m)).toBe(m);
  });
  it('valor fora da lista dá erro claro', () => {
    expect(() => escolherModelo('gpt-5')).toThrow(/EXTRACAO_MODELO.*gpt-5/);
  });
});

describe('calcularCustoCentavos', () => {
  const M = 1_000_000;
  const u = (input_tokens: number, output_tokens: number, extra: object = {}) => ({ input_tokens, output_tokens, ...extra });
  it('0/0 = 0', () => expect(calcularCustoCentavos('claude-opus-5-5', u(0, 0))).toBe(0));
  it('opus: 1M entrada = US$4 × 550 = 2200', () => expect(calcularCustoCentavos('claude-opus-5-5', u(M, 0))).toBe(2200));
  it('opus: 1M saída = US$20 × 550 = 11000', () => expect(calcularCustoCentavos('claude-opus-5-5', u(0, M))).toBe(11000));
  it('arredonda para cima', () => expect(calcularCustoCentavos('claude-opus-5-5', u(1, 0))).toBe(1));
  it('sonnet: 1M entrada = 1100; 1M saída = 5500', () => {
    expect(calcularCustoCentavos('claude-sonnet-5-5', u(M, 0))).toBe(1100);
    expect(calcularCustoCentavos('claude-sonnet-5-5', u(0, M))).toBe(5500);
  });
  it('haiku até 100k de entrada: 0,10 / 0,50', () => {
    expect(calcularCustoCentavos('claude-haiku-5-5', u(100_000, 0))).toBe(6); // 0,01 USD × 550 = 5,5
    expect(calcularCustoCentavos('claude-haiku-5-5', u(0, M))).toBe(275);
  });
  it('haiku acima de 100k de entrada: 0,50 / 2,50 (toda a chamada)', () => {
    expect(calcularCustoCentavos('claude-haiku-5-5', u(100_001, 0))).toBe(28); // 0,0500005 × 550
    expect(calcularCustoCentavos('claude-haiku-5-5', u(M, M))).toBe(1650); // (0,5 + 2,5) × 550
  });
  it('cache: leitura 10% e escrita 125% da entrada somam', () => {
    // opus: 1M escrita = 5 USD, 1M leitura = 0,4 USD, 1M entrada = 4 USD -> 9,4 × 550 = 5170
    expect(calcularCustoCentavos('claude-opus-5-5', u(M, 0, { cache_creation_input_tokens: M, cache_read_input_tokens: M }))).toBe(5170);
    expect(calcularCustoCentavos('claude-opus-5-5', u(0, 0, { cache_creation_input_tokens: null, cache_read_input_tokens: null }))).toBe(0);
  });
  it('haiku: degrau considera cache no total de entrada', () => {
    // 50k + 60k lidos do cache = 110k de prompt -> tabela alta: 50k×0,5 + 60k×0,05 = 0,028 USD -> 15,4 -> 16
    expect(calcularCustoCentavos('claude-haiku-5-5', u(50_000, 0, { cache_read_input_tokens: 60_000 }))).toBe(16);
  });
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
  const modelo = 'claude-opus-5-5' as const;
  it('sucesso devolve dados e custo', () => {
    const msg = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":2}' }], usage };
    expect(lerMensagem(msg, Esq, modelo)).toEqual({ dados: { a: 2 }, custoCentavos: 2200 });
  });
  it.each([
    ['max_tokens', [{ type: 'text', text: '{"a":1}' }]],
    ['end_turn', [{ type: 'text', text: '{nope' }]],
    ['refusal', []],
  ])('falha (%s) carrega o custo da chamada', (stop, content) => {
    const erro = (() => {
      try {
        lerMensagem({ stop_reason: stop, content, usage }, Esq, modelo);
      } catch (e) {
        return e;
      }
    })();
    expect(erro).toBeInstanceOf(ExtracaoFalhouError);
    expect((erro as ExtracaoFalhouError).custoCentavos).toBe(2200);
  });
});

describe('montarRequisicao', () => {
  it('opus: esforço médio, fallbacks, beta e cache no documento', () => {
    const req = montarRequisicao('claude-opus-5-5', 'file_1', 'prompt');
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.output_config?.effort).toBe('medium');
    expect(req).toMatchObject({ fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    const [doc, texto] = req.messages[0].content as { type: string; cache_control?: unknown }[];
    expect(doc).toMatchObject({ type: 'document', source: { type: 'file', file_id: 'file_1' }, cache_control: { type: 'ephemeral' } });
    expect(texto).toMatchObject({ type: 'text', text: 'prompt' });
  });
  it('sonnet também leva fallbacks e beta', () => {
    const req = montarRequisicao('claude-sonnet-5-5', 'f', 'p');
    expect(req).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
  });
  it('haiku não leva fallbacks nem betas, mas mantém esforço médio e cache', () => {
    const req = montarRequisicao('claude-haiku-5-5', 'f', 'p');
    expect(req.model).toBe('claude-haiku-5-5');
    expect(req).not.toHaveProperty('fallbacks');
    expect(req).not.toHaveProperty('betas');
    expect(req.output_config?.effort).toBe('medium');
    const [doc] = req.messages[0].content as { cache_control?: unknown }[];
    expect(doc.cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('prefixo cacheável igual entre as etapas', () => {
  const prefixo = (req: ReturnType<typeof montarRequisicao>) => {
    const { messages, ...resto } = req;
    const [doc] = messages[0].content;
    return { resto, doc, papel: messages[0].role, qtd: messages[0].content.length };
  };
  it.each(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'] as const)(
    '%s: listar e extrair (qualquer cargo) só diferem no texto final',
    (modelo) => {
      const listar = montarRequisicao(modelo, 'file_1', PROMPT_LISTAR_CARGOS);
      const extrairA = montarRequisicao(modelo, 'file_1', promptExtrairConteudo('Analista'));
      const extrairB = montarRequisicao(modelo, 'file_1', promptExtrairConteudo('Técnico'));
      expect(JSON.stringify(prefixo(extrairA))).toBe(JSON.stringify(prefixo(listar)));
      expect(JSON.stringify(prefixo(extrairB))).toBe(JSON.stringify(prefixo(listar)));
      const textos = [listar, extrairA, extrairB].map((r) => (r.messages[0].content[1] as { text: string }).text);
      expect(new Set(textos).size).toBe(3);
      expect(listar).not.toHaveProperty('system');
      expect(prefixo(listar).doc).toMatchObject({ type: 'document', cache_control: { type: 'ephemeral' } });
    },
  );
  it('o esquema de saída é o mesmo e aceita o resultado de cada etapa', () => {
    expect(ESQUEMA_SAIDA).toBeDefined();
    const resumo = { orgao: 'X', banca: null, ano: null, dataProva: null, cargos: [{ nome: 'A' }] };
    const conteudo = { disciplinas: [], tipoProva: 'mista', pesosInformados: false };
    expect(ESQUEMA_SAIDA.safeParse({ resumo, conteudo: null }).success).toBe(true);
    expect(ESQUEMA_SAIDA.safeParse({ resumo: null, conteudo }).success).toBe(true);
  });
});

describe('normalizar campos opcionais da IA', () => {
  it('resumo: data impossivel, ano nao inteiro e orgao vazio viram padrao em vez de falhar', () => {
    const r = normalizarResumo({
      orgao: '  ',
      banca: '',
      ano: 2026.5,
      dataProva: '2026-02-30',
      cargos: [{ nome: 'Analista' }, { nome: ' ' }],
    });
    expect(r).toEqual({ orgao: 'Órgão não identificado', banca: null, ano: null, dataProva: null, cargos: [{ nome: 'Analista' }] });
    expect(EsquemaEditalResumo.safeParse(r).success).toBe(true);
    expect(normalizarResumo({ orgao: 'TRF', banca: 'FCC', ano: 2026, dataProva: '2026-12-06', cargos: [] })).toEqual({
      orgao: 'TRF', banca: 'FCC', ano: 2026, dataProva: '2026-12-06', cargos: [],
    });
  });
  it('conteudo: questoes nao inteiras ou negativas e pontos negativos viram null', () => {
    const c = normalizarConteudo({
      tipoProva: 'mista',
      pesosInformados: true,
      disciplinas: [
        { nome: 'Português', questoes: 12.5, pontos: -1, topicos: ['Crase'] },
        { nome: 'Direito', questoes: -2, pontos: 1.5, topicos: ['Atos'] },
        { nome: 'Lógica', questoes: 10, pontos: null, topicos: [] },
      ],
    });
    expect(c.disciplinas.map((d) => [d.questoes, d.pontos])).toEqual([[null, null], [null, 1.5], [10, null]]);
    expect(EsquemaConteudoCargoIA.safeParse(c).success).toBe(true);
  });
});
