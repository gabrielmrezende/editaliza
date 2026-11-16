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
  /** Custo da chamada de IA que levou a este erro (a chamada é cobrada mesmo assim). */
  custoCentavos = 0;
  constructor(mensagem = 'O arquivo não parece ser um edital com cargos.') {
    super(mensagem);
    this.name = 'EditalInvalidoError';
  }
}

/** A IA não devolveu uma resposta utilizável (recusa, corte, vazia ou fora do formato). */
export class ExtracaoFalhouError extends Error {
  /** Custo da chamada de IA que falhou (a chamada é cobrada mesmo assim). */
  custoCentavos: number;
  constructor(
    mensagem = 'Não foi possível ler o edital. Tente novamente em instantes.',
    opcoes?: { cause?: unknown; custoCentavos?: number },
  ) {
    super(mensagem, opcoes);
    this.name = 'ExtracaoFalhouError';
    this.custoCentavos = opcoes?.custoCentavos ?? 0;
  }
}

/** Custo carregado por um erro de extração (0 se o erro não veio de uma chamada de IA). */
export function custoDoErro(erro: unknown): number {
  return erro instanceof ExtracaoFalhouError || erro instanceof EditalInvalidoError ? erro.custoCentavos : 0;
}
