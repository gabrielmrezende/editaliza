import { describe, expect, it } from 'vitest';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';
import { EsquemaEdicaoSessao, EsquemaNovaSessao } from '@/lib/dominio/esquemas';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';

const {
  AcompanhamentoError,
  editarSessao,
  excluirRevisao,
  excluirSessao,
  marcarRevisao,
  registrarSessao,
} = await import('@/lib/acompanhamento/servico');
const { marcarTopico } = await import('@/lib/planos/servico');

const AGORA = new Date('2026-11-16T15:00:00Z'); // 12h em São Paulo
const TARDE = new Date('2026-11-17T02:30:00Z'); // 23h30 de 16/11 em São Paulo

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

async function criarPlano(userId: string, ativo = true, conteudo: DisciplinaPlano[] = CONTEUDO): Promise<string> {
  const { data, error } = await admin()
    .from('planos')
    .insert({ user_id: userId, ativo, minutos_por_dia: [0, 60, 60, 60, 60, 60, 60], conteudo, gerado: { modo: 'ciclo' } })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

async function novoAluno() {
  const u = await criarUsuarioTeste(emailUnico('sessoes'));
  return { ...u, planoId: await criarPlano(u.id) };
}

const nova = (planoId: string, extra: Record<string, unknown> = {}) =>
  EsquemaNovaSessao.parse({
    planoId,
    data: '2026-11-16',
    disciplinaId: 'd0',
    topicoId: 'd0-t0',
    minutos: 30,
    tipo: 'teoria',
    observacao: null,
    origem: 'manual',
    intervalos: [1, 7, 21, 30],
    ...extra,
  });

const edicao = (campos: Record<string, unknown>) => EsquemaEdicaoSessao.parse(campos);

async function esperarErro(p: Promise<unknown>, status: number, mensagem?: string) {
  const erro = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(AcompanhamentoError);
  expect((erro as InstanceType<typeof AcompanhamentoError>).status).toBe(status);
  if (mensagem) expect((erro as Error).message).toBe(mensagem);
}

async function revisoesDe(planoId: string) {
  const { data, error } = await admin()
    .from('revisoes')
    .select('id, topico_id, intervalo, data_revisao, data_estudo, sessao_id, origem, concluida_em')
    .eq('plano_id', planoId)
    .order('intervalo');
  if (error) throw error;
  return data;
}

async function sessoesDe(planoId: string) {
  const { data, error } = await admin().from('sessoes_estudo').select('*').eq('plano_id', planoId);
  if (error) throw error;
  return data;
}

describe('sessões e revisões (serviço)', () => {
  it('registra com tópico e 4 intervalos; repetir não duplica as revisões', async () => {
    const a = await novoAluno();
    await registrarSessao(a.id, nova(a.planoId), AGORA);
    const revs = await revisoesDe(a.planoId);
    expect(revs.map((r) => [r.intervalo, r.data_revisao, r.origem])).toEqual([
      [1, '2026-11-17', 'sessao'],
      [7, '2026-11-23', 'sessao'],
      [21, '2026-12-07', 'sessao'],
      [30, '2026-12-16', 'sessao'],
    ]);
    await registrarSessao(a.id, nova(a.planoId), AGORA);
    expect(await sessoesDe(a.planoId)).toHaveLength(2);
    expect(await revisoesDe(a.planoId)).toHaveLength(4);
  });

  it('concluir: true grava o tópico em topicos_concluidos', async () => {
    const a = await novoAluno();
    await registrarSessao(a.id, nova(a.planoId, { concluir: true }), AGORA);
    const { data } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', a.planoId);
    expect(data).toEqual([{ topico_id: 'd0-t0' }]);
  });

  it('perto da meia-noite usa o dia de São Paulo: 17/11 é futuro, 16/11 vale', async () => {
    const a = await novoAluno();
    await esperarErro(registrarSessao(a.id, nova(a.planoId, { data: '2026-11-17' }), TARDE), 400, 'A data não pode ser no futuro.');
    await registrarSessao(a.id, nova(a.planoId, { data: '2026-11-16' }), TARDE);
    expect(await sessoesDe(a.planoId)).toHaveLength(1);
  });

  it('data com mais de 365 dias é recusada; exatamente 365 vale', async () => {
    const a = await novoAluno();
    await esperarErro(registrarSessao(a.id, nova(a.planoId, { data: '2025-11-15' }), AGORA), 400, 'A data é antiga demais.');
    await registrarSessao(a.id, nova(a.planoId, { data: '2025-11-16' }), AGORA);
  });

  it('nomes da matéria e do tópico vêm do conteúdo, não do cliente', async () => {
    const a = await novoAluno();
    const entrada = { ...nova(a.planoId), disciplinaNome: 'Falso', topicoNome: 'Falso' } as ReturnType<typeof nova>;
    const { sessaoId } = await registrarSessao(a.id, entrada, AGORA);
    const { data } = await admin().from('sessoes_estudo').select('disciplina_nome, topico_nome, origem').eq('id', sessaoId).single();
    expect(data).toEqual({ disciplina_nome: 'Português', topico_nome: 'Crase', origem: 'manual' });
    const revs = await admin().from('revisoes').select('disciplina_nome, topico_nome').eq('sessao_id', sessaoId);
    expect(revs.data!.every((r) => r.disciplina_nome === 'Português' && r.topico_nome === 'Crase')).toBe(true);
  });

  it('matéria ou tópico fora do conteúdo → 400; planoId diferente do ativo → 404; sem plano ativo → 409', async () => {
    const a = await novoAluno();
    const msg = 'Esta matéria ou tópico não faz parte do plano.';
    await esperarErro(registrarSessao(a.id, nova(a.planoId, { disciplinaId: 'd9' }), AGORA), 400, msg);
    await esperarErro(registrarSessao(a.id, nova(a.planoId, { topicoId: 'd1-t0' }), AGORA), 400, msg);
    const inativo = await criarPlano(a.id, false);
    await esperarErro(registrarSessao(a.id, nova(inativo), AGORA), 404);

    const semPlano = await criarUsuarioTeste(emailUnico('sessoes-sem'));
    await esperarErro(registrarSessao(semPlano.id, nova(a.planoId), AGORA), 409);
  });

  it('outro usuário não edita nem exclui (404)', async () => {
    const a = await novoAluno();
    const b = await novoAluno();
    const { sessaoId } = await registrarSessao(a.id, nova(a.planoId), AGORA);
    await esperarErro(editarSessao(b.id, sessaoId, edicao({ minutos: 5 }), AGORA), 404);
    await esperarErro(excluirSessao(b.id, sessaoId), 404);
    await esperarErro(excluirSessao(a.id, 'nao-e-uuid'), 404);
    expect(await sessoesDe(a.planoId)).toHaveLength(1);
  });

  it('excluir: a revisão concluída fica, as outras 3 somem; revisões de outra sessão do tópico ficam', async () => {
    const a = await novoAluno();
    const { sessaoId } = await registrarSessao(a.id, nova(a.planoId), AGORA);
    // revisão de outro tópico e sessão: não pode ser tocada
    await registrarSessao(a.id, nova(a.planoId, { topicoId: 'd0-t1', intervalos: [1] }), AGORA);
    const um = (await revisoesDe(a.planoId)).find((r) => r.sessao_id === sessaoId && r.intervalo === 1)!;
    await marcarRevisao(a.id, um.id, true, AGORA);

    await excluirSessao(a.id, sessaoId);
    const revs = await revisoesDe(a.planoId);
    expect(revs.filter((r) => r.topico_id === 'd0-t0').map((r) => [r.intervalo, r.sessao_id, r.concluida_em !== null])).toEqual([
      [1, null, true],
      // sem outra sessão no tópico, as pendentes foram apagadas
    ]);
    expect(revs.filter((r) => r.topico_id === 'd0-t1')).toHaveLength(1);
  });

  it('excluir a 1ª de duas sessões do mesmo tópico re-aponta as 4 pendentes para a 2ª', async () => {
    const a = await novoAluno();
    const primeira = await registrarSessao(a.id, nova(a.planoId), AGORA);
    const segunda = await registrarSessao(a.id, nova(a.planoId), AGORA); // dedupe: 0 revisões novas
    await excluirSessao(a.id, primeira.sessaoId);
    const revs = await revisoesDe(a.planoId);
    expect(revs).toHaveLength(4);
    expect(revs.every((r) => r.sessao_id === segunda.sessaoId && r.concluida_em === null)).toBe(true);
  });

  it('editar sessão de plano antigo: trocar matéria → 400; mudar só os minutos → ok', async () => {
    const u = await criarUsuarioTeste(emailUnico('sessoes-antigo'));
    const antigo = await criarPlano(u.id);
    const { sessaoId } = await registrarSessao(u.id, nova(antigo), AGORA);
    await admin().from('planos').update({ ativo: false }).eq('id', antigo);
    const novoPlano = await criarPlano(u.id);

    await esperarErro(editarSessao(u.id, sessaoId, edicao({ disciplinaId: 'd1', topicoId: 'd1-t0' }), AGORA), 400);
    await esperarErro(editarSessao(u.id, sessaoId, edicao({ topicoId: 'd0-t1' }), AGORA), 400);
    await editarSessao(u.id, sessaoId, edicao({ minutos: 45, disciplinaId: 'd0' }), AGORA);
    const { data } = await admin().from('sessoes_estudo').select('minutos, plano_id, disciplina_nome').eq('id', sessaoId).single();
    expect(data).toEqual({ minutos: 45, plano_id: antigo, disciplina_nome: 'Português' });
    expect(novoPlano).not.toBe(antigo);
  });

  it('editar no plano ativo troca matéria/tópico com os nomes do conteúdo e mantém as revisões', async () => {
    const a = await novoAluno();
    const { sessaoId } = await registrarSessao(a.id, nova(a.planoId), AGORA);
    await editarSessao(a.id, sessaoId, edicao({ disciplinaId: 'd1', topicoId: 'd1-t0', observacao: '  nota  ' }), AGORA);
    const { data } = await admin()
      .from('sessoes_estudo')
      .select('disciplina_id, disciplina_nome, topico_id, topico_nome, observacao')
      .eq('id', sessaoId)
      .single();
    expect(data).toEqual({ disciplina_id: 'd1', disciplina_nome: 'Direito', topico_id: 'd1-t0', topico_nome: 'Atos', observacao: 'nota' });
    expect((await revisoesDe(a.planoId)).every((r) => r.topico_id === 'd0-t0')).toBe(true);
    await esperarErro(editarSessao(a.id, sessaoId, edicao({ topicoId: 'd0-t0' }), AGORA), 400);
  });

  it('editar revalida data e a regra de tempo ou questões na linha final', async () => {
    const a = await novoAluno();
    const { sessaoId } = await registrarSessao(a.id, nova(a.planoId), AGORA);
    await esperarErro(editarSessao(a.id, sessaoId, edicao({ data: '2026-11-17' }), AGORA), 400, 'A data não pode ser no futuro.');
    await esperarErro(editarSessao(a.id, sessaoId, edicao({ minutos: 0 }), AGORA), 400, 'Informe o tempo ou as questões.');
    await editarSessao(a.id, sessaoId, edicao({ minutos: 0, acertos: 4, erros: 1 }), AGORA);
    await esperarErro(editarSessao(a.id, sessaoId, edicao({ acertos: 0, erros: 0 }), AGORA), 400, 'Informe o tempo ou as questões.');
  });

  it('marcarRevisao conclui e desfaz; excluirRevisao apaga; outro usuário recebe 404', async () => {
    const a = await novoAluno();
    const b = await novoAluno();
    await registrarSessao(a.id, nova(a.planoId), AGORA);
    const rev = (await revisoesDe(a.planoId))[0];

    await marcarRevisao(a.id, rev.id, true, AGORA);
    expect((await revisoesDe(a.planoId))[0].concluida_em).toBe('2026-11-16T15:00:00+00:00');
    await marcarRevisao(a.id, rev.id, false, AGORA);
    expect((await revisoesDe(a.planoId))[0].concluida_em).toBeNull();

    await esperarErro(marcarRevisao(b.id, rev.id, true, AGORA), 404);
    await esperarErro(excluirRevisao(b.id, rev.id), 404);
    await excluirRevisao(a.id, rev.id);
    expect(await revisoesDe(a.planoId)).toHaveLength(3);
    await esperarErro(excluirRevisao(a.id, rev.id), 404);
  });

  it('desfazer revisão quando já existe pendente igual → 409', async () => {
    const a = await novoAluno();
    await registrarSessao(a.id, nova(a.planoId, { intervalos: [1] }), AGORA);
    const rev = (await revisoesDe(a.planoId))[0];
    await marcarRevisao(a.id, rev.id, true, AGORA);
    await registrarSessao(a.id, nova(a.planoId, { intervalos: [1] }), AGORA); // nova pendente de 1 dia
    await esperarErro(marcarRevisao(a.id, rev.id, false, AGORA), 409);
  });

  it('marcarTopico true cria as 4 revisões de conclusão; false as apaga e preserva as da sessão', async () => {
    const a = await novoAluno();
    await registrarSessao(a.id, nova(a.planoId, { topicoId: 'd0-t1', intervalos: [7] }), AGORA);

    await marcarTopico(a.id, a.planoId, 'd0-t0', true, AGORA);
    await marcarTopico(a.id, a.planoId, 'd0-t0', true, AGORA); // idempotente
    let revs = await revisoesDe(a.planoId);
    const conclusao = revs.filter((r) => r.origem === 'conclusao');
    expect(conclusao.map((r) => [r.intervalo, r.data_estudo, r.data_revisao, r.sessao_id])).toEqual([
      [1, '2026-11-16', '2026-11-17', null],
      [7, '2026-11-16', '2026-11-23', null],
      [21, '2026-11-16', '2026-12-07', null],
      [30, '2026-11-16', '2026-12-16', null],
    ]);

    await marcarTopico(a.id, a.planoId, 'd0-t0', false, AGORA);
    revs = await revisoesDe(a.planoId);
    expect(revs.filter((r) => r.origem === 'conclusao')).toEqual([]);
    expect(revs.filter((r) => r.origem === 'sessao')).toHaveLength(1);
  });

  it('marcarTopico não duplica pendente de sessão do mesmo tópico', async () => {
    const a = await novoAluno();
    await registrarSessao(a.id, nova(a.planoId, { intervalos: [1, 7] }), AGORA);
    await marcarTopico(a.id, a.planoId, 'd0-t0', true, AGORA);
    const revs = await revisoesDe(a.planoId);
    expect(revs.map((r) => [r.intervalo, r.origem])).toEqual([
      [1, 'sessao'],
      [7, 'sessao'],
      [21, 'conclusao'],
      [30, 'conclusao'],
    ]);
    await marcarTopico(a.id, a.planoId, 'd0-t0', false, AGORA);
    expect(await revisoesDe(a.planoId)).toHaveLength(2);
  });

  it('limite diário: a 200ª sessão passa e a 201ª recebe 429', async () => {
    const a = await novoAluno();
    const linhas = Array.from({ length: 199 }, () => ({
      user_id: a.id,
      plano_id: a.planoId,
      data: '2026-11-16',
      disciplina_id: 'd0',
      disciplina_nome: 'Português',
      minutos: 10,
      origem: 'manual',
      created_at: AGORA.toISOString(),
    }));
    const { error } = await admin().from('sessoes_estudo').insert(linhas);
    expect(error).toBeNull();

    await registrarSessao(a.id, nova(a.planoId, { topicoId: null, intervalos: [] }), AGORA);
    await esperarErro(
      registrarSessao(a.id, nova(a.planoId, { topicoId: null, intervalos: [] }), AGORA),
      429,
      'Você registrou muitas sessões hoje.',
    );
    // outro dia (de São Paulo) volta a valer
    await registrarSessao(a.id, nova(a.planoId, { topicoId: null, intervalos: [] }), new Date('2026-11-17T15:00:00Z'));
  });
});
