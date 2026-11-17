import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';

type Usuario = Awaited<ReturnType<typeof criarUsuarioTeste>>;

async function criarPlano(userId: string, ativo = true): Promise<string> {
  const { data, error } = await admin()
    .from('planos')
    .insert({
      user_id: userId,
      ativo,
      minutos_por_dia: [0, 60, 60, 60, 60, 60, 60],
      conteudo: [],
      gerado: { modo: 'prazo' },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

const SESSAO = {
  data: '2026-11-18',
  disciplina_id: 'd0',
  disciplina_nome: 'Português',
  topico_id: 'd0-t0',
  topico_nome: 'Crase',
  minutos: 30,
  acertos: 0,
  erros: 0,
  tipo: null,
  origem: 'cronometro',
};

const REVISOES = [
  { intervalo: 1, data_revisao: '2026-11-19' },
  { intervalo: 7, data_revisao: '2026-11-25' },
];

function concluir(
  userId: string,
  planoId: string,
  extra: Partial<{
    p_esperada: number | null;
    p_ajustado_lido: string | null;
    p_avancar: boolean;
  }> = {},
) {
  return admin().rpc('concluir_bloco', {
    p_user: userId,
    p_plano: planoId,
    p_esperada: 0,
    p_ajustado_lido: null,
    p_avancar: true,
    p_sessao: SESSAO,
    p_revisoes: REVISOES,
    p_concluir: false,
    ...extra,
  });
}

async function contar(tabela: 'sessoes_estudo' | 'revisoes', planoId: string) {
  const { count, error } = await admin()
    .from(tabela)
    .select('id', { count: 'exact', head: true })
    .eq('plano_id', planoId);
  if (error) throw error;
  return count ?? 0;
}

async function posicao(planoId: string) {
  const { data, error } = await admin()
    .from('planos')
    .select('fila_posicao')
    .eq('id', planoId)
    .single();
  if (error) throw error;
  return data.fila_posicao as number;
}

describe('fila (banco)', () => {
  let dono: Usuario;
  let outro: Usuario;

  beforeAll(async () => {
    dono = await criarUsuarioTeste(emailUnico('fila-dono'));
    outro = await criarUsuarioTeste(emailUnico('fila-outro'));
  });

  it('plano novo tem fila_posicao 0 e fila_desde null', async () => {
    const id = await criarPlano(dono.id, false);
    const { data } = await admin()
      .from('planos')
      .select('fila_posicao, fila_desde')
      .eq('id', id)
      .single();
    expect(data).toEqual({ fila_posicao: 0, fila_desde: null });
  });

  it('cliente autenticado não altera fila_posicao; valor negativo é recusado', async () => {
    const id = await criarPlano(dono.id, false);
    const { data } = await dono.cliente
      .from('planos')
      .update({ fila_posicao: 5 })
      .eq('id', id)
      .select('id');
    expect(data ?? []).toHaveLength(0);
    expect(await posicao(id)).toBe(0);

    const { error } = await admin().from('planos').update({ fila_posicao: -1 }).eq('id', id);
    expect(error?.code).toBe('23514');
  });

  it('concluir_bloco grava a sessão e avança', async () => {
    const u = await criarUsuarioTeste(emailUnico('fila-a'));
    const id = await criarPlano(u.id);
    const { data, error } = await concluir(u.id, id);
    expect(error).toBeNull();
    expect(data).toEqual({ sessao_id: expect.stringMatching(/^[0-9a-f-]{36}$/), posicao: 1 });
    expect(await contar('sessoes_estudo', id)).toBe(1);
    expect(await contar('revisoes', id)).toBe(2);
    expect(await posicao(id)).toBe(1);
  });

  it('p_avancar false grava e não avança', async () => {
    const u = await criarUsuarioTeste(emailUnico('fila-b'));
    const id = await criarPlano(u.id);
    const { data, error } = await concluir(u.id, id, { p_avancar: false });
    expect(error).toBeNull();
    expect(data.posicao).toBe(0);
    expect(await contar('sessoes_estudo', id)).toBe(1);
    expect(await posicao(id)).toBe(0);
  });

  it('posição esperada errada → EZ409 e nada gravado', async () => {
    const u = await criarUsuarioTeste(emailUnico('fila-c'));
    const id = await criarPlano(u.id);
    const { error } = await concluir(u.id, id, { p_esperada: 3 });
    expect(error?.code).toBe('EZ409');
    expect(await contar('sessoes_estudo', id)).toBe(0);
    expect(await posicao(id)).toBe(0);
  });

  it('posição esperada NULL → EZ409 e nada gravado', async () => {
    const u = await criarUsuarioTeste(emailUnico('fila-nula'));
    const id = await criarPlano(u.id);
    const { error } = await concluir(u.id, id, { p_esperada: null });
    expect(error?.code).toBe('EZ409');
    expect(await contar('sessoes_estudo', id)).toBe(0);
    expect(await posicao(id)).toBe(0);
  });

  it('ajustado_em diferente do lido → EZ409', async () => {
    const u = await criarUsuarioTeste(emailUnico('fila-d'));
    const id = await criarPlano(u.id);
    const { error } = await concluir(u.id, id, { p_ajustado_lido: '2026-11-01T00:00:00Z' });
    expect(error?.code).toBe('EZ409');
    expect(await contar('sessoes_estudo', id)).toBe(0);
  });

  it('plano inativo, de outro usuário ou inexistente → P0002', async () => {
    const inativo = await criarPlano(dono.id, false);
    const { error: e1 } = await concluir(dono.id, inativo);
    expect(e1?.code).toBe('P0002');

    const u = await criarUsuarioTeste(emailUnico('fila-e'));
    const id = await criarPlano(u.id);
    const { error: e2 } = await concluir(outro.id, id);
    expect(e2?.code).toBe('P0002');
    expect(await contar('sessoes_estudo', id)).toBe(0);

    const { error: e3 } = await concluir(dono.id, randomUUID());
    expect(e3?.code).toBe('P0002');
  });

  it('duas chamadas em paralelo com a mesma esperada: uma vence, a outra recebe EZ409', async () => {
    const u = await criarUsuarioTeste(emailUnico('fila-f'));
    const id = await criarPlano(u.id);
    const [a, b] = await Promise.all([concluir(u.id, id), concluir(u.id, id)]);
    const ok = [a, b].filter((r) => !r.error);
    const falhas = [a, b].filter((r) => r.error);
    expect(ok).toHaveLength(1);
    expect(ok[0].data.posicao).toBe(1);
    expect(falhas).toHaveLength(1);
    expect(falhas[0].error?.code).toBe('EZ409');
    expect(await contar('sessoes_estudo', id)).toBe(1);
    expect(await posicao(id)).toBe(1);
  });
});
