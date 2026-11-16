import { describe, expect, it } from 'vitest';
import type { BlocoEstudo, DisciplinaPlano } from '@/lib/dominio/tipos';
import { converterPosicao, minutosRegistradosNoCiclo, posicaoEmMinutos, topicosDosBlocos } from '@/lib/planos/ciclo';

describe('minutosRegistradosNoCiclo', () => {
  it('ignora sessões de hoje e de antes de desde', () => {
    const s = [
      { data: '2026-11-09', minutos: 100 },
      { data: '2026-11-10', minutos: 30 },
      { data: '2026-11-15', minutos: 20 },
      { data: '2026-11-16', minutos: 50 },
    ];
    expect(minutosRegistradosNoCiclo(s, '2026-11-10', '2026-11-16')).toBe(50);
  });
});

describe('posicaoEmMinutos', () => {
  it('soma itens antes do início, minutos do início e registrados', () => {
    const ciclo = [{ disciplinaId: 'a', minutos: 60 }, { disciplinaId: 'b', minutos: 30 }];
    expect(posicaoEmMinutos(ciclo, { indice: 1, minutos: 10 }, 25)).toBe(95);
    expect(posicaoEmMinutos(ciclo, null, 25)).toBe(25);
  });
});

describe('converterPosicao', () => {
  const antigo = [{ disciplinaId: 'a', minutos: 60 }, { disciplinaId: 'b', minutos: 40 }];
  it('mantém matéria e fração', () => {
    expect(converterPosicao(antigo, 80, [{ disciplinaId: 'a', minutos: 90 }, { disciplinaId: 'b', minutos: 20 }])).toEqual({ indice: 1, minutos: 10 });
  });
  it('matéria removida: próximo item existente com 0', () => {
    expect(converterPosicao(antigo, 80, [{ disciplinaId: 'a', minutos: 90 }])).toEqual({ indice: 0, minutos: 0 });
    expect(converterPosicao(antigo, 10, [{ disciplinaId: 'b', minutos: 50 }])).toEqual({ indice: 0, minutos: 0 });
  });
  it('ciclo novo vazio', () => {
    expect(converterPosicao(antigo, 80, [])).toEqual({ indice: 0, minutos: 0 });
  });
});

describe('topicosDosBlocos', () => {
  const d = (id: string): DisciplinaPlano => ({
    id, nome: id, questoes: null, pontos: null, nivel: 'basico',
    topicos: ['1', '2', '3'].map((n) => ({ id: `${id}${n}`, nome: n })),
  });
  const est = (disciplinaId: string, topicoId: string | null = null): BlocoEstudo => ({ disciplinaId, topicoId, tipo: 'estudo', minutos: 30 });

  it('dois blocos da mesma matéria recebem tópicos pendentes diferentes', () => {
    expect(topicosDosBlocos([est('a'), est('b'), est('a')], [d('a'), d('b')], [], '2026-11-16')).toEqual(['a1', 'b1', 'a2']);
  });
  it('tópico concluído hoje fica no primeiro bloco', () => {
    const c = [{ topicoId: 'a2', dia: '2026-11-16' }];
    expect(topicosDosBlocos([est('a'), est('a')], [d('a')], c, '2026-11-16')).toEqual(['a2', 'a1']);
  });
  it('mantém topicoId existente e devolve null para outros tipos', () => {
    const rev: BlocoEstudo = { disciplinaId: 'a', topicoId: null, tipo: 'revisao_geral', minutos: 20 };
    expect(topicosDosBlocos([est('a', 'a3'), rev], [d('a')], [], '2026-11-16')).toEqual(['a3', null]);
  });
});
