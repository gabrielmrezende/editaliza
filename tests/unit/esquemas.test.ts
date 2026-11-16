import { describe, expect, it } from 'vitest';
import {
  EsquemaConteudoCargoIA,
  EsquemaEditalResumo,
  EsquemaEntradaCriarPlano,
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
  it('rejeita lista de disciplinas vazia', () => {
    expect(EsquemaEntradaCriarPlano.safeParse({ ...entrada, disciplinas: [] }).success).toBe(false);
  });
});
