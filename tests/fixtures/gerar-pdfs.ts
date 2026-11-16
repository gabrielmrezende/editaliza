// Gera os PDFs de fixture: `node tests/fixtures/gerar-pdfs.ts`
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

async function gerar(arquivo: string, titulo: string, texto: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  // Datas fixas para o arquivo ser reprodutível.
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  doc.addPage().drawText(texto, { x: 50, y: 700, size: 14 });
  await writeFile(path.join(import.meta.dirname, arquivo), await doc.save());
}

await gerar('edital-exemplo.pdf', 'EDITAL EXEMPLO', 'Edital de concurso de exemplo');
await gerar('edital-invalido.pdf', 'INVALIDO', 'Documento que nao e um edital');
