import 'server-only';
import { redirect } from 'next/navigation';
import { revisaoDaLinha, sessaoDaLinha, type Revisao, type Sessao } from '@/lib/dominio/acompanhamento';
import type { DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
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
  /** Posição na fila de blocos (contador sem limite; só o servidor escreve). */
  fila_posicao: number;
  /** Prazo: a fila começa nos dias com data >= esta (null = todos). */
  fila_desde: string | null;
  edital_cargos: { nome: string; editais: { orgao: string | null; ano: number | null } | null } | null;
};

export const POR_PAGINA = 50;
const LOTE = 1000; // limite padrão de linhas do PostgREST

/** Plano ativo do usuário (RLS: só o dono), ou null se ele não tem plano ativo. */
export async function planoAtivo(): Promise<LinhaPlanoAtivo | null> {
  const usuario = await exigirUsuario();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('planos')
    .select('id, data_prova, minutos_por_dia, conteudo, gerado, created_at, ajustado_em, fila_posicao, fila_desde, edital_cargos(nome, editais(orgao, ano))')
    .eq('user_id', usuario.id)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data as unknown as LinhaPlanoAtivo;
}

/** Plano ativo do usuário (RLS: só o dono); sem plano, vai para a criação de um. */
export async function planoAtivoOuRedireciona(): Promise<LinhaPlanoAtivo> {
  const plano = await planoAtivo();
  if (!plano) redirect('/app/novo');
  return plano;
}

/** Sessões do plano com `desde` <= data <= `ate` (os dois opcionais), da mais recente para a mais antiga. */
export async function sessoesDoPlano(planoId: string, desde?: string, ate?: string): Promise<Sessao[]> {
  const supabase = await criarClienteServidor();
  const sessoes: Sessao[] = [];
  for (let inicio = 0; ; inicio += LOTE) {
    let consulta = supabase.from('sessoes_estudo').select('*').eq('plano_id', planoId);
    if (desde) consulta = consulta.gte('data', desde);
    if (ate) consulta = consulta.lte('data', ate);
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

export interface FiltroHistorico {
  pagina: number;
  disciplinaNome?: string;
  de?: string;
  ate?: string;
}

/** Código do PostgREST para `range` além do fim (416). */
const FORA_DO_INTERVALO = 'PGRST103';

/** Histórico do usuário (RLS), 50 por página, mais recentes primeiro; `de`/`ate` inclusivos. */
export async function sessoesDoUsuario(filtro: FiltroHistorico): Promise<{ sessoes: Sessao[]; total: number }> {
  const supabase = await criarClienteServidor();
  const pagina = Number.isInteger(filtro.pagina) && filtro.pagina > 0 ? filtro.pagina : 1;
  const inicio = (pagina - 1) * POR_PAGINA;
  const filtrada = (opcoes: { count: 'exact'; head?: boolean }) => {
    let q = supabase.from('sessoes_estudo').select(opcoes.head ? 'id' : '*', opcoes);
    if (filtro.disciplinaNome) q = q.eq('disciplina_nome', filtro.disciplinaNome);
    if (filtro.de) q = q.gte('data', filtro.de);
    if (filtro.ate) q = q.lte('data', filtro.ate);
    return q;
  };
  const { data, error, count } = await filtrada({ count: 'exact' })
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id')
    .range(inicio, inicio + POR_PAGINA - 1);
  if (error?.code === FORA_DO_INTERVALO) {
    // Página além da última: lista vazia, mas com o total certo (o 416 não traz a contagem).
    const contagem = await filtrada({ count: 'exact', head: true });
    if (contagem.error) throw contagem.error;
    return { sessoes: [], total: contagem.count ?? 0 };
  }
  if (error) throw error;
  return { sessoes: (data ?? []).map(sessaoDaLinha), total: count ?? 0 };
}

/** Nomes distintos das matérias no histórico do usuário (RLS), em ordem alfabética. */
export async function materiasDoHistorico(): Promise<string[]> {
  const supabase = await criarClienteServidor();
  const nomes = new Set<string>();
  for (let inicio = 0; ; inicio += LOTE) {
    const { data, error } = await supabase
      .from('sessoes_estudo')
      .select('disciplina_nome')
      .order('disciplina_nome')
      .order('id')
      .range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    const linhas = (data ?? []) as { disciplina_nome: string }[];
    for (const l of linhas) nomes.add(l.disciplina_nome);
    if (linhas.length < LOTE) return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
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
