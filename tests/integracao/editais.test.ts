import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';

process.env.EXTRACAO_MODO = 'fake';

const { receberEdital, processarCargos, processarConteudo, iniciarConteudo, reiniciarEdital, lerEdital, lerCargo, EnvioInvalidoError } = await import(
  '@/lib/editais/servico'
);

async function pdfUnico(titulo = 'EDITAL TESTE'): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  doc.addPage().drawText(`edital ${randomUUID()}`, { x: 50, y: 700, size: 12 });
  return Buffer.from(await doc.save());
}

type Usuario = Awaited<ReturnType<typeof criarUsuarioTeste>>;

/** Sobe os bytes para tmp/{uid}/ como o navegador faria e devolve o caminho. */
async function enviarTmp(usuario: Usuario, bytes: Buffer): Promise<string> {
  const caminho = `tmp/${usuario.id}/${randomUUID()}.pdf`;
  const { error } = await usuario.cliente.storage
    .from('editais')
    .upload(caminho, bytes, { contentType: 'application/pdf' });
  if (error) throw error;
  return caminho;
}

async function linhaEdital(id: string) {
  const { data } = await admin().from('editais').select('*').eq('id', id).single();
  return data!;
}

describe('editais (serviço)', () => {
  let usuario: Usuario;

  beforeAll(async () => {
    usuario = await criarUsuarioTeste(emailUnico('editais'));
  });

  it('mesmo pdf duas vezes reaproveita', async () => {
    const bytes = await pdfUnico();
    const outro = await criarUsuarioTeste(emailUnico('editais-outro'));
    const a = await receberEdital(usuario.id, await enviarTmp(usuario, bytes));
    const b = await receberEdital(outro.id, await enviarTmp(outro, bytes));
    expect(a.novo).toBe(true);
    expect(b).toEqual({ editalId: a.editalId, novo: false });
    const { data: acessos } = await admin().from('edital_acessos').select('user_id').eq('edital_id', a.editalId);
    expect(acessos!.map((x) => x.user_id).sort()).toEqual([usuario.id, outro.id].sort());
  });

  it('envios simultaneos do mesmo pdf geram um edital', async () => {
    const bytes = await pdfUnico();
    const outro = await criarUsuarioTeste(emailUnico('editais-sim'));
    const [caminhoA, caminhoB] = await Promise.all([enviarTmp(usuario, bytes), enviarTmp(outro, bytes)]);
    const [a, b] = await Promise.all([
      receberEdital(usuario.id, caminhoA),
      receberEdital(outro.id, caminhoB),
    ]);
    expect(a.editalId).toBe(b.editalId);
    expect([a.novo, b.novo].filter(Boolean)).toHaveLength(1);
    const { data } = await admin().from('editais').select('id').eq('id', a.editalId);
    expect(data).toHaveLength(1);
    const { count } = await admin()
      .from('edital_acessos')
      .select('*', { count: 'exact', head: true })
      .eq('edital_id', a.editalId);
    expect(count).toBe(2);
  });

  it('processarCargos grava cargos e status pronto', async () => {
    const { editalId } = await receberEdital(usuario.id, await enviarTmp(usuario, await pdfUnico()));
    expect((await linhaEdital(editalId)).status).toBe('processando');
    await processarCargos(editalId);
    const edital = await linhaEdital(editalId);
    expect(edital).toMatchObject({
      status: 'pronto',
      orgao: 'Órgão Fictício',
      banca: 'Banca Fictícia',
      ano: 2026,
      data_prova: '2026-12-06',
      erro: null,
    });
    const { data: cargos } = await admin()
      .from('edital_cargos')
      .select('nome, status_conteudo')
      .eq('edital_id', editalId)
      .order('nome');
    expect(cargos).toEqual([
      { nome: 'Cargo A', status_conteudo: 'pendente' },
      { nome: 'Cargo B', status_conteudo: 'pendente' },
    ]);
  });

  it('processarConteudo grava o conteudo com ids', async () => {
    const { editalId } = await receberEdital(usuario.id, await enviarTmp(usuario, await pdfUnico()));
    await processarCargos(editalId);
    const { data: cargo } = await admin()
      .from('edital_cargos')
      .select('id')
      .eq('edital_id', editalId)
      .eq('nome', 'Cargo A')
      .single();
    await processarConteudo(cargo!.id);
    const { data } = await admin()
      .from('edital_cargos')
      .select('status_conteudo, erro, conteudo')
      .eq('id', cargo!.id)
      .single();
    expect(data!.status_conteudo).toBe('pronto');
    expect(data!.erro).toBeNull();
    expect(data!.conteudo.disciplinas[0].id).toBe('d0');
    expect(data!.conteudo.disciplinas[0].topicos[0].id).toBe('d0-t0');
  });

  it('pdf invalido marca erro com mensagem', async () => {
    const { editalId } = await receberEdital(usuario.id, await enviarTmp(usuario, await pdfUnico('INVALIDO')));
    await processarCargos(editalId);
    const edital = await linhaEdital(editalId);
    expect(edital.status).toBe('erro');
    expect(edital.erro).toBe('Este arquivo não parece ser um edital de concurso.');
  });

  it('sexto edital novo em 24h e recusado', async () => {
    const u = await criarUsuarioTeste(emailUnico('editais-limite'));
    for (let i = 0; i < 5; i++) {
      await receberEdital(u.id, await enviarTmp(u, await pdfUnico()));
    }
    const sexto = await enviarTmp(u, await pdfUnico());
    await expect(receberEdital(u.id, sexto)).rejects.toMatchObject({ status: 429 });
    // Reaproveitar um edital já existente não conta no limite.
    const dono = await criarUsuarioTeste(emailUnico('editais-dono'));
    const existente = await pdfUnico();
    await receberEdital(dono.id, await enviarTmp(dono, existente));
    await expect(receberEdital(u.id, await enviarTmp(u, existente))).resolves.toMatchObject({ novo: false });
  });

  it('arquivo que nao e pdf e recusado', async () => {
    const caminho = await enviarTmp(usuario, Buffer.from('isto nao e um pdf'));
    const erro = await receberEdital(usuario.id, caminho).catch((e) => e);
    expect(erro).toBeInstanceOf(EnvioInvalidoError);
    expect(erro).toMatchObject({ status: 400, message: 'arquivo não é um PDF válido' });
  });

  it('recusa caminho fora de tmp/ do proprio usuario', async () => {
    const outro = await criarUsuarioTeste(emailUnico('editais-caminho'));
    const caminho = await enviarTmp(outro, await pdfUnico());
    await expect(receberEdital(usuario.id, caminho)).rejects.toMatchObject({ status: 400 });
  });

  /** Cada teste usa um usuário novo para não esbarrar no limite de 5 por 24 h. */
  async function receberNovo(titulo?: string) {
    const u = await criarUsuarioTeste(emailUnico('editais-novo'));
    return receberEdital(u.id, await enviarTmp(u, await pdfUnico(titulo)));
  }
  async function editalPronto() {
    const { editalId } = await receberNovo();
    await processarCargos(editalId);
    const { data } = await admin().from('edital_cargos').select('id').eq('edital_id', editalId).eq('nome', 'Cargo A').single();
    return { editalId, cargoId: data!.id as string };
  }

  it('cargo preso em processando ha mais de 10 min vira erro e pode ser reivindicado de novo', async () => {
    const { editalId, cargoId } = await editalPronto();
    expect(await iniciarConteudo(cargoId)).toBe(true);
    // Em andamento e recente: não reivindica de novo.
    expect(await iniciarConteudo(cargoId)).toBe(false);
    const velho = new Date(Date.now() - 11 * 60_000).toISOString();
    await admin().from('edital_cargos').update({ processando_desde: velho }).eq('id', cargoId);
    // Reivindicação direta de um processando travado.
    expect(await iniciarConteudo(cargoId)).toBe(true);
    // Leitura trata como erro e grava.
    await admin().from('edital_cargos').update({ processando_desde: velho }).eq('id', cargoId);
    const visao = await lerCargo(cargoId);
    expect(visao).toMatchObject({ statusConteudo: 'erro', erro: 'Não conseguimos ler este edital. Tente de novo ou envie outro arquivo.' });
    const { data } = await admin().from('edital_cargos').select('status_conteudo').eq('id', cargoId).single();
    expect(data!.status_conteudo).toBe('erro');
    // lerEdital também expira.
    await admin().from('edital_cargos').update({ status_conteudo: 'processando', processando_desde: velho }).eq('id', cargoId);
    const edital = await lerEdital(editalId);
    expect(edital!.cargos.find((c) => c.id === cargoId)!.statusConteudo).toBe('erro');
  });

  it('custo e somado de forma atomica', async () => {
    const { editalId } = await receberNovo();
    await Promise.all(
      Array.from({ length: 10 }, () => admin().rpc('somar_custo_edital', { p_edital: editalId, p_centavos: 3 })),
    );
    expect((await linhaEdital(editalId)).custo_centavos).toBe(30);
  });

  it('envios paralelos de pdfs diferentes respeitam o limite de 5', async () => {
    const u = await criarUsuarioTeste(emailUnico('editais-paralelo'));
    const caminhos = await Promise.all(
      Array.from({ length: 7 }, async () => enviarTmp(u, await pdfUnico())),
    );
    const resultados = await Promise.allSettled(caminhos.map((c) => receberEdital(u.id, c)));
    const ok = resultados.filter((r) => r.status === 'fulfilled');
    const recusados = resultados.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(5);
    expect(recusados).toHaveLength(2);
    for (const r of recusados) expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 429 });
    const { count } = await admin().from('editais').select('id', { count: 'exact', head: true }).eq('enviado_por', u.id);
    expect(count).toBe(5);
  });

  it('extrair conteudo exige edital pronto (409)', async () => {
    const { editalId } = await receberNovo();
    const { data } = await admin()
      .from('edital_cargos')
      .insert({ edital_id: editalId, nome: 'Cargo X' })
      .select('id')
      .single();
    await expect(iniciarConteudo(data!.id)).rejects.toMatchObject({ status: 409 });
  });

  it('tentar novamente recusa edital que nao e edital (409) mas reabre erro comum', async () => {
    const { editalId: invalido } = await receberNovo('INVALIDO');
    await processarCargos(invalido);
    await expect(reiniciarEdital(invalido)).rejects.toMatchObject({
      status: 409,
      message: 'Este arquivo não parece ser um edital de concurso.',
    });
    expect((await linhaEdital(invalido)).status).toBe('erro');

    const { editalId } = await receberNovo();
    await admin().from('editais').update({ status: 'erro', erro: 'Não conseguimos ler este edital. Tente de novo ou envie outro arquivo.' }).eq('id', editalId);
    expect(await reiniciarEdital(editalId)).toBe(true);
    expect((await linhaEdital(editalId)).status).toBe('processando');
  });
});
