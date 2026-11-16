import type { Disciplina, Nivel } from '@/lib/dominio/tipos';

/** Resposta de GET /api/editais/:id. */
export type EditalVisao = {
  status: 'processando' | 'pronto' | 'erro';
  erro: string | null;
  resumo: { orgao: string | null; banca: string | null; ano: number | null; dataProva: string | null };
  cargos: { id: string; nome: string; statusConteudo: string }[];
};

export type ConteudoRevisado = { disciplinas: Disciplina[]; pesosInformados: boolean };
export type Niveis = Record<string, Nivel>;
