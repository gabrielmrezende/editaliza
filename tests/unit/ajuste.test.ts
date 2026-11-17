import { describe, expect, it } from 'vitest';
import { ajustarPlano, ajusteVencido, calcularMultiplicadores, type EntradaAjuste } from '@/lib/plano/ajuste';
import { gerarPlano } from '@/lib/plano/gerar';
import { somarDias } from '@/lib/datas';
import type { DisciplinaPlano, MinutosPorDia, PlanoGerado } from '@/lib/dominio/tipos';

const HOJE = '2026-11-16'; // segunda-feira
const AMANHA = somarDias(HOJE, 1);
const MPD: MinutosPorDia = [0, 100, 100, 100, 100, 100, 100]; // domingo livre

function disc(id: string, nome: string, nTopicos: number): DisciplinaPlano {
  return {
    id,
    nome,
    questoes: 10,
    pontos: null,
    nivel: 'basico',
    topicos: Array.from({ length: nTopicos }, (_, i) => ({ id: `${id}-t${i + 1}`, nome: `${nome} ${i + 1}` })),
  };
}
const CONTEUDO = [disc('d1', 'Direito Constitucional', 6), disc('d2', 'Português', 6), disc('d3', 'Contabilidade', 4)];

const sessao = (data: string, disciplinaId: string, minutos: number, acertos = 0, erros = 0) => ({
  data,
  disciplinaId,
  minutos,
  acertos,
  erros,
});
const atrasada = (disciplinaId: string, dias = 2) => ({ disciplinaId, dataRevisao: somarDias(HOJE, -dias) });

const CICLO: PlanoGerado = {
  modo: 'ciclo',
  ciclo: [
    { disciplinaId: 'd3', minutos: 60 },
    { disciplinaId: 'd1', minutos: 120 },
    { disciplinaId: 'd2', minutos: 90 },
  ],
  avisos: [],
};

function planoPrazo(criadoEm: string, dataProva: string, concluidos: string[] = []): PlanoGerado {
  return gerarPlano({ disciplinas: CONTEUDO, dataProva, hoje: criadoEm, minutosPorDia: MPD, concluidos, pesosInformados: true });
}

function entrada(parcial: Partial<EntradaAjuste> = {}): EntradaAjuste {
  return {
    conteudo: CONTEUDO,
    gerado: CICLO,
    dataProva: null,
    minutosPorDia: MPD,
    pesosInformados: true,
    criadoEm: somarDias(HOJE, -14),
    fatoresAcertoVigentes: {},
    posicaoAtual: 0,
    sessoes: [],
    concluidos: [],
    revisoesPendentes: [],
    hoje: HOJE,
    ...parcial,
  };
}

const prioridades = (r: ReturnType<typeof ajustarPlano>) => r.resumo.filter((i) => i.tipo === 'prioridade');

describe('calcularMultiplicadores e itens de prioridade', () => {
  it('52% em 25 questoes sobe ×1,25', () => {
    const e = entrada({ sessoes: [sessao(somarDias(HOJE, -3), 'd1', 60, 13, 12)] });
    expect(calcularMultiplicadores(e)).toEqual({ d1: 1.25 });
    const r = ajustarPlano(e);
    expect(r.ajustes).toEqual({ d1: 1.25 });
    expect(prioridades(r)).toEqual([
      { tipo: 'prioridade', disciplinaId: 'd1', nome: 'Direito Constitucional', direcao: 'sobe', percentual: 52, questoes: 25 },
    ]);
  });

  it('86% de acerto desce ×0,85', () => {
    const e = entrada({ sessoes: [sessao(somarDias(HOJE, -3), 'd2', 60, 20, 5), sessao(somarDias(HOJE, -10), 'd2', 60, 23, 2)] });
    expect(calcularMultiplicadores(e)).toEqual({ d2: 0.85 });
    expect(prioridades(ajustarPlano(e))).toEqual([
      { tipo: 'prioridade', disciplinaId: 'd2', nome: 'Português', direcao: 'desce', percentual: 86, questoes: 50 },
    ]);
  });

  it('9 questoes nao bastam; 60% a 79% fica ×1', () => {
    expect(calcularMultiplicadores(entrada({ sessoes: [sessao(somarDias(HOJE, -1), 'd1', 30, 1, 8)] }))).toEqual({});
    expect(calcularMultiplicadores(entrada({ sessoes: [sessao(somarDias(HOJE, -1), 'd1', 30, 7, 3)] }))).toEqual({});
  });

  it('so conta questoes da janela de 28 dias antes de hoje', () => {
    const fora = [sessao(somarDias(HOJE, -29), 'd1', 30, 0, 20), sessao(HOJE, 'd1', 30, 0, 20)];
    expect(calcularMultiplicadores(entrada({ sessoes: fora }))).toEqual({});
    expect(calcularMultiplicadores(entrada({ sessoes: [sessao(somarDias(HOJE, -28), 'd1', 30, 0, 20)] }))).toEqual({ d1: 1.25 });
  });

  it('baixo acerto + 3 revisoes atrasadas da 1,38; revisao de hoje nao conta como atrasada', () => {
    const e = entrada({
      sessoes: [sessao(somarDias(HOJE, -2), 'd1', 60, 2, 10)],
      revisoesPendentes: [atrasada('d1'), atrasada('d1', 5), atrasada('d1', 1), { disciplinaId: 'd2', dataRevisao: HOJE }, atrasada('d2')],
    });
    expect(calcularMultiplicadores(e)).toEqual({ d1: 1.38 });
    expect(ajustarPlano(e).resumo).toContainEqual({ tipo: 'revisoes_atrasadas', disciplinaId: 'd1', nome: 'Direito Constitucional', quantidade: 3 });
  });

  it('alto acerto + revisoes atrasadas: 0,85 × 1,1 = 0,94', () => {
    const e = entrada({ sessoes: [sessao(somarDias(HOJE, -2), 'd2', 60, 9, 1)], revisoesPendentes: [atrasada('d2'), atrasada('d2')] });
    expect(calcularMultiplicadores(e)).toEqual({ d2: 0.94 });
  });

  it('fator vigente igual nao gera item de prioridade', () => {
    const e = entrada({ sessoes: [sessao(somarDias(HOJE, -3), 'd1', 60, 13, 12)], fatoresAcertoVigentes: { d1: 1.25 } });
    expect(ajustarPlano(e).ajustes).toEqual({ d1: 1.25 });
    expect(prioridades(ajustarPlano(e))).toEqual([]);
  });

  it('estavel por duas semanas (acerto baixo + 2 atrasadas): a segunda nao repete a prioridade', () => {
    const base = {
      criadoEm: HOJE,
      sessoes: [sessao(somarDias(HOJE, -10), 'd1', 60, 2, 10)],
      revisoesPendentes: [atrasada('d1'), atrasada('d1')],
    };
    const primeira = ajustarPlano(entrada(base));
    expect(primeira.ajustes).toEqual({ d1: 1.38 });
    expect(primeira.fatoresAcerto).toEqual({ d1: 1.25 });
    expect(prioridades(primeira)).toHaveLength(1);
    const segunda = ajustarPlano(entrada({ ...base, fatoresAcertoVigentes: primeira.fatoresAcerto }));
    expect(segunda.ajustes).toEqual({ d1: 1.38 });
    expect(prioridades(segunda)).toEqual([]);
    // revisões em dia na segunda semana: o multiplicador cai para 1,25, mas o acerto não mudou
    const semAtrasadas = ajustarPlano(entrada({ ...base, revisoesPendentes: [], fatoresAcertoVigentes: primeira.fatoresAcerto }));
    expect(semAtrasadas.ajustes).toEqual({ d1: 1.25 });
    expect(semAtrasadas.resumo).toEqual([{ tipo: 'em_dia' }]);
  });

  it('de 1,25 de volta a ×1: item normal (com e sem questoes suficientes)', () => {
    const vigentes = { fatoresAcertoVigentes: { d1: 1.25 } };
    const r = ajustarPlano(entrada({ ...vigentes, sessoes: [sessao(somarDias(HOJE, -2), 'd1', 60, 7, 3)] }));
    expect(r.fatoresAcerto).toEqual({});
    expect(prioridades(r)).toEqual([
      { tipo: 'prioridade', disciplinaId: 'd1', nome: 'Direito Constitucional', direcao: 'normal', percentual: 70, questoes: 10 },
    ]);
    const semQuestoes = ajustarPlano(entrada({ ...vigentes, criadoEm: HOJE }));
    expect(semQuestoes.resumo).toEqual([
      { tipo: 'prioridade', disciplinaId: 'd1', nome: 'Direito Constitucional', direcao: 'normal', percentual: null, questoes: 0 },
    ]);
  });

  it('direcao e relativa ao fator anterior: 1,25 → 0,85 desce; 0,85 → 1,25 sobe', () => {
    const d = somarDias(HOJE, -2);
    const desce = ajustarPlano(entrada({ fatoresAcertoVigentes: { d1: 1.25 }, sessoes: [sessao(d, 'd1', 60, 9, 1)] }));
    expect(prioridades(desce)).toMatchObject([{ direcao: 'desce', percentual: 90 }]);
    const sobe = ajustarPlano(entrada({ fatoresAcertoVigentes: { d1: 0.85 }, sessoes: [sessao(d, 'd1', 60, 1, 9)] }));
    expect(prioridades(sobe)).toMatchObject([{ direcao: 'sobe', percentual: 10 }]);
  });

  it('sobe com 59,6% mostra 59% (arredonda para baixo)', () => {
    const r = ajustarPlano(entrada({ sessoes: [sessao(somarDias(HOJE, -2), 'd1', 60, 149, 101)] }));
    expect(prioridades(r)).toMatchObject([{ direcao: 'sobe', percentual: 59, questoes: 250 }]);
  });

  it('no maximo 2 itens de prioridade, maiores mudancas primeiro', () => {
    const d = somarDias(HOJE, -2);
    const e = entrada({ sessoes: [sessao(d, 'd2', 60, 9, 1), sessao(d, 'd1', 60, 1, 9), sessao(d, 'd3', 60, 1, 9)] });
    expect(prioridades(ajustarPlano(e)).map((i) => i.tipo === 'prioridade' && i.disciplinaId)).toEqual(['d1', 'd3']);
  });

  it('so a materia com mais revisoes atrasadas entra no resumo (minimo 2)', () => {
    const e = entrada({ revisoesPendentes: [atrasada('d1'), atrasada('d1'), atrasada('d3'), atrasada('d3'), atrasada('d3')] });
    const itens = ajustarPlano(e).resumo.filter((i) => i.tipo === 'revisoes_atrasadas');
    expect(itens).toEqual([{ tipo: 'revisoes_atrasadas', disciplinaId: 'd3', nome: 'Contabilidade', quantidade: 3 }]);
    expect(ajustarPlano(entrada({ revisoesPendentes: [atrasada('d1')] })).resumo.some((i) => i.tipo === 'revisoes_atrasadas')).toBe(false);
  });
});

describe('ajustarPlano no prazo', () => {
  const criadoEm = somarDias(HOJE, -14);
  const dataProva = somarDias(HOJE, 41);

  it('dias ate hoje ficam intactos e de amanha em diante sao regerados sem os topicos concluidos', () => {
    const gerado = planoPrazo(criadoEm, dataProva);
    if (gerado.modo !== 'prazo') throw new Error('esperava prazo');
    const concluidos = ['d1-t1', 'd1-t2', 'd2-t1', 'd1-t3'];
    const r = ajustarPlano(entrada({ gerado, dataProva, criadoEm, concluidos }));
    if (r.gerado.modo !== 'prazo') throw new Error('esperava prazo');

    expect(r.gerado.dias.filter((d) => d.data <= HOJE)).toEqual(gerado.dias.filter((d) => d.data <= HOJE));
    const futuros = r.gerado.dias.filter((d) => d.data > HOJE);
    expect(futuros[0].data).toBe(AMANHA);
    expect(futuros.at(-1)!.data).toBe(somarDias(dataProva, -1));
    const topicos = futuros.flatMap((d) => d.blocos.map((b) => b.topicoId));
    for (const t of concluidos) expect(topicos).not.toContain(t);
    expect(topicos).toContain('d1-t4');

    const novo = gerarPlano({ disciplinas: CONTEUDO, dataProva, hoje: AMANHA, minutosPorDia: MPD, concluidos, pesosInformados: true, ajustes: {} });
    if (novo.modo !== 'prazo') throw new Error('esperava prazo');
    expect(futuros).toEqual(novo.dias);
    expect(r.gerado.inicioReserva).toBe(novo.inicioReserva);
    expect(r.gerado.avisos).toEqual(novo.avisos);
  });

  it('aplica os multiplicadores na regeracao', () => {
    const gerado = planoPrazo(criadoEm, dataProva);
    const sessoes = [sessao(somarDias(HOJE, -2), 'd3', 30, 2, 18)];
    const r = ajustarPlano(entrada({ gerado, dataProva, criadoEm, sessoes }));
    const novo = gerarPlano({ disciplinas: CONTEUDO, dataProva, hoje: AMANHA, minutosPorDia: MPD, concluidos: [], pesosInformados: true, ajustes: { d3: 1.25 } });
    if (r.gerado.modo !== 'prazo' || novo.modo !== 'prazo') throw new Error('esperava prazo');
    expect(r.gerado.dias.filter((d) => d.data > HOJE)).toEqual(novo.dias);
  });

  it('item de horas soma os blocos planejados da janela e diz os dias ate a prova', () => {
    const gerado = planoPrazo(criadoEm, dataProva);
    if (gerado.modo !== 'prazo') throw new Error('esperava prazo');
    const inicio = somarDias(HOJE, -7);
    const planejados = gerado.dias
      .filter((d) => d.data >= inicio && d.data < HOJE)
      .reduce((s, d) => s + d.blocos.reduce((t, b) => t + b.minutos, 0), 0);
    expect(planejados).toBe(600);
    const r = ajustarPlano(entrada({ gerado, dataProva, criadoEm, sessoes: [sessao(somarDias(HOJE, -1), 'd1', 390)] }));
    expect(r.resumo[0]).toEqual({ tipo: 'horas', estudados: 390, planejados: 600, diasAteProva: 41 });
    expect(r.janela).toEqual({ inicio, fim: somarDias(HOJE, -1) });
    expect(r.fila).toEqual({ posicao: 0, desde: AMANHA });
  });

  it('prazo regerado: fila volta a 0 desde amanha e o resumo diz fila_refeita', () => {
    const gerado = planoPrazo(criadoEm, dataProva);
    const sessoes = [sessao(somarDias(HOJE, -1), 'd1', 60, 1, 11)];
    const r = ajustarPlano(entrada({ gerado, dataProva, criadoEm, sessoes, posicaoAtual: 5 }));
    expect(r.fila).toEqual({ posicao: 0, desde: somarDias(HOJE, 1) });
    const tipos = r.resumo.map((i) => i.tipo);
    expect(tipos).toEqual(['horas', 'fila_refeita', 'prioridade']);
    expect(tipos.indexOf('fila_refeita')).toBe(tipos.indexOf('horas') + 1);
  });

  it('prova amanha: fila null e sem fila_refeita', () => {
    const gerado = planoPrazo(criadoEm, AMANHA);
    const r = ajustarPlano(entrada({ gerado, dataProva: AMANHA, criadoEm, posicaoAtual: 5, sessoes: [sessao(somarDias(HOJE, -1), 'd1', 60)] }));
    expect(r.fila).toBeNull();
    expect(r.resumo.some((i) => i.tipo === 'fila_refeita')).toBe(false);
  });

  it('prova amanha: gerado fica igual ao de entrada', () => {
    const gerado = planoPrazo(criadoEm, AMANHA);
    const r = ajustarPlano(entrada({ gerado, dataProva: AMANHA, criadoEm, sessoes: [sessao(somarDias(HOJE, -1), 'd1', 60, 0, 12)] }));
    expect(r.gerado).toEqual(gerado);
    expect(r.ajustes).toEqual({ d1: 1.25 });
    expect(r.resumo[0]).toMatchObject({ tipo: 'horas', estudados: 60, diasAteProva: null });
  });

  it('avisa quando o numero de topicos que nao cabem muda', () => {
    const gerado: PlanoGerado = { modo: 'prazo', dias: [], inicioReserva: null, avisos: [{ tipo: 'nao_cabe', topicosFora: ['a', 'b', 'c', 'd', 'e'] }] };
    const r = ajustarPlano(entrada({ gerado, dataProva, criadoEm: HOJE }));
    expect(r.resumo).toEqual([{ tipo: 'fila_refeita' }, { tipo: 'nao_cabe', agora: 0, antes: 5 }]);
  });

  it('plano criado hoje nao tem item de horas', () => {
    const gerado = planoPrazo(HOJE, dataProva);
    const r = ajustarPlano(entrada({ gerado, dataProva, criadoEm: HOJE, sessoes: [sessao(somarDias(HOJE, -2), 'd1', 60, 1, 9)] }));
    expect(r.resumo.some((i) => i.tipo === 'horas' || i.tipo === 'sem_estudo')).toBe(false);
    expect(r.resumo.map((i) => i.tipo)).toEqual(['fila_refeita', 'prioridade']);
  });
});

describe('ajustarPlano no ciclo', () => {
  it('horas: 390 de 600 min (sessoes fora da janela nao contam)', () => {
    const sessoes = [sessao(somarDias(HOJE, -1), 'd1', 200), sessao(somarDias(HOJE, -7), 'd2', 190), sessao(HOJE, 'd1', 50), sessao(somarDias(HOJE, -8), 'd1', 50)];
    const r = ajustarPlano(entrada({ sessoes }));
    expect(r.resumo).toEqual([{ tipo: 'horas', estudados: 390, planejados: 600, diasAteProva: null }]);
  });

  it('janela sem sessoes: sem_estudo', () => {
    expect(ajustarPlano(entrada()).resumo).toEqual([{ tipo: 'sem_estudo' }]);
  });

  it('janela comeca na criacao do plano quando ela e mais recente', () => {
    const criadoEm = somarDias(HOJE, -3); // sexta: sexta, sabado, domingo (livre)
    const r = ajustarPlano(entrada({ criadoEm, sessoes: [sessao(somarDias(HOJE, -2), 'd1', 50)] }));
    expect(r.resumo).toEqual([{ tipo: 'horas', estudados: 50, planejados: 200, diasAteProva: null }]);
    expect(r.janela).toEqual({ inicio: criadoEm, fim: somarDias(HOJE, -1) });
  });

  it('preserva a ordem dos itens (novos no fim) e a fila aponta para a mesma matéria na mesma volta', () => {
    const conteudo = [...CONTEUDO, disc('d4', 'Informática', 2)];
    const sessoes = [sessao(somarDias(HOJE, -2), 'd2', 60, 2, 18)];
    const r = ajustarPlano(entrada({ conteudo, sessoes, posicaoAtual: 4 })); // volta 1, d1 (2º item)
    if (r.gerado.modo !== 'ciclo') throw new Error('esperava ciclo');
    expect(r.gerado.ciclo.map((i) => i.disciplinaId)).toEqual(['d3', 'd1', 'd2', 'd4']);
    const novo = gerarPlano({ disciplinas: conteudo, dataProva: null, hoje: HOJE, minutosPorDia: MPD, concluidos: [], pesosInformados: true, ajustes: { d2: 1.25 } });
    if (novo.modo !== 'ciclo') throw new Error('esperava ciclo');
    const minutosDe = (id: string) => novo.ciclo.find((i) => i.disciplinaId === id)!.minutos;
    expect(r.gerado.ciclo).toEqual(['d3', 'd1', 'd2', 'd4'].map((id) => ({ disciplinaId: id, minutos: minutosDe(id) })));
    expect(r.fila).not.toBeNull();
    const n = r.gerado.ciclo.length;
    expect(r.gerado.ciclo[r.fila!.posicao % n].disciplinaId).toBe('d1');
    expect(Math.floor(r.fila!.posicao / n)).toBe(1);
    expect(r.fila!.desde).toBeNull();
    expect(r.resumo.some((i) => i.tipo === 'fila_refeita')).toBe(false);
  });

  it('nada mudou: em_dia', () => {
    const r = ajustarPlano(entrada({ criadoEm: HOJE }));
    expect(r.resumo).toEqual([{ tipo: 'em_dia' }]);
    expect(r.ajustes).toEqual({});
  });
});

describe('ajusteVencido', () => {
  const ref = new Date('2026-11-09T12:00:00Z');
  it('6 dias e 23 h ainda nao; 7 dias sim', () => {
    expect(ajusteVencido(ref, new Date('2026-11-16T11:00:00Z'))).toBe(false);
    expect(ajusteVencido(ref, new Date('2026-11-16T12:00:00Z'))).toBe(true);
  });
});
