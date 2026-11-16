import 'server-only';
import { z } from 'zod';
import type { EsquemaEntradaCriarPlano } from '@/lib/dominio/esquemas';
import type { ConteudoCargo, DisciplinaPlano } from '@/lib/dominio/tipos';
import { hojeEmSaoPaulo } from '@/lib/datas';
import { usuarioTemAcesso } from '@/lib/editais/servico';
import { gerarPlano } from '@/lib/plano/gerar';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { MSG_DATA_PASSADA } from './mensagens';

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

/** Limites generosos (um edital real tem dezenas de matérias e centenas de tópicos) contra abuso. */
export const LIMITES = { disciplinas: 100, topicos: 3000, nome: 300, id: 64 };

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
    concluidos: [],
    pesosInformados: (cargo.conteudo as ConteudoCargo).pesosInformados === true,
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

/** Marca (ou desmarca) um tópico do plano como concluído. Idempotente. */
export async function marcarTopico(userId: string, planoId: string, topicoId: string, concluido: boolean): Promise<void> {
  if (!uuid.safeParse(planoId).success) throw naoEncontrado();
  const db = criarClienteAdmin();
  const { data: plano, error } = await db
    .from('planos')
    .select('conteudo')
    .eq('id', planoId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!plano) throw naoEncontrado();

  const existe = (plano.conteudo as DisciplinaPlano[]).some((d) => d.topicos.some((t) => t.id === topicoId));
  if (!existe) throw new PlanoInvalidoError('Este tópico não faz parte do plano.', 400);

  const { error: errGravar } = concluido
    ? await db
        .from('topicos_concluidos')
        .upsert({ plano_id: planoId, topico_id: topicoId }, { onConflict: 'plano_id,topico_id', ignoreDuplicates: true })
    : await db.from('topicos_concluidos').delete().eq('plano_id', planoId).eq('topico_id', topicoId);
  if (errGravar) throw errGravar;
}
