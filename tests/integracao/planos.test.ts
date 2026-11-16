import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';
import type { ConteudoCargo, DisciplinaPlano, MinutosPorDia, PlanoGerado } from '@/lib/dominio/tipos';

const { criarPlano, marcarTopico, PlanoInvalidoError } = await import('@/lib/planos/servico');

const AGORA = new Date('2026-11-16T15:00:00Z'); // 12h em São Paulo
const MINUTOS: MinutosPorDia = [0, 120, 120, 120, 120, 120, 240];

const conteudoBase = (pesosInformados: boolean): ConteudoCargo => ({
  tipoProva: 'multipla_escolha',
  pesosInformados,
  disciplinas: [
    { id: 'd0', nome: 'Português', questoes: 20, pontos: null, topicos: [{ id: 'd0-t0', nome: 'Crase' }, { id: 'd0-t1', nome: 'Pontuação' }] },
    { id: 'd1', nome: 'Direito', questoes: 10, pontos: null, topicos: [{ id: 'd1-t0', nome: 'Atos' }] },
  ],
});

const disciplinasDe = (c: ConteudoCargo): DisciplinaPlano[] => c.disciplinas.map((d) => ({ ...d, nivel: 'basico' }));

/** Edital pronto com um cargo; o acesso é dado só a quem for passado. */
async function criarEdital(opcoes: { acesso?: string[]; pesosInformados?: boolean; statusCargo?: string; versao?: number } = {}) {
  const db = admin();
  const { data: edital, error } = await db
    .from('editais')
    .insert({ sha256: randomUUID(), storage_path: 'x.pdf', status: 'pronto', versao: opcoes.versao ?? 1 })
    .select('id')
    .single();
  if (error) throw error;
  const conteudo = conteudoBase(opcoes.pesosInformados ?? true);
  const status = opcoes.statusCargo ?? 'pronto';
  const { data: cargo, error: errCargo } = await db
    .from('edital_cargos')
    .insert({ edital_id: edital.id, nome: 'Cargo', status_conteudo: status, conteudo: status === 'pronto' ? conteudo : null })
    .select('id')
    .single();
  if (errCargo) throw errCargo;
  for (const userId of opcoes.acesso ?? []) {
    const { error: errAcesso } = await db.from('edital_acessos').insert({ user_id: userId, edital_id: edital.id });
    if (errAcesso) throw errAcesso;
  }
  return { editalId: edital.id as string, cargoId: cargo.id as string, conteudo };
}

const entrada = (e: { editalId: string; cargoId: string; conteudo: ConteudoCargo }, extra: Partial<{ dataProva: string | null }> = {}) => ({
  editalId: e.editalId,
  cargoId: e.cargoId,
  dataProva: '2027-02-14',
  minutosPorDia: MINUTOS,
  disciplinas: disciplinasDe(e.conteudo),
  ...extra,
});

async function esperarErro(p: Promise<unknown>, status: number, mensagem?: string) {
  const erro = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(PlanoInvalidoError);
  expect((erro as InstanceType<typeof PlanoInvalidoError>).status).toBe(status);
  if (mensagem) expect((erro as Error).message).toBe(mensagem);
}

async function linhaPlano(id: string) {
  const { data, error } = await admin().from('planos').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

describe('planos (serviço)', () => {
  let usuario: Awaited<ReturnType<typeof criarUsuarioTeste>>;
  let outro: Awaited<ReturnType<typeof criarUsuarioTeste>>;

  beforeAll(async () => {
    usuario = await criarUsuarioTeste(emailUnico('planos'));
    outro = await criarUsuarioTeste(emailUnico('planos-outro'));
  });

  it('cria plano ativo com versao do edital e plano gerado no servidor', async () => {
    const e = await criarEdital({ acesso: [usuario.id], versao: 3 });
    const planoId = await criarPlano(usuario.id, entrada(e), AGORA);
    const p = await linhaPlano(planoId);
    expect(p).toMatchObject({ user_id: usuario.id, edital_id: e.editalId, cargo_id: e.cargoId, edital_versao: 3, ativo: true, data_prova: '2027-02-14' });
    expect(p.minutos_por_dia).toEqual(MINUTOS);
    const gerado = p.gerado as PlanoGerado;
    expect(gerado.modo).toBe('prazo');
    // hoje = 2026-11-16 (São Paulo): o primeiro dia do plano é hoje
    if (gerado.modo === 'prazo') expect(gerado.dias[0].data).toBe('2026-11-16');
  });

  it('pesos: do banco ou das questoes preenchidas, nunca da flag do cliente', async () => {
    const semPesos = await criarEdital({ acesso: [usuario.id], pesosInformados: false });
    const comPesos = await criarEdital({ acesso: [usuario.id], pesosInformados: true });
    const avisos = async (e: Parameters<typeof entrada>[0], disciplinas: DisciplinaPlano[]) => {
      const forjado = { ...entrada(e), disciplinas, pesosInformados: true } as ReturnType<typeof entrada>;
      return ((await linhaPlano(await criarPlano(usuario.id, forjado, AGORA))).gerado as PlanoGerado).avisos;
    };
    const semNumeros = disciplinasDe(semPesos.conteudo).map((d) => ({ ...d, questoes: null, pontos: null }));
    const zerados = disciplinasDe(semPesos.conteudo).map((d) => ({ ...d, questoes: 0, pontos: 0 }));
    const umaPreenchida = semNumeros.map((d, i) => (i === 0 ? { ...d, questoes: 12 } : d));

    // edital sem pesos e aluno sem números: peso igual, mesmo com a flag forjada
    expect(await avisos(semPesos, semNumeros)).toContainEqual({ tipo: 'pesos_assumidos' });
    expect(await avisos(semPesos, zerados)).toContainEqual({ tipo: 'pesos_assumidos' });
    // edital sem pesos, mas o aluno preencheu questões na revisão
    expect(await avisos(semPesos, umaPreenchida)).not.toContainEqual({ tipo: 'pesos_assumidos' });
    // edital com pesos
    expect(await avisos(comPesos, disciplinasDe(comPesos.conteudo))).not.toContainEqual({ tipo: 'pesos_assumidos' });
  });

  it('semana sem horas responde 400', async () => {
    const e = await criarEdital({ acesso: [usuario.id] });
    const zerado = { ...entrada(e), minutosPorDia: [0, 0, 0, 0, 0, 0, 0] as MinutosPorDia };
    await esperarErro(criarPlano(usuario.id, zerado, AGORA), 400, 'Informe ao menos um dia com horas de estudo.');
  });

  it('sem acesso ao edital responde 404', async () => {
    const e = await criarEdital({ acesso: [outro.id] });
    await esperarErro(criarPlano(usuario.id, entrada(e), AGORA), 404);
  });

  it('cargo de outro edital responde 404', async () => {
    const a = await criarEdital({ acesso: [usuario.id] });
    const b = await criarEdital({ acesso: [usuario.id] });
    await esperarErro(criarPlano(usuario.id, { ...entrada(a), cargoId: b.cargoId }, AGORA), 404);
  });

  it('cargo sem conteudo pronto responde 409', async () => {
    const e = await criarEdital({ acesso: [usuario.id], statusCargo: 'processando' });
    await esperarErro(criarPlano(usuario.id, entrada(e), AGORA), 409);
  });

  it('data da prova hoje ou no passado responde 400', async () => {
    const e = await criarEdital({ acesso: [usuario.id] });
    const msg = 'A data da prova precisa ser depois de hoje.';
    await esperarErro(criarPlano(usuario.id, entrada(e, { dataProva: '2026-11-16' }), AGORA), 400, msg);
    await esperarErro(criarPlano(usuario.id, entrada(e, { dataProva: '2026-01-01' }), AGORA), 400, msg);
    // 23h30 de 16/11 em São Paulo ainda é dia 16, embora em UTC já seja 17
    const noite = new Date('2026-11-17T02:30:00Z');
    await esperarErro(criarPlano(usuario.id, entrada(e, { dataProva: '2026-11-16' }), noite), 400, msg);
    expect(await criarPlano(usuario.id, entrada(e, { dataProva: '2026-11-17' }), noite)).toBeTruthy();
  });

  it('sem data da prova gera ciclo', async () => {
    const e = await criarEdital({ acesso: [usuario.id] });
    const p = await linhaPlano(await criarPlano(usuario.id, entrada(e, { dataProva: null }), AGORA));
    expect(p.data_prova).toBeNull();
    expect((p.gerado as PlanoGerado).modo).toBe('ciclo');
  });

  it('ids de topicos repetidos respondem 400', async () => {
    const e = await criarEdital({ acesso: [usuario.id] });
    const disciplinas = disciplinasDe(e.conteudo);
    disciplinas[1].topicos.push({ id: 'd0-t0', nome: 'Duplicado' });
    await esperarErro(criarPlano(usuario.id, { ...entrada(e), disciplinas }, AGORA), 400);
  });

  it('conteudo grande demais responde 400', async () => {
    const e = await criarEdital({ acesso: [usuario.id] });
    const disciplinas = disciplinasDe(e.conteudo);
    disciplinas[0].topicos = Array.from({ length: 3001 }, (_, i) => ({ id: `d0-x${i}`, nome: 'T' }));
    await esperarErro(criarPlano(usuario.id, { ...entrada(e), disciplinas }, AGORA), 400);
    const longo = disciplinasDe(e.conteudo);
    longo[0].nome = 'x'.repeat(301);
    await esperarErro(criarPlano(usuario.id, { ...entrada(e), disciplinas: longo }, AGORA), 400);
  });

  it('novo plano desativa o anterior, inclusive em paralelo', async () => {
    const u = await criarUsuarioTeste(emailUnico('planos-ativo'));
    const e = await criarEdital({ acesso: [u.id] });
    const primeiro = await criarPlano(u.id, entrada(e), AGORA);
    const segundo = await criarPlano(u.id, entrada(e), AGORA);
    expect((await linhaPlano(primeiro)).ativo).toBe(false);
    expect((await linhaPlano(segundo)).ativo).toBe(true);

    const paralelos = await Promise.all([criarPlano(u.id, entrada(e), AGORA), criarPlano(u.id, entrada(e), AGORA)]);
    const { data } = await admin().from('planos').select('id').eq('user_id', u.id).eq('ativo', true);
    expect(data).toHaveLength(1);
    expect(paralelos).toContain(data![0].id);
  });

  it('data da prova a mais de 3 anos responde 400', async () => {
    const e = await criarEdital({ acesso: [usuario.id] });
    // hoje = 2026-11-16; +1096 dias = 2029-11-16
    expect(await criarPlano(usuario.id, entrada(e, { dataProva: '2029-11-16' }), AGORA)).toBeTruthy();
    const msg = 'A data da prova precisa estar nos próximos 3 anos.';
    await esperarErro(criarPlano(usuario.id, entrada(e, { dataProva: '2029-11-17' }), AGORA), 400, msg);
    await esperarErro(criarPlano(usuario.id, entrada(e, { dataProva: '9999-12-31' }), AGORA), 400, msg);
  });

  it('novo plano do mesmo cargo leva os topicos concluidos que ainda existem', async () => {
    const u = await criarUsuarioTeste(emailUnico('planos-progresso'));
    const e = await criarEdital({ acesso: [u.id] });
    const primeiro = await criarPlano(u.id, entrada(e), AGORA);
    await marcarTopico(u.id, primeiro, 'd0-t0', true);
    await marcarTopico(u.id, primeiro, 'd1-t0', true);
    const { data: antes } = await admin().from('topicos_concluidos').select('topico_id, concluido_em').eq('plano_id', primeiro);

    // O aluno removeu "Atos" (d1-t0) na nova revisão.
    const disciplinas = disciplinasDe(e.conteudo);
    disciplinas[1].topicos = [{ id: 'd1-t9', nome: 'Novo' }];
    const segundo = await criarPlano(u.id, { ...entrada(e), disciplinas }, AGORA);
    const { data: depois } = await admin().from('topicos_concluidos').select('topico_id, concluido_em').eq('plano_id', segundo);
    expect(depois).toEqual(antes!.filter((c) => c.topico_id === 'd0-t0'));
    // O plano novo já não agenda o tópico concluído.
    const gerado = (await linhaPlano(segundo)).gerado as PlanoGerado;
    if (gerado.modo !== 'prazo') throw new Error('esperava prazo');
    const agendados = new Set(gerado.dias.flatMap((d) => d.blocos.map((b) => b.topicoId)));
    expect(agendados.has('d0-t0')).toBe(false);
    expect(agendados.has('d0-t1')).toBe(true);

    // Outro cargo não herda nada.
    const outroCargo = await criarEdital({ acesso: [u.id] });
    const terceiro = await criarPlano(u.id, entrada(outroCargo), AGORA);
    const { data: nada } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', terceiro);
    expect(nada).toEqual([]);
  });

  it('novo plano do mesmo cargo leva sessões e revisões pendentes', async () => {
    const u = await criarUsuarioTeste(emailUnico('planos-sessoes'));
    const e = await criarEdital({ acesso: [u.id] });
    const antigo = await criarPlano(u.id, entrada(e), AGORA);
    const db = admin();
    const sessao = (disciplina: string, nome: string) => ({
      user_id: u.id,
      plano_id: antigo,
      data: '2026-11-16',
      disciplina_id: disciplina,
      disciplina_nome: nome,
      minutos: 30,
      origem: 'manual',
    });
    const { data: sessoes, error } = await db
      .from('sessoes_estudo')
      .insert([sessao('d0', 'Português'), sessao('d9', 'Extinta')])
      .select('id, disciplina_id');
    if (error) throw error;
    const revisao = (extra: Record<string, unknown>) => ({
      user_id: u.id,
      plano_id: antigo,
      disciplina_id: 'd0',
      disciplina_nome: 'Português',
      topico_id: 'd0-t0',
      topico_nome: 'Crase',
      data_estudo: '2026-11-16',
      data_revisao: '2026-11-17',
      origem: 'sessao',
      ...extra,
    });
    const { error: errRev } = await db
      .from('revisoes')
      .insert([revisao({ intervalo: 1 }), revisao({ intervalo: 7, concluida_em: '2026-11-16T12:00:00Z' })]);
    if (errRev) throw errRev;

    const novo = await criarPlano(u.id, entrada(e), AGORA);
    const { data: depois } = await db
      .from('sessoes_estudo')
      .select('disciplina_id, plano_id')
      .in('id', sessoes!.map((s) => s.id));
    const planoDe = (d: string) => depois!.find((s) => s.disciplina_id === d)!.plano_id;
    expect(planoDe('d0')).toBe(novo);
    expect(planoDe('d9')).toBe(antigo);
    const { data: revs } = await db.from('revisoes').select('plano_id, concluida_em').eq('user_id', u.id);
    expect(revs!.find((r) => r.concluida_em === null)!.plano_id).toBe(novo);
    expect(revs!.find((r) => r.concluida_em !== null)!.plano_id).toBe(antigo);
  });

  describe('marcarTopico', () => {
    let planoId: string;

    beforeAll(async () => {
      const e = await criarEdital({ acesso: [usuario.id] });
      planoId = await criarPlano(usuario.id, entrada(e), AGORA);
    });

    async function concluidos() {
      const { data } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', planoId);
      return data!.map((x) => x.topico_id);
    }

    it('marca e desmarca (idempotente)', async () => {
      await marcarTopico(usuario.id, planoId, 'd0-t1', true);
      await marcarTopico(usuario.id, planoId, 'd0-t1', true);
      expect(await concluidos()).toEqual(['d0-t1']);
      await marcarTopico(usuario.id, planoId, 'd0-t1', false);
      await marcarTopico(usuario.id, planoId, 'd0-t1', false);
      expect(await concluidos()).toEqual([]);
    });

    it('topico que nao existe no plano responde 400', async () => {
      await esperarErro(marcarTopico(usuario.id, planoId, 'd9-t9', true), 400);
    });

    it('plano de outro usuario responde 404', async () => {
      await esperarErro(marcarTopico(outro.id, planoId, 'd0-t0', true), 404);
      await esperarErro(marcarTopico(outro.id, planoId, 'd0-t0', false), 404);
      await esperarErro(marcarTopico(usuario.id, 'nao-e-uuid', 'd0-t0', true), 404);
      expect(await concluidos()).toEqual([]);
    });

    it('plano que não é o ativo responde 404 e não grava', async () => {
      const u = await criarUsuarioTeste(emailUnico('planos-inativo'));
      const e = await criarEdital({ acesso: [u.id] });
      const antigo = await criarPlano(u.id, entrada(e), AGORA);
      await criarPlano(u.id, entrada(e), AGORA); // o antigo deixa de ser ativo
      await esperarErro(marcarTopico(u.id, antigo, 'd0-t0', true), 404);
      const { data } = await admin().from('topicos_concluidos').select('topico_id').eq('plano_id', antigo);
      expect(data).toEqual([]);
    });
  });
});
