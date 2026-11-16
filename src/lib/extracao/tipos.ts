import type { ConteudoCargoIA } from '@/lib/dominio/esquemas';
import type { EditalResumo } from '@/lib/dominio/tipos';

export interface Extrator {
  /** Envia o PDF e devolve o file_id. */
  enviarArquivo(pdf: Buffer): Promise<string>;
  listarCargos(fileId: string): Promise<{ resumo: EditalResumo; custoCentavos: number }>;
  extrairConteudo(fileId: string, cargo: string): Promise<{ conteudo: ConteudoCargoIA; custoCentavos: number }>;
}

/** O PDF não parece um edital, ou nenhum cargo foi encontrado. */
export class EditalInvalidoError extends Error {
  constructor(mensagem = 'O arquivo não parece ser um edital com cargos.') {
    super(mensagem);
    this.name = 'EditalInvalidoError';
  }
}

/** A IA não devolveu uma resposta utilizável (recusa, corte, vazia ou fora do formato). */
export class ExtracaoFalhouError extends Error {
  constructor(mensagem = 'Não foi possível ler o edital. Tente novamente em instantes.', opcoes?: { cause?: unknown }) {
    super(mensagem, opcoes);
    this.name = 'ExtracaoFalhouError';
  }
}
