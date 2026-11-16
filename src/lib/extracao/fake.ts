import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo } from '@/lib/dominio/esquemas';
import { EditalInvalidoError, type Extrator } from './tipos';

async function carregarFixture() {
  const arquivo = path.join(process.cwd(), 'tests', 'fixtures', 'extracao-fake.json');
  const bruto = JSON.parse(await readFile(arquivo, 'utf8'));
  return {
    resumo: EsquemaEditalResumo.parse(bruto.resumo),
    conteudo: EsquemaConteudoCargoIA.parse(bruto.conteudo),
  };
}

export const extratorFake: Extrator = {
  async enviarArquivo(pdf) {
    const doc = await PDFDocument.load(pdf);
    return doc.getTitle() === 'INVALIDO' ? 'fake-invalido' : 'fake-ok';
  },
  async listarCargos(fileId) {
    if (fileId === 'fake-invalido') throw new EditalInvalidoError();
    const { resumo } = await carregarFixture();
    return { resumo, custoCentavos: 0 };
  },
  async extrairConteudo() {
    const { conteudo } = await carregarFixture();
    return { conteudo, custoCentavos: 0 };
  },
};
