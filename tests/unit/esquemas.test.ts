import { describe, expect, it } from 'vitest';
import {
  EsquemaConcluirBloco,
  EsquemaConteudoCargoIA,
  EsquemaEdicaoSessao,
  EsquemaEditalResumo,
  EsquemaEntradaCriarPlano,
  EsquemaNovaSessao,
  EsquemaVoltarBloco,
  atribuirIds,
} from '@/lib/dominio/esquemas';

const uuid = '123e4567-e89b-42d3-a456-426614174000';
const disc = {
  id: 'd0',
  nome: 'Português',
  questoes: 10,
  pontos: null,
  nivel: 'basico' as const,
  topicos: [{ id: 'd0-t0', nome: 'Crase' }],
};
const entrada = {
  editalId: uuid,
  cargoId: uuid,
  dataProva: '2027-03-01',
  minutosPorDia: [0, 60, 60, 60, 60, 60, 0],
  disciplinas: [disc],
};

describe('atribuirIds', () => {
  it('gera ids estáveis d{i} e d{i}-t{j}', () => {
    const r = atribuirIds({
      tipoProva: 'mista',
      pesosInformados: true,
      disciplinas: [
        { nome: 'A', questoes: 5, pontos: null, topicos: ['x', 'y'] },
        { nome: 'B', questoes: null, pontos: 2, topicos: ['z'] },
      ],
    });
    expect(r.tipoProva).toBe('mista');
    expect(r.pesosInformados).toBe(true);
    expect(r.disciplinas[0].id).toBe('d0');
    expect(r.disciplinas[0].topicos.map((t) => t.id)).toEqual(['d0-t0', 'd0-t1']);
    expect(r.disciplinas[1].id).toBe('d1');
    expect(r.disciplinas[1].topicos[0]).toEqual({ id: 'd1-t0', nome: 'z' });
  });
});

describe('EsquemaConteudoCargoIA', () => {
  const base = { tipoProva: 'mista', pesosInformados: false };
  it('rejeita questoes negativas', () => {
    const r = EsquemaConteudoCargoIA.safeParse({
      ...base,
      disciplinas: [{ nome: 'A', questoes: -1, pontos: null, topicos: [] }],
    });
    expect(r.success).toBe(false);
  });
  it('aceita nulos', () => {
    const r = EsquemaConteudoCargoIA.safeParse({
      ...base,
      disciplinas: [{ nome: 'A', questoes: null, pontos: null, topicos: ['t'] }],
    });
    expect(r.success).toBe(true);
  });
});

describe('EsquemaEditalResumo', () => {
  it('valida data ISO e rejeita formato inválido', () => {
    const ok = { orgao: 'X', banca: null, ano: 2026, dataProva: '2026-12-01', cargos: [{ nome: 'C' }] };
    expect(EsquemaEditalResumo.safeParse(ok).success).toBe(true);
    expect(EsquemaEditalResumo.safeParse({ ...ok, dataProva: '01/12/2026' }).success).toBe(false);
  });
});

describe('EsquemaEntradaCriarPlano', () => {
  it('aceita entrada válida', () => {
    expect(EsquemaEntradaCriarPlano.safeParse(entrada).success).toBe(true);
  });
  it('rejeita minutosPorDia com 6 itens', () => {
    expect(EsquemaEntradaCriarPlano.safeParse({ ...entrada, minutosPorDia: [0, 1, 2, 3, 4, 5] }).success).toBe(false);
  });
  it('rejeita minuto > 1440', () => {
    expect(
      EsquemaEntradaCriarPlano.safeParse({ ...entrada, minutosPorDia: [0, 0, 0, 0, 0, 0, 1441] }).success,
    ).toBe(false);
  });
  it('rejeita data impossível', () => {
    for (const d of ['2026-02-30', '2026-13-45', '0000-00-00']) {
      expect(EsquemaEntradaCriarPlano.safeParse({ ...entrada, dataProva: d }).success).toBe(false);
      expect(
        EsquemaEditalResumo.safeParse({ orgao: 'X', banca: null, ano: null, dataProva: d, cargos: [] }).success,
      ).toBe(false);
    }
  });
  it('rejeita plano sem nenhum tópico', () => {
    const r = EsquemaEntradaCriarPlano.safeParse({ ...entrada, disciplinas: [{ ...disc, topicos: [] }] });
    expect(r.success).toBe(false);
  });
  it('rejeita lista de disciplinas vazia', () => {
    expect(EsquemaEntradaCriarPlano.safeParse({ ...entrada, disciplinas: [] }).success).toBe(false);
  });
});

describe('EsquemaNovaSessao', () => {
  const base = {
    planoId: uuid, data: '2026-11-16', disciplinaId: 'd0', topicoId: 'd0-t0', minutos: 30, tipo: null,
    observacao: null, origem: 'manual' as const,
  };

  it('aplica padrões', () => {
    const r = EsquemaNovaSessao.parse(base);
    expect(r).toMatchObject({ acertos: 0, erros: 0, intervalos: [], concluir: false });
  });

  it('exige tempo ou questões', () => {
    const r = EsquemaNovaSessao.safeParse({ ...base, minutos: 0 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('Informe o tempo ou as questões.');
    expect(EsquemaNovaSessao.safeParse({ ...base, minutos: 0, acertos: 3 }).success).toBe(true);
  });

  it('rejeita intervalo inválido ou repetido', () => {
    expect(EsquemaNovaSessao.safeParse({ ...base, intervalos: [2] }).success).toBe(false);
    expect(EsquemaNovaSessao.safeParse({ ...base, intervalos: [1, 1] }).success).toBe(false);
    expect(EsquemaNovaSessao.safeParse({ ...base, intervalos: [1, 7] }).success).toBe(true);
  });

  it('intervalos e concluir exigem tópico', () => {
    expect(EsquemaNovaSessao.safeParse({ ...base, topicoId: null, intervalos: [1] }).success).toBe(false);
    expect(EsquemaNovaSessao.safeParse({ ...base, topicoId: null, concluir: true }).success).toBe(false);
    expect(EsquemaNovaSessao.safeParse({ ...base, topicoId: null }).success).toBe(true);
  });

  it('observação em branco vira null', () => {
    expect(EsquemaNovaSessao.parse({ ...base, observacao: '   ' }).observacao).toBeNull();
    expect(EsquemaNovaSessao.parse({ ...base, observacao: ' oi ' }).observacao).toBe('oi');
  });
});

describe('EsquemaEdicaoSessao', () => {
  it('exige ao menos um campo', () => {
    expect(EsquemaEdicaoSessao.safeParse({}).success).toBe(false);
    expect(EsquemaEdicaoSessao.safeParse({ minutos: 10 }).success).toBe(true);
  });
});

describe('EsquemaConcluirBloco', () => {
  const base = {
    posicaoEsperada: 0,
    ajustadoLido: null,
    disciplinaId: 'd0',
    topicoId: 'd0-t0',
    minutos: 50,
    origem: 'cronometro' as const,
  };

  it('aplica padrões', () => {
    expect(EsquemaConcluirBloco.parse(base)).toEqual({
      ...base, acertos: 0, erros: 0, concluirTopico: false, avancar: true,
    });
  });

  it('exige tempo ou questões', () => {
    const r = EsquemaConcluirBloco.safeParse({ ...base, minutos: 0 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('Informe o tempo ou as questões.');
    expect(EsquemaConcluirBloco.safeParse({ ...base, minutos: 0, erros: 2 }).success).toBe(true);
  });

  it('rejeita posição negativa, minutos fora do limite e origem manual', () => {
    expect(EsquemaConcluirBloco.safeParse({ ...base, posicaoEsperada: -1 }).success).toBe(false);
    expect(EsquemaConcluirBloco.safeParse({ ...base, posicaoEsperada: 1.5 }).success).toBe(false);
    expect(EsquemaConcluirBloco.safeParse({ ...base, minutos: 1441 }).success).toBe(false);
    expect(EsquemaConcluirBloco.safeParse({ ...base, acertos: 10001 }).success).toBe(false);
    expect(EsquemaConcluirBloco.safeParse({ ...base, origem: 'manual' }).success).toBe(false);
    expect(EsquemaConcluirBloco.safeParse({ ...base, origem: 'rapido' }).success).toBe(true);
  });

  it('exige a fila lida e o bloco mostrado (tópico pode ser nulo)', () => {
    expect(EsquemaConcluirBloco.safeParse({ ...base, topicoId: null }).success).toBe(true);
    expect(EsquemaConcluirBloco.safeParse({ ...base, ajustadoLido: '2026-11-17T10:00:00.5+00:00' }).success).toBe(true);
    for (const chave of ['ajustadoLido', 'disciplinaId', 'topicoId']) {
      const sem = Object.fromEntries(Object.entries(base).filter(([c]) => c !== chave));
      expect(EsquemaConcluirBloco.safeParse(sem).success).toBe(false);
    }
  });
});

describe('EsquemaVoltarBloco', () => {
  it('exige posição inteira >= 0 e o ajustado_em lido', () => {
    expect(EsquemaVoltarBloco.parse({ posicaoEsperada: 3, ajustadoLido: null })).toEqual({
      posicaoEsperada: 3,
      ajustadoLido: null,
    });
    expect(EsquemaVoltarBloco.safeParse({ posicaoEsperada: -1, ajustadoLido: null }).success).toBe(false);
    expect(EsquemaVoltarBloco.safeParse({ posicaoEsperada: 3 }).success).toBe(false);
    expect(EsquemaVoltarBloco.safeParse({}).success).toBe(false);
  });
});
