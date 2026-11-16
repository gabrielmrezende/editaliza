import { describe, expect, it } from 'vitest';
import { gerarPlano } from '@/lib/plano/gerar';
import { prioridade } from '@/lib/plano/prioridade';
import type {
  Aviso,
  DiaPlano,
  DisciplinaPlano,
  EntradaPlano,
  MinutosPorDia,
  Nivel,
  PlanoGerado,
} from '@/lib/dominio/tipos';

const HOJE = '2026-01-05'; // segunda-feira
const UNIFORME: MinutosPorDia = [120, 120, 120, 120, 120, 120, 120];

function somarDias(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
function diaSemana(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function disc(
  id: string,
  nTopicos: number,
  nivel: Nivel = 'basico',
  questoes: number | null = 10,
  pontos: number | null = null,
): DisciplinaPlano {
  return {
    id,
    nome: id,
    questoes,
    pontos,
    nivel,
    topicos: Array.from({ length: nTopicos }, (_, i) => ({ id: `${id}-t${i + 1}`, nome: `${id} t${i + 1}` })),
  };
}

function entrada(parcial: Partial<EntradaPlano> = {}): EntradaPlano {
  return {
    disciplinas: [disc('a', 3), disc('b', 3)],
    dataProva: somarDias(HOJE, 30),
    hoje: HOJE,
    minutosPorDia: UNIFORME,
    concluidos: [],
    pesosInformados: true,
    ...parcial,
  };
}

function prazo(p: PlanoGerado) {
  if (p.modo !== 'prazo') throw new Error('esperava modo prazo');
  return p;
}
function ciclo(p: PlanoGerado) {
  if (p.modo !== 'ciclo') throw new Error('esperava modo ciclo');
  return p;
}
const blocos = (dias: DiaPlano[]) => dias.flatMap((d) => d.blocos);
const minutosDe = (dias: DiaPlano[], disciplinaId: string) =>
  blocos(dias)
    .filter((b) => b.disciplinaId === disciplinaId && b.tipo === 'estudo')
    .reduce((s, b) => s + b.minutos, 0);
const tem = (avisos: Aviso[], tipo: Aviso['tipo']) => avisos.some((a) => a.tipo === tipo);

describe('prioridade', () => {
  it('multiplica peso por fator de nivel', () => {
    expect(prioridade(disc('x', 1, 'nunca_vi', 10), true)).toBe(15);
    expect(prioridade(disc('x', 1, 'basico', 10), true)).toBe(10);
    expect(prioridade(disc('x', 1, 'domino', 10), true)).toBeCloseTo(6);
  });
  it('usa pontos quando nao ha questoes e 1 quando nada informado', () => {
    expect(prioridade(disc('x', 1, 'basico', null, 8), true)).toBe(8);
    expect(prioridade(disc('x', 1, 'basico', null, null), true)).toBe(1);
  });
  it('ignora pesos quando nao informados', () => {
    expect(prioridade(disc('x', 1, 'basico', 40), false)).toBe(1);
  });
});

describe('gerarPlano', () => {
  it('nunca excede os minutos do dia', () => {
    const mpd: MinutosPorDia = [0, 60, 90, 120, 60, 30, 0];
    const plano = prazo(gerarPlano(entrada({ minutosPorDia: mpd, disciplinas: [disc('a', 8), disc('b', 8)] })));
    expect(plano.dias.length).toBe(30);
    for (const dia of plano.dias) {
      const soma = dia.blocos.reduce((s, b) => s + b.minutos, 0);
      expect(soma).toBeLessThanOrEqual(mpd[diaSemana(dia.data)]);
      for (const b of dia.blocos) {
        expect(Number.isInteger(b.minutos)).toBe(true);
        expect(b.minutos).toBeGreaterThan(0);
      }
    }
    // dias com 0 minutos ficam com blocos vazios
    expect(plano.dias.filter((d) => diaSemana(d.data) === 0).every((d) => d.blocos.length === 0)).toBe(true);
  });

  it('nenhum bloco na data da prova ou depois', () => {
    const dataProva = somarDias(HOJE, 30);
    const plano = prazo(gerarPlano(entrada({ dataProva })));
    expect(plano.dias[0].data).toBe(HOJE);
    expect(plano.dias[plano.dias.length - 1].data).toBe(somarDias(dataProva, -1));
    expect(plano.dias.every((d) => d.data < dataProva)).toBe(true);
  });

  it('materia nunca_vi recebe mais tempo que domino com mesmo peso', () => {
    const plano = prazo(
      gerarPlano(entrada({ disciplinas: [disc('novo', 5, 'nunca_vi', 10), disc('forte', 5, 'domino', 10)] })),
    );
    expect(minutosDe(plano.dias, 'novo')).toBeGreaterThan(minutosDe(plano.dias, 'forte'));
  });

  it('peso maior recebe mais tempo com mesmo nivel', () => {
    const plano = prazo(
      gerarPlano(entrada({ disciplinas: [disc('pesada', 5, 'basico', 40), disc('leve', 5, 'basico', 10)] })),
    );
    expect(minutosDe(plano.dias, 'pesada')).toBeGreaterThan(minutosDe(plano.dias, 'leve'));
  });

  it('reserva final tem pelo menos 7 dias e so revisao ou simulado', () => {
    const plano = prazo(gerarPlano(entrada({ dataProva: somarDias(HOJE, 60) })));
    expect(plano.inicioReserva).toBe(somarDias(HOJE, 51)); // max(7, round(0.15*60)=9) = 9 dias
    const reserva = plano.dias.filter((d) => d.data >= plano.inicioReserva!);
    const estudo = plano.dias.filter((d) => d.data < plano.inicioReserva!);
    expect(reserva.length).toBeGreaterThanOrEqual(7);
    expect(reserva.length).toBe(9);
    for (const b of blocos(reserva)) expect(['revisao_geral', 'simulado']).toContain(b.tipo);
    for (const b of blocos(estudo)) expect(b.tipo).toBe('estudo');
    // o 7o dia da reserva e simulado com o dia inteiro; os demais sao revisao com um bloco
    const setimo = reserva[6];
    expect(setimo.blocos).toHaveLength(1);
    expect(setimo.blocos[0].tipo).toBe('simulado');
    expect(setimo.blocos[0].minutos).toBe(120);
    expect(reserva[0].blocos).toHaveLength(1);
    expect(reserva[0].blocos[0].tipo).toBe('revisao_geral');
    // revisao alterna disciplinas
    expect(reserva[0].blocos[0].disciplinaId).not.toBe(reserva[1].blocos[0].disciplinaId);
  });

  it('reserva usa no minimo 7 dias mesmo com prova perto de 14 dias', () => {
    const plano = prazo(gerarPlano(entrada({ dataProva: somarDias(HOJE, 14) })));
    expect(plano.inicioReserva).toBe(somarDias(HOJE, 7));
  });

  it('sem reserva quando faltam menos de 14 dias', () => {
    const plano = prazo(gerarPlano(entrada({ dataProva: somarDias(HOJE, 13) })));
    expect(plano.inicioReserva).toBeNull();
    expect(plano.dias).toHaveLength(13);
    expect(blocos(plano.dias).every((b) => b.tipo === 'estudo')).toBe(true);
  });

  it('todo topico aparece quando ha tempo de sobra', () => {
    const disciplinas = [disc('a', 3), disc('b', 4), disc('c', 2, 'nunca_vi')];
    const plano = prazo(gerarPlano(entrada({ disciplinas, dataProva: somarDias(HOJE, 60) })));
    for (const d of disciplinas) {
      for (const t of d.topicos) {
        const soma = blocos(plano.dias)
          .filter((b) => b.topicoId === t.id)
          .reduce((s, b) => s + b.minutos, 0);
        expect(soma).toBeGreaterThanOrEqual(45);
      }
    }
    expect(plano.avisos.some((a) => a.tipo === 'nao_cabe')).toBe(false);
  });

  it('quando nao cabe avisa e corta da materia de menor prioridade', () => {
    const alta = disc('alta', 4, 'nunca_vi', 10);
    const baixa = disc('baixa', 4, 'domino', 10);
    const mpd: MinutosPorDia = [60, 60, 60, 60, 60, 60, 60];
    const plano = prazo(
      gerarPlano(entrada({ disciplinas: [alta, baixa], dataProva: somarDias(HOJE, 5), minutosPorDia: mpd })),
    );
    const aviso = plano.avisos.find((a) => a.tipo === 'nao_cabe');
    expect(aviso).toBeDefined();
    if (aviso?.tipo !== 'nao_cabe') throw new Error('x');
    expect(aviso.topicosFora.length).toBeGreaterThan(0);
    // todos os cortados sao da menor prioridade, do fim do edital para o inicio
    const idsBaixa = baixa.topicos.map((t) => t.id);
    expect(aviso.topicosFora.every((id) => idsBaixa.includes(id))).toBe(true);
    expect(aviso.topicosFora[0]).toBe('baixa-t4');
    // topicos cortados nao aparecem; os demais cabem
    const usados = new Set(blocos(plano.dias).map((b) => b.topicoId));
    for (const id of aviso.topicosFora) expect(usados.has(id)).toBe(false);
    expect(usados.has('alta-t1')).toBe(true);
    expect(usados.has('alta-t4')).toBe(true);
    const total = blocos(plano.dias).reduce((s, b) => s + b.minutos, 0);
    expect(total).toBeLessThanOrEqual(300);
  });

  it('topicos concluidos nao entram no plano', () => {
    const disciplinas = [disc('a', 3), disc('b', 2)];
    const concluidos = ['a-t2', 'b-t1', 'b-t2'];
    const plano = prazo(gerarPlano(entrada({ disciplinas, concluidos })));
    const usados = new Set(blocos(plano.dias).map((b) => b.topicoId));
    for (const id of concluidos) expect(usados.has(id)).toBe(false);
    expect(usados.has('a-t1')).toBe(true);
    expect(usados.has('a-t3')).toBe(true);
    // disciplina b ficou sem pendentes: so aparece (se aparecer) na reserva
    expect(blocos(plano.dias).filter((b) => b.tipo === 'estudo').some((b) => b.disciplinaId === 'b')).toBe(false);
  });

  it('sem data de prova gera ciclo proporcional e multiplo de 15', () => {
    const disciplinas = [disc('a', 3, 'nunca_vi', 20), disc('b', 3, 'basico', 10), disc('c', 3, 'domino', 10)];
    const plano = ciclo(gerarPlano(entrada({ disciplinas, dataProva: null })));
    expect(plano.ciclo).toHaveLength(3);
    for (const item of plano.ciclo) {
      expect(item.minutos % 15).toBe(0);
      expect(item.minutos).toBeGreaterThanOrEqual(30);
    }
    // total semanal 840; prioridades 30/10/6 de 46 -> 548/183/109 -> 555/180/105
    expect(plano.ciclo.map((c) => [c.disciplinaId, c.minutos])).toEqual([
      ['a', 555],
      ['b', 180],
      ['c', 105],
    ]);
  });

  it('ciclo aplica minimo de 30 minutos e ordena por prioridade', () => {
    const disciplinas = [disc('fraca', 2, 'domino', 1), disc('forte', 2, 'nunca_vi', 100)];
    const mpd: MinutosPorDia = [0, 30, 0, 0, 0, 0, 0];
    const plano = ciclo(gerarPlano(entrada({ disciplinas, dataProva: null, minutosPorDia: mpd })));
    expect(plano.ciclo.map((c) => c.disciplinaId)).toEqual(['forte', 'fraca']);
    expect(plano.ciclo[1].minutos).toBe(30);
  });

  it('data da prova hoje ou no passado gera aviso data_invalida e ciclo', () => {
    for (const dataProva of [HOJE, somarDias(HOJE, -10)]) {
      const plano = ciclo(gerarPlano(entrada({ dataProva })));
      expect(tem(plano.avisos, 'data_invalida')).toBe(true);
      expect(plano.ciclo.length).toBe(2);
    }
  });

  it('semana toda zerada gera aviso sem_tempo e nenhum bloco', () => {
    const zero: MinutosPorDia = [0, 0, 0, 0, 0, 0, 0];
    const comData = gerarPlano(entrada({ minutosPorDia: zero }));
    expect(comData).toEqual({ modo: 'prazo', dias: [], inicioReserva: null, avisos: [{ tipo: 'sem_tempo' }] });
    const semData = gerarPlano(entrada({ minutosPorDia: zero, dataProva: null }));
    expect(semData).toEqual({ modo: 'ciclo', ciclo: [], avisos: [{ tipo: 'sem_tempo' }] });
  });

  it('materia sem topicos e ignorada sem erro', () => {
    const disciplinas = [disc('vazia', 0), disc('a', 3)];
    const p = prazo(gerarPlano(entrada({ disciplinas })));
    expect(blocos(p.dias).some((b) => b.disciplinaId === 'vazia')).toBe(false);
    expect(blocos(p.dias).length).toBeGreaterThan(0);
    const c = ciclo(gerarPlano(entrada({ disciplinas, dataProva: null })));
    expect(c.ciclo.map((x) => x.disciplinaId)).toEqual(['a']);
    // tudo vazio: nao quebra
    expect(() => gerarPlano(entrada({ disciplinas: [disc('vazia', 0)] }))).not.toThrow();
  });

  it('sem pesos informados usa peso igual e avisa', () => {
    const disciplinas = [disc('a', 4, 'basico', 40), disc('b', 4, 'basico', 10)];
    const plano = prazo(gerarPlano(entrada({ disciplinas, pesosInformados: false })));
    expect(tem(plano.avisos, 'pesos_assumidos')).toBe(true);
    expect(minutosDe(plano.dias, 'a')).toBe(minutosDe(plano.dias, 'b'));
  });

  it('avisa pesos_assumidos tambem quando ninguem tem questoes nem pontos', () => {
    const disciplinas = [disc('a', 3, 'basico', null, null), disc('b', 3, 'basico', null, null)];
    expect(tem(gerarPlano(entrada({ disciplinas })).avisos, 'pesos_assumidos')).toBe(true);
    expect(tem(gerarPlano(entrada()).avisos, 'pesos_assumidos')).toBe(false);
  });

  it('mesma entrada gera o mesmo plano', () => {
    const e = entrada({ disciplinas: [disc('a', 6, 'nunca_vi', 30), disc('b', 5, 'domino', 20), disc('c', 4)], dataProva: somarDias(HOJE, 45) });
    const copia = structuredClone(e);
    const p1 = gerarPlano(e);
    const p2 = gerarPlano(e);
    expect(p1).toEqual(p2);
    expect(e).toEqual(copia); // nao muta a entrada
  });
});

describe('gerarPlano (revisao R11/R12)', () => {
  it('disciplina de peso baixo mantem o piso de 45 min por topico quando ha tempo (sem nao_cabe)', () => {
    const a = disc('a', 3, 'nunca_vi', 50);
    const b = disc('b', 2, 'domino', 1);
    const plano = prazo(gerarPlano(entrada({ disciplinas: [a, b], dataProva: somarDias(HOJE, 30) })));
    expect(tem(plano.avisos, 'nao_cabe')).toBe(false);
    const usados = new Set(blocos(plano.dias).map((x) => x.topicoId));
    for (const id of ['b-t1', 'b-t2', 'a-t1', 'a-t3']) expect(usados.has(id)).toBe(true);
    expect(minutosDe(plano.dias, 'b')).toBe(90);
  });

  it('horizonte longo com prioridades muito desiguais nao corta nada', () => {
    const disciplinas = Array.from({ length: 10 }, (_, i) =>
      disc(`d${i}`, 30, (['nunca_vi', 'basico', 'domino'] as const)[i % 3], i === 0 ? 1 : i * 12),
    );
    const plano = prazo(gerarPlano(entrada({ disciplinas, dataProva: somarDias(HOJE, 365) })));
    expect(tem(plano.avisos, 'nao_cabe')).toBe(false);
    const usados = new Set(blocos(plano.dias).map((x) => x.topicoId));
    for (const d of disciplinas) for (const t of d.topicos) expect(usados.has(t.id)).toBe(true);
  });

  it('caso realmente apertado corta da menor prioridade, do fim, e o resultado cabe', () => {
    const disciplinas = [disc('hi', 4, 'nunca_vi', 10), disc('mid', 4, 'basico', 10), disc('lo', 4, 'domino', 10)];
    const mpd: MinutosPorDia = [60, 60, 60, 60, 60, 60, 60];
    const plano = prazo(gerarPlano(entrada({ disciplinas, dataProva: somarDias(HOJE, 5), minutosPorDia: mpd })));
    const aviso = plano.avisos.find((x) => x.tipo === 'nao_cabe');
    if (aviso?.tipo !== 'nao_cabe') throw new Error('esperava nao_cabe');
    expect(aviso.topicosFora).toEqual(['lo-t4', 'lo-t3', 'lo-t2', 'lo-t1', 'mid-t4', 'mid-t3']);
    const total = blocos(plano.dias).reduce((s, x) => s + x.minutos, 0);
    expect(total).toBeLessThanOrEqual(300);
    const usados = new Set(blocos(plano.dias).map((x) => x.topicoId));
    for (const id of ['hi-t1', 'hi-t4', 'mid-t1', 'mid-t2']) expect(usados.has(id)).toBe(true);
  });

  it('nenhum bloco passa de 60 minutos', () => {
    const plano = prazo(gerarPlano(entrada({ dataProva: somarDias(HOJE, 90), disciplinas: [disc('a', 2), disc('b', 2)] })));
    expect(blocos(plano.dias).filter((x) => x.tipo === 'estudo').length).toBeGreaterThan(0);
    for (const x of blocos(plano.dias).filter((y) => y.tipo === 'estudo')) expect(x.minutos).toBeLessThanOrEqual(60);
  });

  it('nao repete a disciplina em blocos consecutivos do dia enquanto outra tem pedacos pendentes', () => {
    const disciplinas = [disc('a', 5, 'nunca_vi', 30), disc('b', 4, 'basico', 20), disc('c', 6, 'domino', 10)];
    const plano = prazo(gerarPlano(entrada({ disciplinas, dataProva: somarDias(HOJE, 60) })));
    const seq = plano.dias.flatMap((d) => d.blocos.filter((x) => x.tipo === 'estudo').map((x) => ({ data: d.data, id: x.disciplinaId })));
    seq.forEach((cur, i) => {
      if (i > 0 && seq[i - 1].data === cur.data && seq[i - 1].id === cur.id) {
        expect(seq.slice(i).every((x) => x.id === cur.id)).toBe(true);
      }
    });
  });

  it('revisao geral so gira entre disciplinas que ficaram com topico no plano', () => {
    const disciplinas = [disc('hi', 17, 'nunca_vi', 10), disc('lo', 2, 'domino', 10)];
    const mpd: MinutosPorDia = [60, 60, 60, 60, 60, 60, 60];
    const plano = prazo(gerarPlano(entrada({ disciplinas, dataProva: somarDias(HOJE, 20), minutosPorDia: mpd })));
    const aviso = plano.avisos.find((x) => x.tipo === 'nao_cabe');
    if (aviso?.tipo !== 'nao_cabe') throw new Error('esperava nao_cabe');
    expect(aviso.topicosFora).toEqual(['lo-t2', 'lo-t1']);
    const reserva = plano.dias.filter((d) => d.data >= plano.inicioReserva!);
    expect(reserva.length).toBe(7);
    expect(blocos(reserva).length).toBe(7);
    expect(blocos(reserva).every((x) => x.disciplinaId === 'hi')).toBe(true);
  });
});
