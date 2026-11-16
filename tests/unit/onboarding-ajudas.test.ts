import { describe, expect, it } from 'vitest';
import { formatarHoras, lerHoras } from '@/components/onboarding/horas';
import { novoId } from '@/components/onboarding/ids';
import { validarConteudo } from '@/components/onboarding/validacao';
import { hojeEmSaoPaulo } from '@/lib/datas';

describe('lerHoras', () => {
  it('aceita virgula e ponto e devolve minutos inteiros', () => {
    expect(lerHoras('1,5')).toBe(90);
    expect(lerHoras('1.5')).toBe(90);
    expect(lerHoras('2')).toBe(120);
    expect(lerHoras(' 2h ')).toBe(120);
    expect(lerHoras('0,25')).toBe(15);
    expect(lerHoras('')).toBe(0);
    expect(lerHoras('0')).toBe(0);
  });

  it('recusa texto, negativo e mais de 24 h', () => {
    expect(lerHoras('abc')).toBeNull();
    expect(lerHoras('-1')).toBeNull();
    expect(lerHoras('25')).toBeNull();
    expect(lerHoras('1,5,5')).toBeNull();
  });

  it('formata minutos em horas com virgula', () => {
    expect(formatarHoras(90)).toBe('1,5');
    expect(formatarHoras(120)).toBe('2');
    expect(formatarHoras(0)).toBe('0');
  });
});

describe('novoId', () => {
  it('gera d{i}-n{k} e n{k} sem colidir', () => {
    const ids = new Set(['d0', 'd0-t0', 'd0-n0', 'n0']);
    expect(novoId('d0-', ids)).toBe('d0-n1');
    expect(novoId('', ids)).toBe('n1');
    expect(novoId('d1-', ids)).toBe('d1-n0');
  });
});

describe('validarConteudo', () => {
  const d = (topicos: string[], nome = 'Matéria') => ({
    id: 'd0',
    nome,
    questoes: null,
    pontos: null,
    topicos: topicos.map((t, i) => ({ id: `d0-t${i}`, nome: t })),
  });

  it('exige ao menos 1 topico e nomes preenchidos', () => {
    expect(validarConteudo([])).toMatch(/ao menos 1 tópico/);
    expect(validarConteudo([d([])])).toMatch(/ao menos 1 tópico/);
    expect(validarConteudo([d(['  '])])).toMatch(/sem nome/);
    expect(validarConteudo([d(['a'], ' ')])).toMatch(/nome a cada matéria/);
    expect(validarConteudo([d(['a']), d([])])).toBeNull();
  });
});

describe('hojeEmSaoPaulo', () => {
  it('usa o fuso de Brasilia', () => {
    expect(hojeEmSaoPaulo(new Date('2026-11-17T02:30:00Z'))).toBe('2026-11-16');
    expect(hojeEmSaoPaulo(new Date('2026-11-17T03:30:00Z'))).toBe('2026-11-17');
  });
});

describe('posicaoNoCiclo', () => {
  // 2026-11-16 é segunda; só estuda seg–sex
  const semFimDeSemana = [0, 60, 60, 60, 60, 60, 0];

  it('conta so os dias de estudo desde o inicio', async () => {
    const { posicaoNoCiclo, ehDiaDeEstudo } = await import('@/lib/planos/ciclo');
    expect(posicaoNoCiclo('2026-11-16', '2026-11-16', semFimDeSemana)).toBe(0);
    expect(posicaoNoCiclo('2026-11-16', '2026-11-17', semFimDeSemana)).toBe(1);
    expect(posicaoNoCiclo('2026-11-16', '2026-11-23', semFimDeSemana)).toBe(5); // seg seguinte
    expect(posicaoNoCiclo('2026-11-16', '2026-11-25', semFimDeSemana)).toBe(7);
    expect(posicaoNoCiclo('2026-11-21', '2026-11-23', semFimDeSemana)).toBe(0); // sáb e dom não contam
    expect(ehDiaDeEstudo('2026-11-22', semFimDeSemana)).toBe(false);
    expect(ehDiaDeEstudo('2026-11-23', semFimDeSemana)).toBe(true);
  });
});

describe('topicoDoCicloHoje', () => {
  const d = {
    id: 'd0', nome: 'M', questoes: null, pontos: null, nivel: 'basico' as const,
    topicos: [{ id: 'a', nome: 'A' }, { id: 'b', nome: 'B' }, { id: 'c', nome: 'C' }],
  };

  it('fixa o topico concluido hoje; senao o primeiro pendente', async () => {
    const { topicoDoCicloHoje } = await import('@/lib/planos/ciclo');
    expect(topicoDoCicloHoje(d, [], '2026-11-16')).toBe('a');
    expect(topicoDoCicloHoje(d, [{ topicoId: 'a', dia: '2026-11-15' }], '2026-11-16')).toBe('b');
    expect(topicoDoCicloHoje(d, [{ topicoId: 'a', dia: '2026-11-15' }, { topicoId: 'b', dia: '2026-11-16' }], '2026-11-16')).toBe('b');
    const todos = ['a', 'b', 'c'].map((topicoId) => ({ topicoId, dia: '2026-11-01' }));
    expect(topicoDoCicloHoje(d, todos, '2026-11-16')).toBeNull();
  });
});
