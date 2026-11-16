import type { Disciplina, Nivel } from '@/lib/dominio/tipos';

export type { EditalVisao } from '@/lib/dominio/tipos';

export type ConteudoRevisado = { disciplinas: Disciplina[]; pesosInformados: boolean };
export type Niveis = Record<string, Nivel>;
