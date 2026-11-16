import { describe, expect, it } from 'vitest';
import { textoDoResumo } from '@/lib/plano/resumo';

describe('textoDoResumo', () => {
  it('horas com prazo', () => {
    expect(textoDoResumo({ tipo: 'horas', estudados: 390, planejados: 600, diasAteProva: 41 })).toBe(
      'Você estudou 6 h 30 min de 10 h planejadas (65%). O conteúdo que ficou foi redistribuído nos 41 dias até a prova.',
    );
  });
  it('horas sem prazo (ciclo)', () => {
    expect(textoDoResumo({ tipo: 'horas', estudados: 45, planejados: 120, diasAteProva: null })).toBe(
      'Você estudou 45 min de 2 h planejadas (38%).',
    );
  });
  it('sem estudo', () => {
    expect(textoDoResumo({ tipo: 'sem_estudo' })).toBe('Nenhum estudo registrado nos últimos 7 dias.');
  });
  it('prioridade sobe e desce', () => {
    const base = { tipo: 'prioridade', disciplinaId: 'd1' } as const;
    expect(textoDoResumo({ ...base, nome: 'Direito Constitucional', direcao: 'sobe', percentual: 52, questoes: 25 })).toBe(
      'Direito Constitucional ganhou prioridade: 52% de acerto em 25 questões.',
    );
    expect(textoDoResumo({ ...base, nome: 'Português', direcao: 'desce', percentual: 86, questoes: 40 })).toBe(
      'Português perdeu um pouco de prioridade: 86% de acerto em 40 questões.',
    );
  });
  it('revisões atrasadas', () => {
    expect(textoDoResumo({ tipo: 'revisoes_atrasadas', disciplinaId: 'd3', nome: 'Contabilidade', quantidade: 3 })).toBe(
      '3 revisões atrasadas em Contabilidade: elas aparecem primeiro em Hoje.',
    );
  });
  it('não cabe e voltou a caber', () => {
    expect(textoDoResumo({ tipo: 'nao_cabe', agora: 12, antes: 5 })).toBe('Agora 12 tópicos não cabem até a prova (antes: 5).');
    expect(textoDoResumo({ tipo: 'nao_cabe', agora: 0, antes: 5 })).toBe('Todo o edital voltou a caber até a prova.');
  });
  it('em dia', () => {
    expect(textoDoResumo({ tipo: 'em_dia' })).toBe('Seu plano está em dia. Nada mudou.');
  });
});
