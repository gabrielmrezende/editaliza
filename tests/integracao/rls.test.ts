import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';

let a: { id: string; cliente: SupabaseClient };
let b: { id: string; cliente: SupabaseClient };

const novoEdital = (extra: Record<string, unknown> = {}) => ({
  sha256: randomUUID(),
  storage_path: 'x.pdf',
  status: 'pronto',
  ...extra,
});

const novoPlano = (userId: string, extra: Record<string, unknown> = {}) => ({
  user_id: userId,
  minutos_por_dia: [60, 60, 60, 60, 60, 0, 0],
  conteudo: [],
  gerado: {},
  ...extra,
});

beforeAll(async () => {
  a = await criarUsuarioTeste(emailUnico('a'));
  b = await criarUsuarioTeste(emailUnico('b'));
});

describe('RLS', () => {
  it('usuario B nao le plano de A', async () => {
    const { error: e } = await admin().from('planos').insert(novoPlano(a.id));
    expect(e).toBeNull();
    const { data: dA } = await a.cliente.from('planos').select('id');
    expect(dA).toHaveLength(1);
    const { data, error } = await b.cliente.from('planos').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('usuario nao le edital sem acesso', async () => {
    const { data: ed, error: e } = await admin()
      .from('editais')
      .insert(novoEdital())
      .select('id')
      .single();
    expect(e).toBeNull();
    const { data: antes } = await a.cliente.from('editais').select('id').eq('id', ed!.id);
    expect(antes).toEqual([]);
    await admin().from('edital_acessos').insert({ user_id: a.id, edital_id: ed!.id });
    const { data: depois } = await a.cliente.from('editais').select('id').eq('id', ed!.id);
    expect(depois).toHaveLength(1);
  });

  it('edital publicado e visivel a todos', async () => {
    const { data: ed } = await admin()
      .from('editais')
      .insert(novoEdital({ publicado: true }))
      .select('id')
      .single();
    const { data } = await b.cliente.from('editais').select('id').eq('id', ed!.id);
    expect(data).toHaveLength(1);
  });

  it('cliente nao consegue inserir em editais', async () => {
    const { error } = await a.cliente.from('editais').insert(novoEdital());
    expect(error).not.toBeNull();
  });

  it('so um plano ativo por usuario', async () => {
    const { error: e1 } = await admin().from('planos').insert(novoPlano(b.id));
    expect(e1).toBeNull();
    const { error: e2 } = await admin().from('planos').insert(novoPlano(b.id));
    expect(e2).not.toBeNull();
    const { error: e3 } = await admin().from('planos').insert(novoPlano(b.id, { ativo: false }));
    expect(e3).toBeNull();
  });

  it('minutos_por_dia exige 7 posicoes', async () => {
    const { error } = await admin()
      .from('planos')
      .insert(novoPlano(b.id, { ativo: false, minutos_por_dia: [1, 2, 3] }));
    expect(error).not.toBeNull();
  });

  it('topicos_concluidos: dono so le; ninguem grava direto (so a API)', async () => {
    const { data: p } = await admin()
      .from('planos')
      .insert(novoPlano(a.id, { ativo: false }))
      .select('id')
      .single();
    for (const cli of [a.cliente, b.cliente]) {
      const { error } = await cli.from('topicos_concluidos').insert({ plano_id: p!.id, topico_id: 't1' });
      expect(error?.code).toBe('42501');
    }
    await admin().from('topicos_concluidos').insert({ plano_id: p!.id, topico_id: 't2' });
    const { data: deA } = await a.cliente.from('topicos_concluidos').select('topico_id').eq('plano_id', p!.id);
    expect(deA).toEqual([{ topico_id: 't2' }]);
    const { data: deB } = await b.cliente.from('topicos_concluidos').select('topico_id');
    expect(deB).toEqual([]);
    const up = await a.cliente.from('topicos_concluidos').update({ topico_id: 'x' }).eq('plano_id', p!.id);
    expect(up.error?.code).toBe('42501');
    const del = await a.cliente.from('topicos_concluidos').delete().eq('plano_id', p!.id);
    expect(del.error?.code).toBe('42501');
    const { data: restou } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', p!.id);
    expect(restou).toEqual([{ topico_id: 't2' }]);
  });

  it('planos: cliente nao insere nem altera nem o proprio (so a API); pode apagar o proprio', async () => {
    const ins = await a.cliente.from('planos').insert(novoPlano(a.id, { ativo: false }));
    expect(ins.error?.code).toBe('42501');
    const { data: p } = await admin()
      .from('planos')
      .insert(novoPlano(a.id, { ativo: false, edital_versao: 1 }))
      .select('id')
      .single();
    const up = await a.cliente.from('planos').update({ edital_versao: 99 }).eq('id', p!.id);
    expect(up.error?.code).toBe('42501');
    const { data: igual } = await admin().from('planos').select('edital_versao').eq('id', p!.id);
    expect(igual).toEqual([{ edital_versao: 1 }]);
    const del = await a.cliente.from('planos').delete().eq('id', p!.id).select('id');
    expect(del.error).toBeNull();
    expect(del.data).toEqual([{ id: p!.id }]);
  });

  it('B nao insere plano com user_id de A', async () => {
    const { error } = await b.cliente.from('planos').insert(novoPlano(a.id, { ativo: false }));
    expect(error?.code).toBe('42501');
  });

  it('B nao atualiza nem apaga plano de A', async () => {
    const { data: p } = await admin()
      .from('planos')
      .insert(novoPlano(a.id, { ativo: false, edital_versao: 1 }))
      .select('id')
      .single();
    const up = await b.cliente
      .from('planos')
      .update({ edital_versao: 99 })
      .eq('id', p!.id)
      .select('id');
    expect(up.error?.code).toBe('42501');
    const del = await b.cliente.from('planos').delete().eq('id', p!.id).select('id');
    expect(del.error).toBeNull();
    expect(del.data).toEqual([]);
    const { data: depois } = await admin().from('planos').select('edital_versao').eq('id', p!.id);
    expect(depois).toEqual([{ edital_versao: 1 }]);
  });

  it('A nao transfere o proprio plano para B (WITH CHECK do UPDATE)', async () => {
    const { data: p } = await admin()
      .from('planos')
      .insert(novoPlano(a.id, { ativo: false }))
      .select('id')
      .single();
    const { error } = await a.cliente.from('planos').update({ user_id: b.id }).eq('id', p!.id);
    expect(error?.code).toBe('42501');
    const { data } = await admin().from('planos').select('user_id').eq('id', p!.id);
    expect(data).toEqual([{ user_id: a.id }]);
  });

  it('cliente nao se concede acesso a edital (edital_acessos)', async () => {
    const { data: ed } = await admin().from('editais').insert(novoEdital()).select('id').single();
    const own = await a.cliente.from('edital_acessos').insert({ user_id: a.id, edital_id: ed!.id });
    expect(own.error?.code).toBe('42501');
    const other = await a.cliente.from('edital_acessos').insert({ user_id: b.id, edital_id: ed!.id });
    expect(other.error?.code).toBe('42501');
    const { data } = await admin().from('edital_acessos').select('user_id').eq('edital_id', ed!.id);
    expect(data).toEqual([]);
  });

  it('cliente nao altera nem apaga editais, cargos e acessos', async () => {
    const { data: ed } = await admin()
      .from('editais')
      .insert(novoEdital({ publicado: true, orgao: 'ORIG' }))
      .select('id')
      .single();
    const { data: cg } = await admin()
      .from('edital_cargos')
      .insert({ edital_id: ed!.id, nome: 'ORIG' })
      .select('id')
      .single();
    await admin().from('edital_acessos').insert({ user_id: a.id, edital_id: ed!.id });

    const ups = [
      await a.cliente.from('editais').update({ orgao: 'HACK' }).eq('id', ed!.id).select('id'),
      await a.cliente.from('edital_cargos').update({ nome: 'HACK' }).eq('id', cg!.id).select('id'),
      await a.cliente
        .from('edital_acessos')
        .update({ edital_id: ed!.id })
        .eq('user_id', a.id)
        .select('user_id'),
    ];
    const dels = [
      await a.cliente.from('editais').delete().eq('id', ed!.id).select('id'),
      await a.cliente.from('edital_cargos').delete().eq('id', cg!.id).select('id'),
      await a.cliente.from('edital_acessos').delete().eq('edital_id', ed!.id).select('user_id'),
    ];
    for (const r of [...ups, ...dels]) {
      // sem GRANT => erro 42501; com GRANT sem policy => 0 linhas. Nunca altera.
      expect(r.error?.code === '42501' || (r.error === null && r.data?.length === 0)).toBe(true);
    }
    const { data: e2 } = await admin().from('editais').select('orgao').eq('id', ed!.id);
    expect(e2).toEqual([{ orgao: 'ORIG' }]);
    const { data: c2 } = await admin().from('edital_cargos').select('nome').eq('id', cg!.id);
    expect(c2).toEqual([{ nome: 'ORIG' }]);
    const { data: a2 } = await admin().from('edital_acessos').select('user_id').eq('edital_id', ed!.id);
    expect(a2).toHaveLength(1);
  });

  it('cliente nao le colunas internas de editais', async () => {
    const { data: ed } = await admin()
      .from('editais')
      .insert(novoEdital({ publicado: true }))
      .select('id')
      .single();
    for (const col of ['sha256', 'storage_path', 'anthropic_file_id', 'enviado_por', 'custo_centavos', '*']) {
      const { error } = await a.cliente.from('editais').select(col).eq('id', ed!.id);
      expect(error?.code, col).toBe('42501');
    }
    const { data, error } = await a.cliente
      .from('editais')
      .select('id, orgao, banca, ano, data_prova, status, erro, publicado, versao, edital_origem_id, created_at')
      .eq('id', ed!.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('storage: A so envia por URL assinada e nao le, lista nem sobrescreve', async () => {
    const pdf = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const caminho = `tmp/${a.id}/${randomUUID()}.pdf`;
    const st = a.cliente.storage.from('editais');

    // Envio direto, sem URL assinada, nem na própria pasta.
    const direto = await st.upload(caminho, pdf());
    expect(direto.error?.message).toMatch(/row-level security|unauthorized|not authorized/i);
    // Com a URL assinada criada pelo servidor (controle positivo).
    const { data: assinada } = await admin().storage.from('editais').createSignedUploadUrl(caminho);
    const ok = await st.uploadToSignedUrl(caminho, assinada!.token, pdf());
    expect(ok.error).toBeNull();

    const dl = await st.download(caminho);
    expect(dl.error).not.toBeNull();
    const ls = await st.list(`tmp/${a.id}`);
    expect(ls.error).toBeNull();
    expect(ls.data).toEqual([]);
    const over = await st.upload(caminho, pdf(), { upsert: true });
    expect(over.error).not.toBeNull();
    expect(over.error?.message).toMatch(/row-level security|unauthorized|not authorized/i);

    const alheio = await st.upload(`tmp/${b.id}/${randomUUID()}.pdf`, pdf());
    expect(alheio.error?.message).toMatch(/row-level security|unauthorized|not authorized/i);
    const raiz = await st.upload(`${randomUUID()}.pdf`, pdf());
    expect(raiz.error?.message).toMatch(/row-level security|unauthorized|not authorized/i);
  });

  it('storage: rejeita mime nao-PDF mesmo com URL assinada', async () => {
    const txt = new Blob(['oi'], { type: 'text/plain' });
    const caminho = `tmp/${a.id}/${randomUUID()}.txt`;
    const { data: assinada } = await admin().storage.from('editais').createSignedUploadUrl(caminho);
    const { error } = await a.cliente.storage.from('editais').uploadToSignedUrl(caminho, assinada!.token, txt);
    expect(error?.message).toMatch(/mime/i);
  });
});
