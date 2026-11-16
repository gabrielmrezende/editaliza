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

  it('topicos_concluidos so pelo dono do plano', async () => {
    const { data: p } = await admin()
      .from('planos')
      .insert(novoPlano(a.id, { ativo: false }))
      .select('id')
      .single();
    const { error: eB } = await b.cliente
      .from('topicos_concluidos')
      .insert({ plano_id: p!.id, topico_id: 't1' });
    expect(eB).not.toBeNull();
    const { error: eA } = await a.cliente
      .from('topicos_concluidos')
      .insert({ plano_id: p!.id, topico_id: 't1' });
    expect(eA).toBeNull();
    const { data } = await b.cliente.from('topicos_concluidos').select('topico_id');
    expect(data).toEqual([]);
  });

  it('storage: upload so em tmp/{uid}/ e sem leitura', async () => {
    const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    const ok = await a.cliente.storage
      .from('editais')
      .upload(`tmp/${a.id}/${randomUUID()}.pdf`, pdf);
    expect(ok.error).toBeNull();
    const alheio = await a.cliente.storage
      .from('editais')
      .upload(`tmp/${b.id}/${randomUUID()}.pdf`, pdf);
    expect(alheio.error).not.toBeNull();
    const raiz = await a.cliente.storage.from('editais').upload(`${randomUUID()}.pdf`, pdf);
    expect(raiz.error).not.toBeNull();
  });
});
