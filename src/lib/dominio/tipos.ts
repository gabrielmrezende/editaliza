export type Nivel = 'nunca_vi' | 'basico' | 'domino';
export interface Topico { id: string; nome: string }
export interface Disciplina { id: string; nome: string; questoes: number | null; pontos: number | null; topicos: Topico[] }
export interface ConteudoCargo { disciplinas: Disciplina[]; tipoProva: 'multipla_escolha' | 'certo_errado' | 'discursiva' | 'mista'; pesosInformados: boolean }
export interface EditalResumo { orgao: string; banca: string | null; ano: number | null; dataProva: string | null; cargos: { nome: string }[] }
export interface DisciplinaPlano extends Disciplina { nivel: Nivel }
export type MinutosPorDia = [number, number, number, number, number, number, number]; // índice = Date.getDay() (0 = domingo)
export interface EntradaPlano {
  disciplinas: DisciplinaPlano[]; dataProva: string | null; hoje: string; minutosPorDia: MinutosPorDia; concluidos: string[]; pesosInformados: boolean;
  /** Multiplicador de prioridade por disciplina (ajuste semanal); ausente = ×1. */
  ajustes?: Record<string, number>;
}
export interface BlocoEstudo { disciplinaId: string; topicoId: string | null; tipo: 'estudo' | 'revisao_geral' | 'simulado'; minutos: number }
export interface DiaPlano { data: string; blocos: BlocoEstudo[] }
export type Aviso = { tipo: 'nao_cabe'; topicosFora: string[] } | { tipo: 'pesos_assumidos' } | { tipo: 'sem_tempo' } | { tipo: 'data_invalida' };
/** Estado do edital para o cliente (GET /api/editais/:id). */
export type EditalVisao = {
  status: 'processando' | 'pronto' | 'erro';
  erro: string | null;
  resumo: { orgao: string | null; banca: string | null; ano: number | null; dataProva: string | null };
  cargos: { id: string; nome: string; statusConteudo: string }[];
};
export type ItemCiclo = { disciplinaId: string; minutos: number };
export type PlanoGerado =
  | { modo: 'prazo'; dias: DiaPlano[]; inicioReserva: string | null; avisos: Aviso[] }
  | { modo: 'ciclo'; ciclo: ItemCiclo[]; avisos: Aviso[] };
