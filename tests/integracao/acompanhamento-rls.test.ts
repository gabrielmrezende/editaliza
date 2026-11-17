import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';

type Usuario = Awaited<ReturnType<typeof criarUsuarioTeste>>;

async function criarPlano(userId: string): Promise<string> {
  const { data, error } = await admin()
    .from('planos')
    .insert({
      user_id: userId,
      ativo: false,
      minutos_por_dia: [0, 60, 60, 60, 60, 60, 60],
      conteudo: [],
      gerado: { modo: 'ciclo' },
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

const sessaoBase = (userId: string, planoId: string, extra: Record<string, unknown> = {}) => ({
  user_id: userId,
  plano_id: planoId,
  data: '2026-11-16',
  disciplina_id: 'd0',
  disciplina_nome: 'Português',
  topico_id: 'd0-t0',
  topico_nome: 'Crase',
  minutos: 30,
  acertos: 0,
  erros: 0,
  tipo: 'teoria',
  origem: 'manual',
  ...extra,
});

const REVISOES = [
  { intervalo: 1, data_revisao: '2026-11-17' },
  { intervalo: 7, data_revisao: '2026-11-23' },
];

async function registrar(userId: string, planoId: string, concluir = false) {
  const { data, error } = await admin().rpc('registrar_sessao', {
    p_user: userId,
    p_plano: planoId,
    p_sessao: {
      data: '2026-11-16',
      disciplina_id: 'd0',
      disciplina_nome: 'Português',
      topico_id: 'd0-t0',
      topico_nome: 'Crase',
      minutos: 30,
      acertos: 0,
      erros: 0,
      tipo: 'teoria',
      origem: 'manual',
    },
    p_revisoes: REVISOES,
    p_concluir: concluir,
  });
  if (error) throw error;
  return data as string;
}

const novoAjuste = (planoId: string) => ({
  plano_id: planoId,
  janela_inicio: '2026-11-01',
  janela_fim: '2026-11-28',
  multiplicadores: {},
  resumo: [],
  gerado_anterior: {},
});

describe('acompanhamento (banco)', () => {
  let dono: Usuario;
  let outro: Usuario;
  let planoId: string;

  beforeAll(async () => {
    dono = await criarUsuarioTeste(emailUnico('acomp'));
    outro = await criarUsuarioTeste(emailUnico('acomp-outro'));
    planoId = await criarPlano(dono.id);
  });

  it('dono lê as próprias sessões e revisões; outro usuário lê []', async () => {
    const sessao = await registrar(dono.id, planoId);
    const { data: minhas } = await dono.cliente.from('sessoes_estudo').select('id').eq('id', sessao);
    expect(minhas).toHaveLength(1);
    const { data: revs } = await dono.cliente.from('revisoes').select('id').eq('sessao_id', sessao);
    expect(revs).toHaveLength(2);
    expect((await outro.cliente.from('sessoes_estudo').select('id').eq('id', sessao)).data).toEqual([]);
    expect((await outro.cliente.from('revisoes').select('id').eq('sessao_id', sessao)).data).toEqual([]);

    const ajuste = await admin().from('ajustes_plano').insert(novoAjuste(planoId)).select('id').single();
    expect(ajuste.error).toBeNull();
    expect((await dono.cliente.from('ajustes_plano').select('id').eq('plano_id', planoId)).data).toHaveLength(1);
    expect((await outro.cliente.from('ajustes_plano').select('id').eq('plano_id', planoId)).data).toEqual([]);
  });

  it('cliente autenticado não insere, altera nem apaga sessoes_estudo, revisoes, ajustes_plano', async () => {
    const sessao = await registrar(dono.id, planoId);
    const { data: rev } = await admin().from('revisoes').select('id').eq('plano_id', planoId).limit(1).single();
    const { data: aj } = await admin().from('ajustes_plano').select('id').eq('plano_id', planoId).limit(1).single();
    const c = dono.cliente;
    const falhou = (r: { error: unknown; data: unknown }) =>
      expect(r.error !== null || (Array.isArray(r.data) && r.data.length === 0)).toBe(true);

    falhou(await c.from('sessoes_estudo').insert(sessaoBase(dono.id, planoId)).select());
    falhou(await c.from('sessoes_estudo').update({ minutos: 99 }).eq('id', sessao).select());
    falhou(await c.from('sessoes_estudo').delete().eq('id', sessao).select());
    falhou(await c.from('revisoes').update({ concluida_em: new Date().toISOString() }).eq('id', rev!.id).select());
    falhou(await c.from('revisoes').delete().eq('id', rev!.id).select());
    falhou(
      await c
        .from('revisoes')
        .insert({
          user_id: dono.id,
          plano_id: planoId,
          disciplina_id: 'd0',
          disciplina_nome: 'P',
          topico_id: 'x',
          topico_nome: 'x',
          data_estudo: '2026-11-16',
          data_revisao: '2026-11-17',
          intervalo: 3,
          origem: 'sessao',
        })
        .select(),
    );
    falhou(await c.from('ajustes_plano').update({ visto: true }).eq('id', aj!.id).select());
    falhou(await c.from('ajustes_plano').delete().eq('id', aj!.id).select());
    falhou(await c.from('ajustes_plano').insert(novoAjuste(planoId)).select());

    const { data: intactos } = await admin().from('sessoes_estudo').select('minutos').eq('id', sessao).single();
    expect(intactos!.minutos).toBe(30);
  });

  it('registrar_sessao não duplica revisão pendente', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-dup'));
    const p = await criarPlano(u.id);
    await registrar(u.id, p);
    await registrar(u.id, p);
    const { data: revs } = await admin().from('revisoes').select('intervalo').eq('plano_id', p).is('concluida_em', null);
    expect(revs!.map((r) => r.intervalo).sort((a, b) => a - b)).toEqual([1, 7]);
    const { data: sess } = await admin().from('sessoes_estudo').select('id').eq('plano_id', p);
    expect(sess).toHaveLength(2);
  });

  it('registrar_sessao com p_concluir grava topicos_concluidos', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-conc'));
    const p = await criarPlano(u.id);
    await registrar(u.id, p, true);
    await registrar(u.id, p, true); // idempotente
    const { data } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', p);
    expect(data).toEqual([{ topico_id: 'd0-t0' }]);
  });

  it('excluir_sessao apaga só as pendentes da sessão', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-exc'));
    const p = await criarPlano(u.id);
    const sessao = await registrar(u.id, p);
    await admin()
      .from('revisoes')
      .update({ concluida_em: new Date().toISOString() })
      .eq('sessao_id', sessao)
      .eq('intervalo', 1);

    const { data: outroDono } = await admin().rpc('excluir_sessao', { p_user: outro.id, p_sessao: sessao });
    expect(outroDono).toBe(false);
    const { data: ok } = await admin().rpc('excluir_sessao', { p_user: u.id, p_sessao: sessao });
    expect(ok).toBe(true);
    const { data: nova } = await admin().rpc('excluir_sessao', { p_user: u.id, p_sessao: sessao });
    expect(nova).toBe(false);

    const { data: revs } = await admin().from('revisoes').select('intervalo, sessao_id').eq('plano_id', p);
    expect(revs).toEqual([{ intervalo: 1, sessao_id: null }]);
    expect((await admin().from('sessoes_estudo').select('id').eq('id', sessao)).data).toEqual([]);
  });

  it('aplicar_ajuste com ajustado_em velho devolve null e não grava', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-aj'));
    const p = await criarPlano(u.id);
    await admin().from('planos').update({ ativo: true }).eq('id', p);
    const args = (agora: string) => ({
      p_plano: p,
      p_ajustado_lido: null,
      p_fila_lida: 0,
      p_gerado: { modo: 'ciclo', ajustado: true },
      p_ajustes: { d0: 1.25 },
      p_fila_posicao: 3,
      p_fila_desde: '2026-11-17',
      p_janela_inicio: '2026-10-19',
      p_janela_fim: '2026-11-16',
      p_resumo: [{ tipo: 'aumentou', disciplina_id: 'd0' }],
      p_gerado_anterior: { modo: 'ciclo' },
      p_multiplicadores: { d0: 1.25 },
      p_agora: agora,
    });
    const a = await admin().rpc('aplicar_ajuste', args('2026-11-16T15:00:00Z'));
    const b = await admin().rpc('aplicar_ajuste', args('2026-11-16T15:00:01Z'));
    expect(a.error).toBeNull();
    expect(a.data).toMatch(/^[0-9a-f-]{36}$/);
    expect(b.error).toBeNull();
    expect(b.data).toBeNull();
    expect((await admin().from('ajustes_plano').select('id').eq('plano_id', p)).data).toHaveLength(1);
    const { data: plano } = await admin()
      .from('planos')
      .select('ajustes, fila_posicao, fila_desde, ajustado_em, gerado')
      .eq('id', p)
      .single();
    expect(plano!.ajustes).toEqual({ d0: 1.25 });
    expect(plano!.fila_posicao).toBe(3);
    expect(plano!.fila_desde).toBe('2026-11-17');
    expect(new Date(plano!.ajustado_em).toISOString()).toBe('2026-11-16T15:00:00.000Z');
    expect(plano!.gerado).toEqual({ modo: 'ciclo', ajustado: true });
  });

  it('aplicar_ajuste com p_fila_lida velho devolve null e não grava', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-fila'));
    const p = await criarPlano(u.id);
    // A posição mudou (concluiu um bloco) entre a leitura do ajuste e a gravação.
    await admin().from('planos').update({ ativo: true, fila_posicao: 4 }).eq('id', p);
    const r = await admin().rpc('aplicar_ajuste', {
      p_plano: p,
      p_ajustado_lido: null,
      p_fila_lida: 3,
      p_gerado: { modo: 'ciclo', ajustado: true },
      p_ajustes: { d0: 1.25 },
      p_fila_posicao: 0,
      p_fila_desde: '2026-11-17',
      p_janela_inicio: '2026-10-19',
      p_janela_fim: '2026-11-16',
      p_resumo: [],
      p_gerado_anterior: { modo: 'ciclo' },
      p_multiplicadores: {},
      p_agora: '2026-11-16T15:00:00Z',
    });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
    expect((await admin().from('ajustes_plano').select('id').eq('plano_id', p)).data).toEqual([]);
    const { data: plano } = await admin()
      .from('planos')
      .select('ajustes, fila_posicao, fila_desde, ajustado_em, gerado')
      .eq('id', p)
      .single();
    expect(plano).toEqual({ ajustes: {}, fila_posicao: 4, fila_desde: null, ajustado_em: null, gerado: { modo: 'ciclo' } });
  });

  describe('checks', () => {
    const inserir = (extra: Record<string, unknown>) =>
      admin().from('sessoes_estudo').insert(sessaoBase(dono.id, planoId, extra));

    it('minutos = 0 sem questões é erro; com questões passa', async () => {
      expect((await inserir({ minutos: 0 })).error).not.toBeNull();
      expect((await inserir({ minutos: 0, acertos: 3, erros: 1 })).error).toBeNull();
      expect((await inserir({ minutos: 1441 })).error).not.toBeNull();
      expect((await inserir({ acertos: -1 })).error).not.toBeNull();
    });
    it('observacao com 1001 caracteres é erro', async () => {
      expect((await inserir({ observacao: 'x'.repeat(1001) })).error).not.toBeNull();
      expect((await inserir({ observacao: 'x'.repeat(1000) })).error).toBeNull();
    });
    it("tipo 'outro' e origem inválida são erro; tipo nulo passa", async () => {
      expect((await inserir({ tipo: 'outro' })).error).not.toBeNull();
      expect((await inserir({ origem: 'automatica' })).error).not.toBeNull();
      expect((await inserir({ tipo: null })).error).toBeNull();
    });
    it('revisão com intervalo 0 ou origem inválida é erro', async () => {
      const rev = (extra: Record<string, unknown>) =>
        admin()
          .from('revisoes')
          .insert({
            user_id: dono.id,
            plano_id: planoId,
            disciplina_id: 'd0',
            disciplina_nome: 'P',
            topico_id: `t-${randomUUID()}`,
            topico_nome: 'T',
            data_estudo: '2026-11-16',
            data_revisao: '2026-11-17',
            intervalo: 1,
            origem: 'sessao',
            ...extra,
          });
      expect((await rev({ intervalo: 0 })).error).not.toBeNull();
      expect((await rev({ origem: 'x' })).error).not.toBeNull();
      expect((await rev({})).error).toBeNull();
    });
  });
});

describe('acompanhamento (funções)', () => {
  it('authenticated não executa registrar_sessao, excluir_sessao nem aplicar_ajuste', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-rpc'));
    const p = await criarPlano(u.id);
    const sessao = await registrar(u.id, p);

    const reg = await u.cliente.rpc('registrar_sessao', {
      p_user: u.id,
      p_plano: p,
      p_sessao: { data: '2026-11-16', disciplina_id: 'd0', disciplina_nome: 'P', minutos: 5, origem: 'manual' },
      p_revisoes: [],
      p_concluir: false,
    });
    expect(reg.error).not.toBeNull();
    expect(reg.error!.code).toBe('42501');

    const exc = await u.cliente.rpc('excluir_sessao', { p_user: u.id, p_sessao: sessao });
    expect(exc.error).not.toBeNull();
    expect(exc.error!.code).toBe('42501');
    expect((await admin().from('sessoes_estudo').select('id').eq('id', sessao)).data).toHaveLength(1);

    const aj = await u.cliente.rpc('aplicar_ajuste', {
      p_plano: p,
      p_ajustado_lido: null,
      p_fila_lida: 0,
      p_gerado: {},
      p_ajustes: {},
      p_fila_posicao: null,
      p_fila_desde: null,
      p_janela_inicio: '2026-10-19',
      p_janela_fim: '2026-11-16',
      p_resumo: [],
      p_gerado_anterior: {},
      p_multiplicadores: {},
      p_agora: '2026-11-16T15:00:00Z',
    });
    expect(aj.error).not.toBeNull();
    expect(aj.error!.code).toBe('42501');
  });

  it('registrar_sessao com o plano de outro usuário dá erro e não grava', async () => {
    const a = await criarUsuarioTeste(emailUnico('acomp-a'));
    const b = await criarUsuarioTeste(emailUnico('acomp-b'));
    const planoDeB = await criarPlano(b.id);
    await expect(registrar(a.id, planoDeB)).rejects.toMatchObject({ code: 'P0002' });
    expect((await admin().from('sessoes_estudo').select('id').eq('plano_id', planoDeB)).data).toEqual([]);
  });

  it('aplicar_ajuste em plano inativo devolve null e não grava', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-inativo'));
    const p = await criarPlano(u.id); // ativo: false
    const r = await admin().rpc('aplicar_ajuste', {
      p_plano: p,
      p_ajustado_lido: null,
      p_fila_lida: 0,
      p_gerado: { x: 1 },
      p_ajustes: {},
      p_fila_posicao: null,
      p_fila_desde: null,
      p_janela_inicio: '2026-10-19',
      p_janela_fim: '2026-11-16',
      p_resumo: [],
      p_gerado_anterior: {},
      p_multiplicadores: {},
      p_agora: '2026-11-16T15:00:00Z',
    });
    expect(r.error).toBeNull();
    expect(r.data).toBeNull();
    expect((await admin().from('ajustes_plano').select('id').eq('plano_id', p)).data).toEqual([]);
  });

  it('excluir_sessao re-aponta as pendentes para a sessão mais recente do mesmo tópico', async () => {
    const u = await criarUsuarioTeste(emailUnico('acomp-reaponta'));
    const p = await criarPlano(u.id);
    const primeira = await registrar(u.id, p);
    const segunda = await registrar(u.id, p); // dedupe: nenhuma revisão nova
    expect((await admin().rpc('excluir_sessao', { p_user: u.id, p_sessao: primeira })).data).toBe(true);
    const { data } = await admin().from('revisoes').select('sessao_id').eq('plano_id', p);
    expect(data).toHaveLength(2);
    expect(data!.every((r) => r.sessao_id === segunda)).toBe(true);
  });
});
