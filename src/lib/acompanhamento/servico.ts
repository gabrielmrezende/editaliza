import 'server-only';
import { z } from 'zod';
import { hojeEmSaoPaulo, inicioDoDiaEmSaoPaulo, somarDias } from '@/lib/datas';
import type { EsquemaEdicaoSessao, EsquemaNovaSessao } from '@/lib/dominio/esquemas';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import {
  MAX_DIAS_PASSADO,
  MAX_SESSOES_POR_DIA,
  MSG_DATA_ANTIGA,
  MSG_DATA_FUTURA,
  MSG_FORA_DO_PLANO,
  MSG_MUITAS_SESSOES,
  MSG_PLANO_ANTIGO,
  MSG_REVISAO_REPETIDA,
  MSG_SEM_PLANO_ATIVO,
  MSG_TEMPO_OU_QUESTOES,
} from './mensagens';
import { revisoesParaCriar } from './revisoes';

export type NovaSessaoEntrada = z.output<typeof EsquemaNovaSessao>;
export type EdicaoSessaoEntrada = z.output<typeof EsquemaEdicaoSessao>;

/** Erro de entrada do usuário, com status HTTP e mensagem seguras para exibir. */
export class AcompanhamentoError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 404 | 409 | 429,
  ) {
    super(mensagem);
    this.name = 'AcompanhamentoError';
  }
}

const naoEncontrado = () => new AcompanhamentoError('Não encontrado.', 404);
const uuid = z.uuid();

export interface PlanoAtivo {
  id: string;
  conteudo: DisciplinaPlano[];
  createdAt: string;
}

/**
 * Ponto único para toda escrita de estudo (o Plano 3 põe a checagem de assinatura aqui).
 * Sem plano ativo → 409.
 */
export async function exigirPodeRegistrar(userId: string): Promise<PlanoAtivo> {
  const { data, error } = await criarClienteAdmin()
    .from('planos')
    .select('id, conteudo, created_at')
    .eq('user_id', userId)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AcompanhamentoError(MSG_SEM_PLANO_ATIVO, 409);
  return { id: data.id as string, conteudo: data.conteudo as DisciplinaPlano[], createdAt: data.created_at as string };
}

/** A data de uma sessão: não no futuro (dia de São Paulo) e no máximo 365 dias atrás. */
function validarData(data: string, hoje: string): void {
  if (data > hoje) throw new AcompanhamentoError(MSG_DATA_FUTURA, 400);
  if (data < somarDias(hoje, -MAX_DIAS_PASSADO)) throw new AcompanhamentoError(MSG_DATA_ANTIGA, 400);
}

/** Matéria e tópico (ids) dentro do conteúdo; devolve os nomes, que nunca vêm do cliente. */
function resolverNomes(
  conteudo: DisciplinaPlano[],
  disciplinaId: string,
  topicoId: string | null,
): { disciplinaNome: string; topicoNome: string | null } {
  const disciplina = conteudo.find((d) => d.id === disciplinaId);
  if (!disciplina) throw new AcompanhamentoError(MSG_FORA_DO_PLANO, 400);
  if (topicoId === null) return { disciplinaNome: disciplina.nome, topicoNome: null };
  const topico = disciplina.topicos.find((t) => t.id === topicoId);
  if (!topico) throw new AcompanhamentoError(MSG_FORA_DO_PLANO, 400);
  return { disciplinaNome: disciplina.nome, topicoNome: topico.nome };
}

/** Limite diário por usuário: conta as sessões criadas no dia de São Paulo de `hoje`. */
async function exigirDentroDoLimiteDiario(userId: string, hoje: string): Promise<void> {
  const inicio = inicioDoDiaEmSaoPaulo(hoje);
  const fim = inicioDoDiaEmSaoPaulo(somarDias(hoje, 1));
  const { count, error } = await criarClienteAdmin()
    .from('sessoes_estudo')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', inicio)
    .lt('created_at', fim);
  if (error) throw error;
  if ((count ?? 0) >= MAX_SESSOES_POR_DIA) throw new AcompanhamentoError(MSG_MUITAS_SESSOES, 429);
}

/** Revisões ainda pendentes do tópico no plano, para não duplicar. */
async function pendentesDoTopico(
  planoId: string,
  topicoId: string,
): Promise<{ topicoId: string; intervalo: number }[]> {
  const { data, error } = await criarClienteAdmin()
    .from('revisoes')
    .select('topico_id, intervalo')
    .eq('plano_id', planoId)
    .eq('topico_id', topicoId)
    .is('concluida_em', null);
  if (error) throw error;
  return (data ?? []).map((r) => ({ topicoId: r.topico_id as string, intervalo: r.intervalo as number }));
}

/** Grava a sessão (e as revisões marcadas, e a conclusão do tópico) numa transação. */
export async function registrarSessao(
  userId: string,
  entrada: NovaSessaoEntrada,
  agora: Date = new Date(),
): Promise<{ sessaoId: string }> {
  const plano = await exigirPodeRegistrar(userId);
  if (entrada.planoId !== plano.id) throw naoEncontrado();

  const hoje = hojeEmSaoPaulo(agora);
  validarData(entrada.data, hoje);
  const { disciplinaNome, topicoNome } = resolverNomes(plano.conteudo, entrada.disciplinaId, entrada.topicoId);
  await exigirDentroDoLimiteDiario(userId, hoje);

  const revisoes =
    entrada.topicoId === null
      ? []
      : revisoesParaCriar(
          entrada.topicoId,
          entrada.data,
          entrada.intervalos,
          await pendentesDoTopico(plano.id, entrada.topicoId),
        ).map((r) => ({ intervalo: r.intervalo, data_revisao: r.dataRevisao }));

  const { data, error } = await criarClienteAdmin().rpc('registrar_sessao', {
    p_user: userId,
    p_plano: plano.id,
    p_sessao: {
      data: entrada.data,
      disciplina_id: entrada.disciplinaId,
      disciplina_nome: disciplinaNome,
      topico_id: entrada.topicoId,
      topico_nome: topicoNome,
      minutos: entrada.minutos,
      acertos: entrada.acertos,
      erros: entrada.erros,
      tipo: entrada.tipo,
      observacao: entrada.observacao,
      origem: entrada.origem,
    },
    p_revisoes: revisoes,
    p_concluir: entrada.concluir,
  });
  if (error) {
    if (error.code === 'P0002') throw naoEncontrado();
    throw error;
  }
  return { sessaoId: data as string };
}

/** Edita uma sessão. Revisões já criadas não mudam. */
export async function editarSessao(
  userId: string,
  sessaoId: string,
  mudancas: EdicaoSessaoEntrada,
  agora: Date = new Date(),
): Promise<void> {
  if (!uuid.safeParse(sessaoId).success) throw naoEncontrado();
  const db = criarClienteAdmin();
  const { data: atual, error } = await db
    .from('sessoes_estudo')
    .select('plano_id, disciplina_id, topico_id, minutos, acertos, erros')
    .eq('id', sessaoId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!atual) throw naoEncontrado();

  const plano = await exigirPodeRegistrar(userId);
  const hoje = hojeEmSaoPaulo(agora);

  const disciplinaId = mudancas.disciplinaId ?? (atual.disciplina_id as string);
  const topicoId = mudancas.topicoId === undefined ? (atual.topico_id as string | null) : mudancas.topicoId;
  const trocouConteudo = disciplinaId !== atual.disciplina_id || topicoId !== atual.topico_id;

  const campos: Record<string, unknown> = { updated_at: agora.toISOString() };
  if (mudancas.data !== undefined) {
    validarData(mudancas.data, hoje);
    campos.data = mudancas.data;
  }
  if (trocouConteudo) {
    // Sessão de plano que não é o ativo (ou de matéria que saiu do conteúdo) mantém o nome guardado.
    const materiaExiste = plano.conteudo.some((d) => d.id === atual.disciplina_id);
    if (atual.plano_id !== plano.id || !materiaExiste) throw new AcompanhamentoError(MSG_PLANO_ANTIGO, 400);
    const nomes = resolverNomes(plano.conteudo, disciplinaId, topicoId);
    campos.disciplina_id = disciplinaId;
    campos.disciplina_nome = nomes.disciplinaNome;
    campos.topico_id = topicoId;
    campos.topico_nome = nomes.topicoNome;
  }

  const minutos = mudancas.minutos ?? (atual.minutos as number);
  const acertos = mudancas.acertos ?? (atual.acertos as number);
  const erros = mudancas.erros ?? (atual.erros as number);
  if (minutos <= 0 && acertos + erros <= 0) throw new AcompanhamentoError(MSG_TEMPO_OU_QUESTOES, 400);
  Object.assign(campos, { minutos, acertos, erros });
  if (mudancas.tipo !== undefined) campos.tipo = mudancas.tipo;
  if (mudancas.observacao !== undefined) campos.observacao = mudancas.observacao;

  const { data: gravada, error: errGravar } = await db
    .from('sessoes_estudo')
    .update(campos)
    .eq('id', sessaoId)
    .eq('user_id', userId)
    .select('id');
  if (errGravar) throw errGravar;
  if (!gravada?.length) throw naoEncontrado();
}

/**
 * Exclui a sessão: revisões pendentes dela somem (ou passam para outra sessão do tópico), as concluídas ficam.
 * Exclusão não passa pelo portão de registro (`exigirPodeRegistrar`) — decisão do Plano 2; Plano 3: revisar.
 */
export async function excluirSessao(userId: string, sessaoId: string): Promise<void> {
  if (!uuid.safeParse(sessaoId).success) throw naoEncontrado();
  const { data, error } = await criarClienteAdmin().rpc('excluir_sessao', { p_user: userId, p_sessao: sessaoId });
  if (error) throw error;
  if (data !== true) throw naoEncontrado();
}

/** Conclui ou desfaz uma revisão. Não cria sessão. */
export async function marcarRevisao(
  userId: string,
  revisaoId: string,
  concluida: boolean,
  agora: Date = new Date(),
): Promise<void> {
  if (!uuid.safeParse(revisaoId).success) throw naoEncontrado();
  const plano = await exigirPodeRegistrar(userId);
  const { data, error } = await criarClienteAdmin()
    .from('revisoes')
    .update({ concluida_em: concluida ? agora.toISOString() : null })
    .eq('id', revisaoId)
    .eq('user_id', userId)
    .eq('plano_id', plano.id)
    .select('id');
  if (error) {
    // Desfazer uma concluída quando já há outra pendente igual (índice único parcial).
    if (error.code === '23505') throw new AcompanhamentoError(MSG_REVISAO_REPETIDA, 409);
    throw error;
  }
  if (!data?.length) throw naoEncontrado();
}

/** Id do plano ativo do usuário, ou null se ele não tem plano ativo. */
async function idDoPlanoAtivo(userId: string): Promise<string | null> {
  const { data, error } = await criarClienteAdmin()
    .from('planos')
    .select('id')
    .eq('user_id', userId)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  return (data?.id as string | undefined) ?? null;
}

/**
 * Exclui uma revisão do plano ativo (fora dele, ou sem plano ativo: 404, como em `marcarRevisao`).
 * Exclusão não passa pelo portão de registro (`exigirPodeRegistrar`) — decisão do Plano 2; Plano 3: revisar.
 */
export async function excluirRevisao(userId: string, revisaoId: string): Promise<void> {
  if (!uuid.safeParse(revisaoId).success) throw naoEncontrado();
  const planoId = await idDoPlanoAtivo(userId);
  if (!planoId) throw naoEncontrado();
  const { data, error } = await criarClienteAdmin()
    .from('revisoes')
    .delete()
    .eq('id', revisaoId)
    .eq('user_id', userId)
    .eq('plano_id', planoId)
    .select('id');
  if (error) throw error;
  if (!data?.length) throw naoEncontrado();
}
