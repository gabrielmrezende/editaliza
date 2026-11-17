import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EsquemaConcluirBloco, EsquemaVoltarBloco } from '@/lib/dominio/esquemas';
import type { DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
import { MSG_SEM_PLANO_ATIVO } from '@/lib/acompanhamento/mensagens';
import { MSG_FILA_FIM, MSG_FILA_MUDOU } from '@/lib/planos/mensagens';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';

const { AcompanhamentoError } = await import('@/lib/acompanhamento/servico');
const { concluirBloco, voltarBloco } = await import('@/lib/planos/fila-servico');

const AGORA = new Date('2026-11-17T15:00:00Z'); // 12h em São Paulo
const HOJE = '2026-11-17';

const CONTEUDO: DisciplinaPlano[] = [
  {
    id: 'd0',
    nome: 'Português',
    questoes: 20,
    pontos: null,
    nivel: 'basico',
    topicos: [
      { id: 'd0-t0', nome: 'Crase' },
      { id: 'd0-t1', nome: 'Pontuação' },
    ],
  },
  { id: 'd1', nome: 'Direito', questoes: 10, pontos: null, nivel: 'basico', topicos: [{ id: 'd1-t0', nome: 'Atos' }] },
];

/** Prazo: 2 blocos de estudo em 17/11, revisão geral e simulado em 18/11. Os dias vêm fora de ordem de propósito. */
const PRAZO: PlanoGerado = {
  modo: 'prazo',
  inicioReserva: '2026-11-18',
  avisos: [],
  dias: [
    {
      data: '2026-11-18',
      blocos: [
        { disciplinaId: 'd1', topicoId: null, tipo: 'revisao_geral', minutos: 60 },
        { disciplinaId: 'd0', topicoId: null, tipo: 'simulado', minutos: 90 },
      ],
    },
    {
      data: '2026-11-17',
      blocos: [
        { disciplinaId: 'd0', topicoId: 'd0-t0', tipo: 'estudo', minutos: 50 },
        { disciplinaId: 'd1', topicoId: 'd1-t0', tipo: 'estudo', minutos: 40 },
      ],
    },
  ],
};

const CICLO: PlanoGerado = {
  modo: 'ciclo',
  avisos: [],
  ciclo: [
    { disciplinaId: 'd0', minutos: 90 },
    { disciplinaId: 'd1', minutos: 60 },
  ],
};

async function criarPlano(
  userId: string,
  gerado: PlanoGerado,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin()
    .from('planos')
    .insert({
      user_id: userId,
      ativo: true,
      minutos_por_dia: [0, 60, 60, 60, 60, 60, 60],
      conteudo: CONTEUDO,
      gerado,
      ...extra,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function novoAluno(gerado: PlanoGerado = PRAZO, extra: Record<string, unknown> = {}) {
  const u = await criarUsuarioTeste(emailUnico('fila-servico'));
  return { ...u, planoId: await criarPlano(u.id, gerado, extra) };
}

const entrada = (campos: Record<string, unknown> = {}) =>
  EsquemaConcluirBloco.parse({ posicaoEsperada: 0, minutos: 50, origem: 'cronometro', ...campos });

const voltar = (posicaoEsperada: number) => EsquemaVoltarBloco.parse({ posicaoEsperada });

async function esperarErro(p: Promise<unknown>, status: number, mensagem?: string) {
  const erro = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(AcompanhamentoError);
  expect((erro as InstanceType<typeof AcompanhamentoError>).status).toBe(status);
  if (mensagem) expect((erro as Error).message).toBe(mensagem);
}

async function sessoesDe(planoId: string) {
  const { data, error } = await admin()
    .from('sessoes_estudo')
    .select('id, data, disciplina_id, disciplina_nome, topico_id, topico_nome, minutos, acertos, erros, tipo, origem')
    .eq('plano_id', planoId)
    .order('created_at');
  if (error) throw error;
  return data;
}

async function contarRevisoes(planoId: string) {
  const { count, error } = await admin()
    .from('revisoes')
    .select('id', { count: 'exact', head: true })
    .eq('plano_id', planoId);
  if (error) throw error;
  return count ?? 0;
}

async function posicao(planoId: string) {
  const { data, error } = await admin().from('planos').select('fila_posicao').eq('id', planoId).single();
  if (error) throw error;
  return data.fila_posicao as number;
}

describe('concluirBloco', () => {
  it('prazo: concluir grava a sessão do bloco atual e avança', async () => {
    const a = await novoAluno();
    const r = await concluirBloco(a.id, a.planoId, entrada(), AGORA);
    expect(r).toEqual({ posicao: 1, sessaoId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const sessoes = await sessoesDe(a.planoId);
    expect(sessoes).toHaveLength(1);
    expect(sessoes[0]).toMatchObject({
      id: r.sessaoId,
      data: HOJE,
      disciplina_id: 'd0',
      disciplina_nome: 'Português',
      topico_id: 'd0-t0',
      topico_nome: 'Crase',
      minutos: 50,
      tipo: null,
      origem: 'cronometro',
    });
    expect(await contarRevisoes(a.planoId)).toBe(4);
    expect(await posicao(a.planoId)).toBe(1);
  });

  it('dois cliques ao mesmo tempo: uma sessão, a posição sobe 1 e o outro recebe 409', async () => {
    const a = await novoAluno();
    const resultados = await Promise.allSettled([
      concluirBloco(a.id, a.planoId, entrada(), AGORA),
      concluirBloco(a.id, a.planoId, entrada(), AGORA),
    ]);
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const falhas = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    await esperarErro(Promise.reject(falhas[0].reason), 409, MSG_FILA_MUDOU);
    expect(await posicao(a.planoId)).toBe(1);
    expect(await sessoesDe(a.planoId)).toHaveLength(1);
  });

  it('salvar sem concluir (avancar false): grava a sessão e não avança', async () => {
    const a = await novoAluno();
    const r = await concluirBloco(a.id, a.planoId, entrada({ avancar: false, minutos: 20 }), AGORA);
    expect(r.posicao).toBe(0);
    expect(await sessoesDe(a.planoId)).toHaveLength(1);
    expect(await posicao(a.planoId)).toBe(0);
  });

  it('concluirTopico grava topicos_concluidos', async () => {
    const a = await novoAluno();
    await concluirBloco(a.id, a.planoId, entrada({ concluirTopico: true }), AGORA);
    const { data } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', a.planoId);
    expect(data).toEqual([{ topico_id: 'd0-t0' }]);
  });

  it('bloco de simulado: sessão sem tópico, tipo simulado, sem revisões; revisao_geral → tipo revisao', async () => {
    const a = await novoAluno(PRAZO, { fila_posicao: 2 });
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 2, concluirTopico: true }), AGORA);
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 3, minutos: 90 }), AGORA);
    const sessoes = await sessoesDe(a.planoId);
    expect(sessoes.map((s) => [s.disciplina_id, s.topico_id, s.topico_nome, s.tipo])).toEqual([
      ['d1', null, null, 'revisao'],
      ['d0', null, null, 'simulado'],
    ]);
    expect(await contarRevisoes(a.planoId)).toBe(0);
    const { data } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', a.planoId);
    expect(data).toEqual([]);
  });

  it('fila_desde: o bloco 0 é o primeiro com data >= fila_desde', async () => {
    const a = await novoAluno(PRAZO, { fila_desde: '2026-11-18' });
    await concluirBloco(a.id, a.planoId, entrada(), AGORA);
    const [s] = await sessoesDe(a.planoId);
    expect([s.disciplina_id, s.tipo]).toEqual(['d1', 'revisao']);
  });

  it('fim da fila no prazo → 409 e nada gravado', async () => {
    const a = await novoAluno(PRAZO, { fila_posicao: 4 });
    await esperarErro(concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 4 }), AGORA), 409, MSG_FILA_FIM);
    expect(await sessoesDe(a.planoId)).toHaveLength(0);
    expect(await posicao(a.planoId)).toBe(4);
  });

  it('ciclo: o tópico é o primeiro pendente e só muda com Concluí este tópico', async () => {
    const a = await novoAluno(CICLO);
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 0 }), AGORA);
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 1 }), AGORA);
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 2, concluirTopico: true }), AGORA);
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 3 }), AGORA);
    const r = await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 4 }), AGORA);
    expect(r.posicao).toBe(5);
    const sessoes = await sessoesDe(a.planoId);
    expect(sessoes.map((s) => s.topico_id)).toEqual(['d0-t0', 'd1-t0', 'd0-t0', 'd1-t0', 'd0-t1']);
    expect(sessoes.every((s) => s.tipo === null)).toBe(true);
  });

  it('ciclo: matéria toda concluída → sessão sem tópico e sem revisões', async () => {
    const a = await novoAluno(CICLO);
    const { error } = await admin()
      .from('topicos_concluidos')
      .insert([
        { plano_id: a.planoId, topico_id: 'd0-t0' },
        { plano_id: a.planoId, topico_id: 'd0-t1' },
      ]);
    if (error) throw error;
    await concluirBloco(a.id, a.planoId, entrada({ concluirTopico: true }), AGORA);
    const [s] = await sessoesDe(a.planoId);
    expect([s.disciplina_id, s.disciplina_nome, s.topico_id, s.topico_nome]).toEqual(['d0', 'Português', null, null]);
    expect(await contarRevisoes(a.planoId)).toBe(0);
    expect(await posicao(a.planoId)).toBe(1);
  });

  it('ajustado_em com microssegundos lido do banco volta igual e o concluir passa', async () => {
    const a = await novoAluno(PRAZO, { ajustado_em: '2026-11-16T12:34:56.123456+00:00' });
    const { data } = await admin().from('planos').select('ajustado_em').eq('id', a.planoId).single();
    expect(data?.ajustado_em).toMatch(/\.123456/);
    const r = await concluirBloco(a.id, a.planoId, entrada(), AGORA);
    expect(r.posicao).toBe(1);
  });

  it('tela velha depois do ajuste → 409 e nada gravado', async () => {
    const a = await novoAluno(PRAZO, { fila_posicao: 0, ajustado_em: '2026-11-17T10:00:00.5+00:00' });
    await esperarErro(concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 5 }), AGORA), 409, MSG_FILA_MUDOU);
    expect(await sessoesDe(a.planoId)).toHaveLength(0);
  });

  it('matéria do bloco fora do conteúdo → 400', async () => {
    const gerado: PlanoGerado = {
      modo: 'ciclo',
      avisos: [],
      ciclo: [{ disciplinaId: 'd9', minutos: 60 }],
    };
    const a = await novoAluno(gerado);
    await esperarErro(concluirBloco(a.id, a.planoId, entrada(), AGORA), 400);
    expect(await posicao(a.planoId)).toBe(0);
  });

  it('plano que não é o ativo (ou id inválido) → 404; sem plano ativo → 409', async () => {
    const a = await novoAluno();
    const b = await novoAluno();
    await esperarErro(concluirBloco(a.id, b.planoId, entrada(), AGORA), 404);
    await esperarErro(concluirBloco(a.id, 'nao-e-uuid', entrada(), AGORA), 404);
    expect(await sessoesDe(b.planoId)).toHaveLength(0);

    const semPlano = await criarUsuarioTeste(emailUnico('fila-sem-plano'));
    await esperarErro(concluirBloco(semPlano.id, randomUUID(), entrada(), AGORA), 409, MSG_SEM_PLANO_ATIVO);
  });
});

describe('voltarBloco', () => {
  it('recua 1 e não apaga a sessão do bloco', async () => {
    const a = await novoAluno();
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 0 }), AGORA);
    await concluirBloco(a.id, a.planoId, entrada({ posicaoEsperada: 1 }), AGORA);
    expect(await voltarBloco(a.id, a.planoId, voltar(2))).toEqual({ posicao: 1 });
    expect(await posicao(a.planoId)).toBe(1);
    expect(await sessoesDe(a.planoId)).toHaveLength(2);
  });

  it('em 0 fica em 0; em 0 com esperada errada → 409', async () => {
    const a = await novoAluno();
    expect(await voltarBloco(a.id, a.planoId, voltar(0))).toEqual({ posicao: 0 });
    expect(await posicao(a.planoId)).toBe(0);

    const b = await novoAluno(PRAZO, { fila_posicao: 3 });
    await esperarErro(voltarBloco(b.id, b.planoId, voltar(0)), 409, MSG_FILA_MUDOU);
    expect(await posicao(b.planoId)).toBe(3);
  });

  it('esperada errada → 409 e a posição fica', async () => {
    const a = await novoAluno(PRAZO, { fila_posicao: 3 });
    await esperarErro(voltarBloco(a.id, a.planoId, voltar(2)), 409, MSG_FILA_MUDOU);
    expect(await posicao(a.planoId)).toBe(3);
  });

  it('plano de outro usuário → 404; sem plano ativo → 409', async () => {
    const a = await novoAluno();
    const b = await novoAluno(PRAZO, { fila_posicao: 2 });
    await esperarErro(voltarBloco(a.id, b.planoId, voltar(2)), 404);
    expect(await posicao(b.planoId)).toBe(2);

    const semPlano = await criarUsuarioTeste(emailUnico('fila-sem-plano'));
    await esperarErro(voltarBloco(semPlano.id, b.planoId, voltar(2)), 409, MSG_SEM_PLANO_ATIVO);
  });
});
