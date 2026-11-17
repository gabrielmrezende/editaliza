import 'server-only';
import { redirect } from 'next/navigation';
import { revisaoDaLinha, sessaoDaLinha, type Revisao, type Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano, PlanoGerado, PosicaoCiclo } from '@/lib/dominio/tipos';
import { criarClienteServidor, exigirUsuario } from '@/lib/supabase/servidor';

/** Plano ativo: colunas de `planos` + cargo/órgão do edital. */
export type LinhaPlanoAtivo = {
  id: string;
  data_prova: string | null;
  minutos_por_dia: number[];
  conteudo: DisciplinaPlano[];
  gerado: PlanoGerado;
  created_at: string;
  ajustado_em: string | null;
  ciclo_inicio: PosicaoCiclo | null;
  edital_cargos: { nome: string; editais: { orgao: string | null; ano: number | null } | null } | null;
};

export const POR_PAGINA = 50;
const LOTE = 1000; // limite padrão de linhas do PostgREST

const inteiroNaoNegativo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** `ciclo_inicio` só vale como `{ indice, minutos }` de inteiros ≥ 0; qualquer outra coisa vira null. */
function cicloInicioValido(v: unknown): PosicaoCiclo | null {
  if (typeof v !== 'object' || v === null) return null;
  const { indice, minutos } = v as Record<string, unknown>;
  return inteiroNaoNegativo(indice) && inteiroNaoNegativo(minutos) ? { indice, minutos } : null;
}

/** Plano ativo do usuário (RLS: só o dono); sem plano, vai para a criação de um. */
export async function planoAtivoOuRedireciona(): Promise<LinhaPlanoAtivo> {
  const usuario = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('planos')
    .select('id, data_prova, minutos_por_dia, conteudo, gerado, created_at, ajustado_em, ciclo_inicio, edital_cargos(nome, editais(orgao, ano))')
    .eq('user_id', usuario.id)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) redirect('/app/novo');
  const plano = data as unknown as LinhaPlanoAtivo;
  return { ...plano, ciclo_inicio: cicloInicioValido(plano.ciclo_inicio) };
}

/** Sessões do plano (da data `desde`, inclusive, em diante), da mais recente para a mais antiga. */
export async function sessoesDoPlano(planoId: string, desde?: string): Promise<Sessao[]> {
  const supabase = await criarClienteServidor();
  const sessoes: Sessao[] = [];
  for (let inicio = 0; ; inicio += LOTE) {
    let consulta = supabase.from('sessoes_estudo').select('*').eq('plano_id', planoId);
    if (desde) consulta = consulta.gte('data', desde);
    const { data, error } = await consulta
      .order('data', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    const linhas = data ?? [];
    sessoes.push(...linhas.map(sessaoDaLinha));
    if (linhas.length < LOTE) return sessoes;
  }
}

/** Minutos das sessões do plano com `desde` <= data < `hoje` (só `data, minutos`, lidos em lotes). */
export async function minutosDeSessoesDoCiclo(
  planoId: string,
  desde: string,
  hoje: string,
): Promise<{ data: string; minutos: number }[]> {
  const supabase = await criarClienteServidor();
  const itens: { data: string; minutos: number }[] = [];
  for (let inicio = 0; ; inicio += LOTE) {
    const { data, error } = await supabase
      .from('sessoes_estudo')
      .select('data, minutos')
      .eq('plano_id', planoId)
      .gte('data', desde)
      .lt('data', hoje)
      .order('data')
      .order('id')
      .range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    const linhas = (data ?? []) as { data: string; minutos: number }[];
    itens.push(...linhas);
    if (linhas.length < LOTE) return itens;
  }
}

export interface FiltroHistorico {
  pagina: number;
  disciplinaNome?: string;
  de?: string;
  ate?: string;
}

/** Histórico do usuário (RLS), 50 por página, mais recentes primeiro; `de`/`ate` inclusivos. */
export async function sessoesDoUsuario(filtro: FiltroHistorico): Promise<{ sessoes: Sessao[]; total: number }> {
  const supabase = await criarClienteServidor();
  const pagina = Number.isInteger(filtro.pagina) && filtro.pagina > 0 ? filtro.pagina : 1;
  const inicio = (pagina - 1) * POR_PAGINA;
  let consulta = supabase.from('sessoes_estudo').select('*', { count: 'exact' });
  if (filtro.disciplinaNome) consulta = consulta.eq('disciplina_nome', filtro.disciplinaNome);
  if (filtro.de) consulta = consulta.gte('data', filtro.de);
  if (filtro.ate) consulta = consulta.lte('data', filtro.ate);
  const { data, error, count } = await consulta
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id')
    .range(inicio, inicio + POR_PAGINA - 1);
  if (error) throw error;
  return { sessoes: (data ?? []).map(sessaoDaLinha), total: count ?? 0 };
}

/** Todas as revisões do plano (pendentes e concluídas), por data de revisão. */
export async function revisoesDoPlano(planoId: string): Promise<Revisao[]> {
  const supabase = await criarClienteServidor();
  const revisoes: Revisao[] = [];
  for (let inicio = 0; ; inicio += LOTE) {
    const { data, error } = await supabase
      .from('revisoes')
      .select('*')
      .eq('plano_id', planoId)
      .order('data_revisao')
      .order('id')
      .range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    const linhas = data ?? [];
    revisoes.push(...linhas.map(revisaoDaLinha));
    if (linhas.length < LOTE) return revisoes;
  }
}
