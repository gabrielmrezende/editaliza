// Tipos de domínio do acompanhamento: sessões de estudo e revisões espaçadas.

export const TIPOS_SESSAO = [
  'teoria',
  'questoes',
  'revisao',
  'simulado',
  'lei_seca',
  'jurisprudencia',
  'discursiva',
] as const;
export type TipoSessao = (typeof TIPOS_SESSAO)[number];

export const ORIGENS_SESSAO = ['cronometro', 'manual', 'rapido'] as const;
export type OrigemSessao = (typeof ORIGENS_SESSAO)[number];

/** Intervalos (em dias) das revisões espaçadas. */
export const INTERVALOS_REVISAO = [1, 7, 21, 30] as const;

export interface Sessao {
  id: string;
  planoId: string | null;
  data: string;
  disciplinaId: string;
  disciplinaNome: string;
  topicoId: string | null;
  topicoNome: string | null;
  minutos: number;
  acertos: number;
  erros: number;
  tipo: TipoSessao | null;
  observacao: string | null;
  origem: OrigemSessao;
  criadaEm: string;
}

export interface Revisao {
  id: string;
  planoId: string;
  disciplinaId: string;
  disciplinaNome: string;
  topicoId: string;
  topicoNome: string;
  dataEstudo: string;
  dataRevisao: string;
  intervalo: number;
  sessaoId: string | null;
  origem: 'sessao' | 'conclusao';
  concluidaEm: string | null;
}

type Linha = Record<string, unknown>;
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** Linha do banco (snake_case) → Sessao. */
export function sessaoDaLinha(l: Linha): Sessao {
  return {
    id: String(l.id),
    planoId: texto(l.plano_id),
    data: String(l.data),
    disciplinaId: String(l.disciplina_id),
    disciplinaNome: String(l.disciplina_nome),
    topicoId: texto(l.topico_id),
    topicoNome: texto(l.topico_nome),
    minutos: Number(l.minutos),
    acertos: Number(l.acertos),
    erros: Number(l.erros),
    tipo: texto(l.tipo) as TipoSessao | null,
    observacao: texto(l.observacao),
    origem: String(l.origem) as OrigemSessao,
    criadaEm: String(l.created_at),
  };
}

/** Linha do banco (snake_case) → Revisao. */
export function revisaoDaLinha(l: Linha): Revisao {
  return {
    id: String(l.id),
    planoId: String(l.plano_id),
    disciplinaId: String(l.disciplina_id),
    disciplinaNome: String(l.disciplina_nome),
    topicoId: String(l.topico_id),
    topicoNome: String(l.topico_nome),
    dataEstudo: String(l.data_estudo),
    dataRevisao: String(l.data_revisao),
    intervalo: Number(l.intervalo),
    sessaoId: texto(l.sessao_id),
    origem: String(l.origem) as Revisao['origem'],
    concluidaEm: texto(l.concluida_em),
  };
}
