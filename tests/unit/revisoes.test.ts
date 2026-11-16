import { describe, expect, it } from 'vitest';
import type { Revisao } from '@/lib/dominio/acompanhamento';
import { agruparAgenda, diasDeAtraso, revisoesParaCriar } from '@/lib/acompanhamento/revisoes';

describe('revisoesParaCriar', () => {
  it('gera uma revisão por intervalo', () => {
    const r = revisoesParaCriar('t1', '2026-11-16', [1, 7, 21, 30], []);
    expect(r.map((x) => x.dataRevisao)).toEqual(['2026-11-17', '2026-11-23', '2026-12-07', '2026-12-16']);
    expect(r.map((x) => x.intervalo)).toEqual([1, 7, 21, 30]);
  });

  it('não duplica pendente do mesmo tópico e intervalo', () => {
    const r = revisoesParaCriar('t1', '2026-11-16', [1, 7, 21, 30], [{ topicoId: 't1', intervalo: 7 }]);
    expect(r.map((x) => x.intervalo)).toEqual([1, 21, 30]);
  });

  it('pendente de outro tópico não interfere', () => {
    const r = revisoesParaCriar('t1', '2026-11-16', [1, 7], [{ topicoId: 't2', intervalo: 7 }]);
    expect(r.map((x) => x.intervalo)).toEqual([1, 7]);
  });
});

let n = 0;
function rev(dataRevisao: string, extra: Partial<Revisao> = {}): Revisao {
  n += 1;
  return {
    id: `r${n}`, planoId: 'p', disciplinaId: 'd', disciplinaNome: 'Direito', topicoId: 't', topicoNome: 'Tópico',
    dataEstudo: '2026-11-01', dataRevisao, intervalo: 7, sessaoId: null, origem: 'sessao', concluidaEm: null, ...extra,
  };
}

describe('agruparAgenda', () => {
  const hoje = '2026-11-16';

  it('classifica por data', () => {
    const a = agruparAgenda(
      [rev('2026-11-14'), rev('2026-11-16'), rev('2026-11-23'), rev('2026-11-24')],
      hoje,
    );
    expect(a.atrasadas.map((r) => r.dataRevisao)).toEqual(['2026-11-14']);
    expect(a.hoje.map((r) => r.dataRevisao)).toEqual(['2026-11-16']);
    expect(a.semana.map((r) => r.dataRevisao)).toEqual(['2026-11-23']);
    expect(a.proximas.map((r) => r.dataRevisao)).toEqual(['2026-11-24']);
    expect(diasDeAtraso(a.atrasadas[0], hoje)).toBe(2);
  });

  it('concluídas: até 30 dias, mais recente primeiro', () => {
    const a = agruparAgenda(
      [
        rev('2026-11-01', { concluidaEm: '2026-11-06T15:00:00Z' }),
        rev('2026-11-01', { concluidaEm: '2026-11-14T15:00:00Z' }),
        rev('2026-10-01', { concluidaEm: '2026-10-16T15:00:00Z' }),
      ],
      hoje,
    );
    expect(a.concluidas.map((r) => r.concluidaEm)).toEqual(['2026-11-14T15:00:00Z', '2026-11-06T15:00:00Z']);
    expect(a.atrasadas).toEqual([]);
  });

  it('ordena por data e depois por disciplina', () => {
    const a = agruparAgenda(
      [
        rev('2026-11-16', { disciplinaNome: 'Português' }),
        rev('2026-11-15', { disciplinaNome: 'Z' }),
        rev('2026-11-15', { disciplinaNome: 'Administrativo' }),
        rev('2026-11-14', { disciplinaNome: 'Y' }),
      ],
      hoje,
    );
    expect(a.atrasadas.map((r) => r.disciplinaNome)).toEqual(['Y', 'Administrativo', 'Z']);
  });
});
