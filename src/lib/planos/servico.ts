import 'server-only';
import { z } from 'zod';
import type { EsquemaEntradaCriarPlano } from '@/lib/dominio/esquemas';
import type { ConteudoCargo, DisciplinaPlano } from '@/lib/dominio/tipos';
import { exigirPodeRegistrar } from '@/lib/acompanhamento/servico';
import { revisoesParaCriar } from '@/lib/acompanhamento/revisoes';
import { hojeEmSaoPaulo, somarDias } from '@/lib/datas';
import { INTERVALOS_REVISAO } from '@/lib/dominio/acompanhamento';
import { usuarioTemAcesso } from '@/lib/editais/servico';
import { gerarPlano } from '@/lib/plano/gerar';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { MAX_DIAS_ATE_PROVA, MSG_DATA_DISTANTE, MSG_DATA_PASSADA, MSG_SEM_HORAS } from './mensagens';

export type EntradaCriarPlano = z.output<typeof EsquemaEntradaCriarPlano>;


/** Erro de entrada do usuário, com status HTTP e mensagem seguras para exibir. */
export class PlanoInvalidoError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(mensagem);
    this.name = 'PlanoInvalidoError';
  }
}

const naoEncontrado = () => new PlanoInvalidoError('Não encontrado.', 404);
const uuid = z.uuid();

/** Ids de matérias e de tópicos precisam ser únicos no plano (os concluídos são gravados por id). */
function idsUnicos(disciplinas: DisciplinaPlano[]): boolean {
  const vistos = new Set<string>();
  for (const id of disciplinas.flatMap((d) => [d.id, ...d.topicos.map((t) => t.id)])) {
    if (vistos.has(id)) return false;
    vistos.add(id);
  }
  return true;
}

/**
 * Pesos valem se o edital os informa ou se o aluno preencheu questões/pontos na revisão.
 * Usado ao criar o plano e a cada ajuste (`conteudoCargo` null: plano sem cargo).
 */
export function pesosDoPlano(conteudoCargo: ConteudoCargo | null, disciplinas: DisciplinaPlano[]): boolean {
  return (
    conteudoCargo?.pesosInformados === true || disciplinas.some((d) => (d.questoes ?? 0) > 0 || (d.pontos ?? 0) > 0)
  );
}

/** Limites generosos (um edital real tem dezenas de matérias e centenas de tópicos) contra abuso. */
// Nomes de tópico de editais reais passam de 400 caracteres (itens do conteúdo programático escritos por extenso).
export const LIMITES = { disciplinas: 100, topicos: 3000, nome: 2000, id: 64 };

function dentroDosLimites(disciplinas: DisciplinaPlano[]): boolean {
  const topicos = disciplinas.flatMap((d) => d.topicos);
  return (
    disciplinas.length <= LIMITES.disciplinas &&
    topicos.length <= LIMITES.topicos &&
    [...disciplinas, ...topicos].every((x) => x.nome.length <= LIMITES.nome && x.id.length <= LIMITES.id)
  );
}

/**
 * Cria o plano do usuário e o torna o único ativo. Acesso, cargo, pesos e data de hoje
 * vêm do servidor; do cliente só as escolhas dele (conteúdo revisado, data, horas, níveis).
 */
export async function criarPlano(userId: string, entrada: EntradaCriarPlano, agora: Date = new Date()): Promise<string> {
  if (!(await usuarioTemAcesso(userId, entrada.editalId))) throw naoEncontrado();
  const db = criarClienteAdmin();

  const { data: cargo, error: errCargo } = await db
    .from('edital_cargos')
    .select('edital_id, status_conteudo, conteudo')
    .eq('id', entrada.cargoId)
    .maybeSingle();
  if (errCargo) throw errCargo;
  if (!cargo || cargo.edital_id !== entrada.editalId) throw naoEncontrado();
  if (cargo.status_conteudo !== 'pronto' || !cargo.conteudo) {
    throw new PlanoInvalidoError('O conteúdo deste cargo ainda não está pronto.', 409);
  }

  const hoje = hojeEmSaoPaulo(agora);
  if (entrada.dataProva !== null && entrada.dataProva <= hoje) {
    throw new PlanoInvalidoError(MSG_DATA_PASSADA, 400);
  }
  if (entrada.dataProva !== null && entrada.dataProva > somarDias(hoje, MAX_DIAS_ATE_PROVA)) {
    throw new PlanoInvalidoError(MSG_DATA_DISTANTE, 400);
  }
  if (entrada.minutosPorDia.every((m) => m === 0)) {
    throw new PlanoInvalidoError(MSG_SEM_HORAS, 400);
  }
  if (!dentroDosLimites(entrada.disciplinas)) {
    throw new PlanoInvalidoError('O conteúdo do plano é grande demais.', 400);
  }
  if (!idsUnicos(entrada.disciplinas)) {
    throw new PlanoInvalidoError('Há matérias ou tópicos repetidos no conteúdo.', 400);
  }

  const { data: edital, error: errEdital } = await db
    .from('editais')
    .select('versao')
    .eq('id', entrada.editalId)
    .single();
  if (errEdital) throw errEdital;

  const gerado = gerarPlano({
    disciplinas: entrada.disciplinas,
    dataProva: entrada.dataProva,
    hoje,
    minutosPorDia: entrada.minutosPorDia,
    // O progresso do plano ativo do mesmo cargo é levado pela RPC; o plano novo já não agenda esses tópicos.
    concluidos: await concluidosDoPlanoAtivo(userId, entrada.cargoId),
    // O cliente nunca manda a flag: ela é derivada aqui.
    pesosInformados: pesosDoPlano(cargo.conteudo as ConteudoCargo, entrada.disciplinas),
  });

  const { data: planoId, error } = await db.rpc('criar_plano', {
    p_user: userId,
    p_edital: entrada.editalId,
    p_cargo: entrada.cargoId,
    p_versao: edital.versao,
    p_data_prova: entrada.dataProva,
    p_minutos: entrada.minutosPorDia,
    p_conteudo: entrada.disciplinas,
    p_gerado: gerado,
  });
  if (error) throw error;
  return planoId as string;
}

/** Tópicos concluídos no plano ativo do usuário, se for do mesmo cargo. */
async function concluidosDoPlanoAtivo(userId: string, cargoId: string): Promise<string[]> {
  const db = criarClienteAdmin();
  const { data: ativo, error } = await db
    .from('planos')
    .select('id')
    .eq('user_id', userId)
    .eq('ativo', true)
    .eq('cargo_id', cargoId)
    .maybeSingle();
  if (error) throw error;
  if (!ativo) return [];
  const { data, error: errFeitos } = await db.from('topicos_concluidos').select('topico_id').eq('plano_id', ativo.id);
  if (errFeitos) throw errFeitos;
  return (data ?? []).map((c) => c.topico_id as string);
}

/** Marca (ou desmarca) um tópico do plano como concluído. Idempotente. */
export async function marcarTopico(
  userId: string,
  planoId: string,
  topicoId: string,
  concluido: boolean,
  agora: Date = new Date(),
): Promise<void> {
  if (!uuid.safeParse(planoId).success) throw naoEncontrado();
  const db = criarClienteAdmin();
  const { data: plano, error } = await db
    .from('planos')
    .select('conteudo, ativo')
    .eq('id', planoId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  // Marcar grava revisões (estudo): só o plano ativo, e pelo ponto único de permissão.
  if (!plano || !plano.ativo) throw naoEncontrado();
  await exigirPodeRegistrar(userId);

  const disciplina = (plano.conteudo as DisciplinaPlano[]).find((d) => d.topicos.some((t) => t.id === topicoId));
  const topico = disciplina?.topicos.find((t) => t.id === topicoId);
  if (!disciplina || !topico) throw new PlanoInvalidoError('Este tópico não faz parte do plano.', 400);

  const { error: errGravar } = concluido
    ? await db
        .from('topicos_concluidos')
        .upsert({ plano_id: planoId, topico_id: topicoId }, { onConflict: 'plano_id,topico_id', ignoreDuplicates: true })
    : await db.from('topicos_concluidos').delete().eq('plano_id', planoId).eq('topico_id', topicoId);
  if (errGravar) throw errGravar;

  if (!concluido) {
    // Desfazer a marcação apaga as revisões pendentes que ela criou; as das sessões ficam.
    const { error: errApagar } = await db
      .from('revisoes')
      .delete()
      .eq('plano_id', planoId)
      .eq('topico_id', topicoId)
      .eq('origem', 'conclusao')
      .is('concluida_em', null);
    if (errApagar) throw errApagar;
    return;
  }

  const { data: pendentes, error: errPendentes } = await db
    .from('revisoes')
    .select('topico_id, intervalo')
    .eq('plano_id', planoId)
    .eq('topico_id', topicoId)
    .is('concluida_em', null);
  if (errPendentes) throw errPendentes;
  const hoje = hojeEmSaoPaulo(agora);
  const novas = revisoesParaCriar(
    topicoId,
    hoje,
    INTERVALOS_REVISAO,
    (pendentes ?? []).map((r) => ({ topicoId: r.topico_id as string, intervalo: r.intervalo as number })),
  );
  for (const nova of novas) {
    const { error: errNova } = await db.from('revisoes').insert({
      user_id: userId,
      plano_id: planoId,
      disciplina_id: disciplina.id,
      disciplina_nome: disciplina.nome,
      topico_id: topicoId,
      topico_nome: topico.nome,
      data_estudo: hoje,
      data_revisao: nova.dataRevisao,
      intervalo: nova.intervalo,
      origem: 'conclusao',
    });
    // 23505: outra requisição criou a mesma pendente agora; o resultado é o mesmo.
    if (errNova && errNova.code !== '23505') throw errNova;
  }
}
