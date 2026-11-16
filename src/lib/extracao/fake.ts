import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { EsquemaConteudoCargoIA, EsquemaEditalResumo } from '@/lib/dominio/esquemas';
import { EditalInvalidoError, ExtracaoFalhouError, type Extrator } from './tipos';

/** Custo simulado de uma chamada que falha (testa o registro de custo em falhas). */
const CUSTO_FALHA = 7;
const falha = () => new ExtracaoFalhouError('A resposta da IA veio em formato inesperado. Tente novamente.', { custoCentavos: CUSTO_FALHA });

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
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    const titulo = doc.getTitle();
    return titulo === 'INVALIDO' ? 'fake-invalido' : titulo === 'FALHA' ? 'fake-falha' : 'fake-ok';
  },
  async listarCargos(fileId) {
    if (fileId === 'fake-invalido') throw new EditalInvalidoError();
    if (fileId === 'fake-falha') throw falha();
    const { resumo } = await carregarFixture();
    return { resumo, custoCentavos: 0 };
  },
  async extrairConteudo(fileId, cargo) {
    if (fileId === 'fake-falha' || cargo === 'FALHA') throw falha();
    const { conteudo } = await carregarFixture();
    return { conteudo, custoCentavos: 0 };
  },
};
