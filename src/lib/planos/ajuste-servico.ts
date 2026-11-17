import 'server-only';
import { z } from 'zod';
import { AcompanhamentoError, exigirPodeRegistrar } from '@/lib/acompanhamento/servico';
import { FUSO, hojeEmSaoPaulo, somarDias } from '@/lib/datas';
import type { ConteudoCargo, DisciplinaPlano, MinutosPorDia, PlanoGerado, PosicaoCiclo } from '@/lib/dominio/tipos';
import { ajustarPlano, ajusteVencido, type ItemResumo } from '@/lib/plano/ajuste';
import { INTERVALO_AJUSTE_MANUAL_MIN, JANELA_ACERTO_DIAS } from '@/lib/plano/constantes';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { minutosRegistradosNoCiclo, posicaoEmMinutos } from './ciclo';
import { msgAjusteRecente } from './mensagens';
import { pesosDoPlano } from './servico';

const uuid = z.uuid();
const naoEncontrado = () => new AcompanhamentoError('Não encontrado.', 404);
const MS_MINUTO = 60_000;

interface LinhaPlano {
  id: string;
  ativo: boolean;
  cargo_id: string | null;
  data_prova: string | null;
  minutos_por_dia: MinutosPorDia;
  conteudo: DisciplinaPlano[];
  gerado: PlanoGerado;
  created_at: string;
  /** Exatamente como o PostgREST devolveu: volta igual para a checagem otimista de `aplicar_ajuste`. */
  ajustado_em: string | null;
  ciclo_inicio: PosicaoCiclo | null;
}

async function lerPlano(planoId: string): Promise<LinhaPlano | null> {
  const { data, error } = await criarClienteAdmin()
    .from('planos')
    .select('id, ativo, cargo_id, data_prova, minutos_por_dia, conteudo, gerado, created_at, ajustado_em, ciclo_inicio')
    .eq('id', planoId)
    .maybeSingle();
  if (error) throw error;
  return data as LinhaPlano | null;
}

/** O plano é do usuário? (qualquer plano dele, ativo ou não) */
async function planoDoUsuario(userId: string, planoId: string): Promise<boolean> {
  if (!uuid.safeParse(planoId).success) return false;
  const { data, error } = await criarClienteAdmin()
    .from('planos')
    .select('id')
    .eq('id', planoId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Conteúdo do cargo do plano (para os pesos); null se o plano não tem cargo. */
async function conteudoDoCargo(cargoId: string | null): Promise<ConteudoCargo | null> {
  if (!cargoId) return null;
  const { data, error } = await criarClienteAdmin().from('edital_cargos').select('conteudo').eq('id', cargoId).maybeSingle();
  if (error) throw error;
  return (data?.conteudo as ConteudoCargo | null) ?? null;
}

/** Fatores só de acerto gravados no último ajuste do plano ({} se nunca ajustou). */
async function fatoresAcertoVigentes(planoId: string): Promise<Record<string, number>> {
  const { data, error } = await criarClienteAdmin()
    .from('ajustes_plano')
    .select('multiplicadores')
    .eq('plano_id', planoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const multiplicadores = data?.multiplicadores as { acerto?: Record<string, number> } | undefined;
  return multiplicadores?.acerto ?? {};
}

const LOTE = 1000; // limite padrão de linhas do PostgREST

interface SessaoAjuste {
  data: string;
  disciplinaId: string;
  minutos: number;
  acertos: number;
  erros: number;
}

/** Sessões do plano com data >= `desde`, lidas em lotes (sem o teto de 1000 linhas do PostgREST). */
async function sessoesDesde(planoId: string, desde: string): Promise<SessaoAjuste[]> {
  const db = criarClienteAdmin();
  const sessoes: SessaoAjuste[] = [];
  for (let inicio = 0; ; inicio += LOTE) {
    const { data, error } = await db
      .from('sessoes_estudo')
      .select('data, disciplina_id, minutos, acertos, erros')
      .eq('plano_id', planoId)
      .gte('data', desde)
      .order('data')
      .order('id')
      .range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    const linhas = data ?? [];
    for (const s of linhas) {
      sessoes.push({
        data: s.data as string,
        disciplinaId: s.disciplina_id as string,
        minutos: s.minutos as number,
        acertos: s.acertos as number,
        erros: s.erros as number,
      });
    }
    if (linhas.length < LOTE) return sessoes;
  }
}

/**
 * Calcula e grava o ajuste do plano (módulo puro + `aplicar_ajuste`).
 * Devolve o id do ajuste, ou null se outra requisição ajustou antes (ou o plano deixou de ser ativo).
 */
async function executarAjuste(plano: LinhaPlano, agora: Date): Promise<string | null> {
  const db = criarClienteAdmin();
  const hoje = hojeEmSaoPaulo(agora);
  const inicioAcerto = somarDias(hoje, -JANELA_ACERTO_DIAS);
  // O ciclo anda pelas sessões em [desde, hoje), como na página do plano.
  const desde = hojeEmSaoPaulo(new Date(plano.ajustado_em ?? plano.created_at));

  const [conteudoCargo, vigentes, todas, feitos, pendentes] = await Promise.all([
    conteudoDoCargo(plano.cargo_id),
    fatoresAcertoVigentes(plano.id),
    sessoesDesde(plano.id, desde < inicioAcerto ? desde : inicioAcerto),
    db.from('topicos_concluidos').select('topico_id').eq('plano_id', plano.id),
    db.from('revisoes').select('disciplina_id, data_revisao').eq('plano_id', plano.id).is('concluida_em', null),
  ]);
  if (feitos.error) throw feitos.error;
  if (pendentes.error) throw pendentes.error;

  const posicaoAtual =
    plano.gerado.modo === 'ciclo'
      ? posicaoEmMinutos(plano.gerado.ciclo, plano.ciclo_inicio, minutosRegistradosNoCiclo(todas, desde, hoje))
      : 0;

  const resultado = ajustarPlano({
    conteudo: plano.conteudo,
    gerado: plano.gerado,
    dataProva: plano.data_prova,
    minutosPorDia: plano.minutos_por_dia,
    pesosInformados: pesosDoPlano(conteudoCargo, plano.conteudo),
    criadoEm: hojeEmSaoPaulo(new Date(plano.created_at)),
    fatoresAcertoVigentes: vigentes,
    posicaoAtual,
    sessoes: todas.filter((s) => s.data >= inicioAcerto),
    concluidos: (feitos.data ?? []).map((f) => f.topico_id as string),
    revisoesPendentes: (pendentes.data ?? []).map((r) => ({
      disciplinaId: r.disciplina_id as string,
      dataRevisao: r.data_revisao as string,
    })),
    hoje,
  });

  const { data: ajusteId, error } = await db.rpc('aplicar_ajuste', {
    p_plano: plano.id,
    p_ajustado_lido: plano.ajustado_em,
    p_gerado: resultado.gerado,
    p_ajustes: resultado.ajustes,
    p_ciclo_inicio: resultado.cicloInicio,
    p_janela_inicio: resultado.janela.inicio,
    p_janela_fim: resultado.janela.fim,
    p_resumo: resultado.resumo,
    p_gerado_anterior: plano.gerado,
    p_multiplicadores: { final: resultado.ajustes, acerto: resultado.fatoresAcerto },
    p_agora: agora.toISOString(),
  });
  if (error) throw error;
  return (ajusteId as string | null) ?? null;
}

/**
 * Ajuste preguiçoso ao abrir o plano: roda se passaram ≥ 7 dias do último ajuste (ou da criação).
 * Devolve true se este pedido gravou o ajuste; sem plano ativo ou corrida perdida → false, sem erro.
 */
export async function ajustarSeVencido(userId: string, agora: Date = new Date()): Promise<boolean> {
  let ativo;
  try {
    ativo = await exigirPodeRegistrar(userId);
  } catch (erro) {
    if (erro instanceof AcompanhamentoError) return false;
    throw erro;
  }
  const plano = await lerPlano(ativo.id);
  if (!plano?.ativo) return false;
  if (!ajusteVencido(new Date(plano.ajustado_em ?? plano.created_at), agora)) return false;
  return (await executarAjuste(plano, agora)) !== null;
}

const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** 429 com a hora (São Paulo) em que o botão volta: 60 min depois do último ajuste. */
function ajusteRecente(ajustadoEm: string): AcompanhamentoError {
  const volta = new Date(new Date(ajustadoEm).getTime() + INTERVALO_AJUSTE_MANUAL_MIN * MS_MINUTO);
  return new AcompanhamentoError(msgAjusteRecente(formatoHora.format(volta)), 429);
}

/** Botão "Ajustar agora": só no plano ativo do usuário e no máximo 1 por 60 minutos. Devolve o id do ajuste. */
export async function ajustarAgora(userId: string, planoId: string, agora: Date = new Date()): Promise<string> {
  if (!uuid.safeParse(planoId).success) throw naoEncontrado();
  const ativo = await exigirPodeRegistrar(userId);
  if (ativo.id !== planoId) throw naoEncontrado();
  const plano = await lerPlano(planoId);
  if (!plano?.ativo) throw naoEncontrado();
  if (
    plano.ajustado_em !== null &&
    agora.getTime() - new Date(plano.ajustado_em).getTime() < INTERVALO_AJUSTE_MANUAL_MIN * MS_MINUTO
  ) {
    throw ajusteRecente(plano.ajustado_em);
  }
  const ajusteId = await executarAjuste(plano, agora);
  if (ajusteId !== null) return ajusteId;
  // Outra requisição ajustou no meio do caminho (ou o plano deixou de ser o ativo).
  const atual = await lerPlano(planoId);
  if (atual?.ativo && atual.ajustado_em !== null) throw ajusteRecente(atual.ajustado_em);
  throw naoEncontrado();
}

/**
 * Fecha o resumo do ajuste (o aluno já viu).
 * Não passa pelo portão de registro (`exigirPodeRegistrar`) — decisão do Plano 2; Plano 3: revisar.
 */
export async function marcarResumoVisto(userId: string, planoId: string, ajusteId: string): Promise<void> {
  if (!uuid.safeParse(ajusteId).success || !(await planoDoUsuario(userId, planoId))) throw naoEncontrado();
  const { data, error } = await criarClienteAdmin()
    .from('ajustes_plano')
    .update({ visto: true })
    .eq('id', ajusteId)
    .eq('plano_id', planoId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw naoEncontrado();
}

export interface AjusteVisivel {
  id: string;
  /** Dia (aaaa-mm-dd, São Paulo) em que o ajuste foi feito. */
  criadoEm: string;
  resumo: ItemResumo[];
}

/** O último ajuste do plano, se o aluno ainda não fechou o resumo; null caso contrário (ou plano alheio). */
export async function ultimoAjusteNaoVisto(userId: string, planoId: string): Promise<AjusteVisivel | null> {
  if (!(await planoDoUsuario(userId, planoId))) return null;
  const { data, error } = await criarClienteAdmin()
    .from('ajustes_plano')
    .select('id, created_at, resumo, visto')
    .eq('plano_id', planoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.visto) return null;
  return {
    id: data.id as string,
    criadoEm: hojeEmSaoPaulo(new Date(data.created_at as string)),
    resumo: data.resumo as ItemResumo[],
  };
}
