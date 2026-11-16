import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { admin, criarUsuarioTeste, emailUnico } from './ajuda';

process.env.EXTRACAO_MODO = 'fake';

const { receberEdital, processarCargos, processarConteudo, EnvioInvalidoError } = await import(
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
});
