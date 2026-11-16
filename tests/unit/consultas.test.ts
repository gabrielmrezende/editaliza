import { describe, it, expect } from 'vitest';
import { tarefasDoDia, semana, progresso } from '@/lib/plano/consultas';
import type { PlanoGerado, DisciplinaPlano } from '@/lib/dominio/tipos';

const prazo: PlanoGerado = {
  modo: 'prazo',
  inicioReserva: null,
  avisos: [],
  dias: [
    { data: '2026-11-16', blocos: [{ disciplinaId: 'd1', topicoId: 't1', tipo: 'estudo', minutos: 60 }] },
    { data: '2026-11-17', blocos: [] },
    { data: '2026-11-19', blocos: [{ disciplinaId: 'd2', topicoId: 't3', tipo: 'simulado', minutos: 90 }] },
  ],
};
const ciclo: PlanoGerado = {
  modo: 'ciclo',
  avisos: [],
  ciclo: [{ disciplinaId: 'd1', minutos: 60 }, { disciplinaId: 'd2', minutos: 45 }],
};
const disc = (id: string, topicos: string[]): DisciplinaPlano => ({
  id, nome: id, questoes: null, pontos: null, nivel: 'basico',
  topicos: topicos.map((t) => ({ id: t, nome: t })),
});

describe('tarefasDoDia', () => {
  it('devolve blocos do dia', () => {
    expect(tarefasDoDia(prazo, '2026-11-16')).toHaveLength(1);
  });
  it('dia sem estudo e data fora do plano -> []', () => {
    expect(tarefasDoDia(prazo, '2026-11-17')).toEqual([]);
    expect(tarefasDoDia(prazo, '2030-01-01')).toEqual([]);
  });
  it('ciclo: preenche exatamente os minutos de hoje a partir do deslocamento', () => {
    // ciclo total = 105 min; hoje 120 min: d1 60, d2 45 e volta ao inicio (d1 15)
    expect(tarefasDoDia(ciclo, 'x', 0, 120)).toEqual([
      { disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 60 },
      { disciplinaId: 'd2', topicoId: null, tipo: 'estudo', minutos: 45 },
      { disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 15 },
    ]);
    // começa no meio de d1 e corta no limite do item
    expect(tarefasDoDia(ciclo, 'x', 50, 30)).toEqual([
      { disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 10 },
      { disciplinaId: 'd2', topicoId: null, tipo: 'estudo', minutos: 20 },
    ]);
    // deslocamento além do total dá a volta
    expect(tarefasDoDia(ciclo, 'x', 105 + 50, 30)).toEqual(tarefasDoDia(ciclo, 'x', 50, 30));
  });
  it('ciclo: nunca passa dos minutos de hoje (e e deterministico)', () => {
    for (let offset = 0; offset < 400; offset += 7) {
      for (const hoje of [0, 15, 30, 45, 60, 90, 120, 240, 555]) {
        const blocos = tarefasDoDia(ciclo, 'x', offset, hoje);
        expect(blocos.reduce((s, b) => s + b.minutos, 0)).toBe(hoje);
        expect(blocos.every((b) => b.minutos > 0)).toBe(true);
        expect(tarefasDoDia(ciclo, 'x', offset, hoje)).toEqual(blocos);
      }
    }
  });
  it('ciclo: junta pedaços seguidos da mesma materia', () => {
    const um: PlanoGerado = { modo: 'ciclo', avisos: [], ciclo: [{ disciplinaId: 'd1', minutos: 60 }] };
    expect(tarefasDoDia(um, 'x', 30, 150)).toEqual([{ disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 150 }]);
  });
  it('ciclo: vazio, dia sem minutos, valores invalidos', () => {
    expect(tarefasDoDia({ modo: 'ciclo', ciclo: [], avisos: [] }, 'x', 0, 60)).toEqual([]);
    expect(tarefasDoDia(ciclo, 'x', 30, 0)).toEqual([]);
    expect(tarefasDoDia(ciclo, 'x')).toEqual([]);
    expect(tarefasDoDia(ciclo, 'x', -10, 30)).toEqual(tarefasDoDia(ciclo, 'x', 0, 30));
    expect(tarefasDoDia(ciclo, 'x', 1.5, 30)).toEqual(tarefasDoDia(ciclo, 'x', 0, 30));
  });
});

describe('semana', () => {
  it('7 dias, preenchendo ausentes', () => {
    const s = semana(prazo, '2026-11-16');
    expect(s.map((d) => d.data)).toEqual(['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22']);
    expect(s[0].blocos).toHaveLength(1);
    expect(s[2].blocos).toEqual([]);
    expect(s[3].blocos).toHaveLength(1);
  });
  it('cruza mes/ano em UTC', () => {
    expect(semana(prazo, '2026-12-29').map((d) => d.data)[6]).toBe('2027-01-04');
  });
  it('ciclo: 7 dias seguindo o ciclo, dias sem horas livres', () => {
    // 2026-11-16 é segunda; seg 60, ter 0, qua 90, resto 0
    const minutos = [0, 60, 0, 90, 0, 0, 0];
    const s = semana(ciclo, '2026-11-16', { offsetMinutos: 0, minutosPorDia: minutos });
    expect(s).toHaveLength(7);
    expect(s[0].blocos).toEqual([{ disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 60 }]);
    expect(s[1].blocos).toEqual([]);
    // quarta continua de onde segunda parou (60): d2 45 e volta a d1 45
    expect(s[2].blocos).toEqual([
      { disciplinaId: 'd2', topicoId: null, tipo: 'estudo', minutos: 45 },
      { disciplinaId: 'd1', topicoId: null, tipo: 'estudo', minutos: 45 },
    ]);
    expect(s.slice(3).every((d) => d.blocos.length === 0)).toBe(true);
    // o primeiro dia é igual a tarefasDoDia de hoje
    const comOffset = semana(ciclo, '2026-11-16', { offsetMinutos: 50, minutosPorDia: minutos });
    expect(comOffset[0].blocos).toEqual(tarefasDoDia(ciclo, '2026-11-16', 50, 60));
  });
  it('ciclo sem dados do ciclo -> 7 dias vazios', () => {
    expect(semana(ciclo, '2026-11-16').every((d) => d.blocos.length === 0)).toBe(true);
  });
});

describe('progresso', () => {
  const ds = [disc('d1', ['t1', 't2']), disc('d2', ['t3']), disc('d3', [])];
  it('conta, inclui disciplinas zeradas, ignora inexistentes e duplicados', () => {
    const p = progresso(ds, ['t1', 't1', 't3', 'fantasma']);
    expect(p.total).toBe(3);
    expect(p.concluidos).toBe(2);
    expect(p.porDisciplina).toEqual({
      d1: { total: 2, concluidos: 1 },
      d2: { total: 1, concluidos: 1 },
      d3: { total: 0, concluidos: 0 },
    });
  });
});
