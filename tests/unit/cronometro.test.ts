import { describe, it, expect } from 'vitest';
import {
  PARADO,
  iniciar,
  pausar,
  segundosDecorridos,
  minutosParaRegistro,
  chaveRascunho,
  validarRascunho,
  type Rascunho,
} from '@/lib/acompanhamento/cronometro';

const formulario = {
  disciplinaId: 'd1',
  topicoId: null,
  tipo: 'teoria',
  acertos: '',
  erros: '',
  observacao: '',
  intervalos: [1, 7],
  concluir: false,
};

function rascunho(sobrescrever: Record<string, unknown> = {}, estado: Record<string, unknown> = {}) {
  return {
    versao: 1,
    estado: { rodando: true, iniciadoEm: 1_000_000, acumuladoSeg: 0, ...estado },
    formulario,
    atualizadoEm: 1_000_000,
    ...sobrescrever,
  };
}

describe('cronômetro', () => {
  it('iniciar → pausar acumula', () => {
    const e = pausar(iniciar(PARADO, 0), 90_000);
    expect(e.acumuladoSeg).toBe(90);
    expect(e.rodando).toBe(false);
    expect(e.iniciadoEm).toBeNull();
  });

  it('retomar soma ao acumulado', () => {
    const e = iniciar(pausar(iniciar(PARADO, 0), 60_000), 100_000);
    expect(segundosDecorridos(e, 130_000)).toBe(90);
  });

  it('pausar parado não muda nada', () => {
    expect(pausar(PARADO, 5_000)).toEqual(PARADO);
  });

  it('iniciar rodando não reinicia', () => {
    const e = iniciar(PARADO, 1_000);
    expect(iniciar(e, 9_000).iniciadoEm).toBe(1_000);
  });

  it('relógio que voltou não gera tempo negativo', () => {
    const e = iniciar(PARADO, 10_000);
    expect(segundosDecorridos(e, 5_000)).toBe(0);
    expect(pausar(e, 5_000).acumuladoSeg).toBe(0);
  });

  it('segundosDecorridos arredonda para baixo', () => {
    expect(segundosDecorridos(iniciar(PARADO, 0), 1_999)).toBe(1);
  });

  it('minutosParaRegistro', () => {
    expect(minutosParaRegistro(29)).toBe(0);
    expect(minutosParaRegistro(30)).toBe(1);
    expect(minutosParaRegistro(89)).toBe(1);
    expect(minutosParaRegistro(90)).toBe(2);
    expect(minutosParaRegistro(25 * 3600)).toBe(1440);
  });

  it('chaveRascunho', () => {
    expect(chaveRascunho('u1')).toBe('editaliza:cronometro:u1');
  });
});

describe('validarRascunho', () => {
  const agora = 1_000_000;

  it('devolve o rascunho rodando válido', () => {
    const r = rascunho();
    expect(validarRascunho(r, agora)).toEqual(r as Rascunho);
  });

  it('aceita pausado com tempo acumulado', () => {
    const r = rascunho({}, { rodando: false, iniciadoEm: null, acumuladoSeg: 120 });
    expect(validarRascunho(r, agora)).not.toBeNull();
  });

  it.each([
    ['null', null],
    ['string', 'x'],
    ['acumuladoSeg negativo', rascunho({}, { acumuladoSeg: -1 })],
    ['rodando sem iniciadoEm', rascunho({}, { iniciadoEm: null })],
    ['iniciadoEm no futuro', rascunho({}, { iniciadoEm: 1_000_000 + 60_001 })],
    ['parado zerado', rascunho({}, { rodando: false, iniciadoEm: null, acumuladoSeg: 0 })],
    ['versão 2', rascunho({ versao: 2 })],
    ['intervalo inválido', rascunho({ formulario: { ...formulario, intervalos: [1, 5] } })],
  ])('devolve null para %s', (_nome, valor) => {
    expect(validarRascunho(valor, agora)).toBeNull();
  });
});
