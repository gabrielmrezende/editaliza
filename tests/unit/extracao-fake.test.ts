import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo } from '@/lib/dominio/esquemas';
import { EditalInvalidoError, ExtracaoFalhouError, obterExtrator } from '@/lib/extracao';

async function pdfComTitulo(titulo: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.setTitle(titulo);
  return Buffer.from(await doc.save());
}

describe('extrator fake', () => {
  const modoAnterior = process.env.EXTRACAO_MODO;
  beforeEach(() => {
    process.env.EXTRACAO_MODO = 'fake';
  });
  afterEach(() => {
    if (modoAnterior === undefined) delete process.env.EXTRACAO_MODO;
    else process.env.EXTRACAO_MODO = modoAnterior;
  });

  it('listarCargos devolve 2 cargos válidos', async () => {
    const { resumo, custoCentavos } = await obterExtrator().listarCargos('x');
    expect(EsquemaEditalResumo.safeParse(resumo).success).toBe(true);
    expect(resumo.cargos.map((c) => c.nome)).toEqual(['Cargo A', 'Cargo B']);
    expect(custoCentavos).toBe(0);
  });

  it('extrairConteudo passa em EsquemaConteudoCargoIA', async () => {
    const { conteudo } = await obterExtrator().extrairConteudo('x', 'Cargo A');
    expect(EsquemaConteudoCargoIA.safeParse(conteudo).success).toBe(true);
    expect(conteudo.disciplinas).toHaveLength(3);
    expect(conteudo.pesosInformados).toBe(true);
    for (const d of conteudo.disciplinas) {
      expect(d.topicos.length).toBeGreaterThanOrEqual(2);
      expect(d.topicos.length).toBeLessThanOrEqual(4);
    }
  });

  it('enviarArquivo: título INVALIDO → fake-invalido; listarCargos lança', async () => {
    const ex = obterExtrator();
    const id = await ex.enviarArquivo(await pdfComTitulo('INVALIDO'));
    expect(id).toBe('fake-invalido');
    await expect(ex.listarCargos(id)).rejects.toBeInstanceOf(EditalInvalidoError);
  });

  it('enviarArquivo: PDF normal → fake-ok', async () => {
    const ex = obterExtrator();
    const id = await ex.enviarArquivo(await pdfComTitulo('Edital 1/2026'));
    expect(id).toBe('fake-ok');
    await expect(ex.listarCargos(id)).resolves.toBeDefined();
  });
  it('enviarArquivo: título FALHA → fake-falha; as chamadas falham com custo', async () => {
    const ex = obterExtrator();
    const id = await ex.enviarArquivo(await pdfComTitulo('FALHA'));
    expect(id).toBe('fake-falha');
    const erro = await ex.listarCargos(id).catch((e) => e);
    expect(erro).toBeInstanceOf(ExtracaoFalhouError);
    expect(erro.custoCentavos).toBe(7);
    const erroConteudo = await ex.extrairConteudo('fake-ok', 'FALHA').catch((e) => e);
    expect(erroConteudo).toBeInstanceOf(ExtracaoFalhouError);
    expect(erroConteudo.custoCentavos).toBe(7);
  });
  it('enviarArquivo aceita PDF protegido por senha de permissoes', async () => {
    const pdf = await readFile(path.join(process.cwd(), 'tests', 'fixtures', 'edital-protegido.pdf'));
    await expect(obterExtrator().enviarArquivo(pdf)).resolves.toBe('fake-ok');
  });
});
