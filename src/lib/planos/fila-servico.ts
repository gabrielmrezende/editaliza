import 'server-only';
import { z } from 'zod';
import {
  AcompanhamentoError,
  exigirDentroDoLimiteDiario,
  exigirPodeRegistrar,
  pendentesDoTopico,
  resolverNomes,
} from '@/lib/acompanhamento/servico';
import { revisoesParaCriar } from '@/lib/acompanhamento/revisoes';
import { hojeEmSaoPaulo } from '@/lib/datas';
import { INTERVALOS_REVISAO, type TipoSessao } from '@/lib/dominio/acompanhamento';
import type { EsquemaConcluirBloco, EsquemaVoltarBloco } from '@/lib/dominio/esquemas';
import type { BlocoEstudo, DisciplinaPlano, PlanoGerado } from '@/lib/dominio/tipos';
import { blocoDaFila, montarFila, topicoDoBloco } from '@/lib/plano/fila';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { MSG_FILA_FIM, MSG_FILA_MUDOU } from './mensagens';

export type ConcluirBlocoEntrada = z.output<typeof EsquemaConcluirBloco>;
export type VoltarBlocoEntrada = z.output<typeof EsquemaVoltarBloco>;

const uuid = z.uuid();
const naoEncontrado = () => new AcompanhamentoError('Não encontrado.', 404);
const filaMudou = () => new AcompanhamentoError(MSG_FILA_MUDOU, 409);

/** Tipo da sessão gravada por um bloco: estudo fica sem tipo; reserva final vira revisão ou simulado. */
const TIPO_DA_SESSAO: Record<BlocoEstudo['tipo'], TipoSessao | null> = {
  estudo: null,
  revisao_geral: 'revisao',
  simulado: 'simulado',
};

/** O plano ativo do usuário com `planoId`; outro plano (ou id inválido) → 404; sem plano ativo → 409. */
async function exigirPlanoAtivo(userId: string, planoId: string): Promise<string> {
  const plano = await exigirPodeRegistrar(userId);
  if (!uuid.safeParse(planoId).success || planoId !== plano.id) throw naoEncontrado();
  return plano.id;
}

interface LinhaFila {
  gerado: PlanoGerado;
  conteudo: DisciplinaPlano[];
  fila_posicao: number;
  fila_desde: string | null;
  /** Exatamente como o PostgREST devolveu: volta igual para a checagem otimista de `concluir_bloco`. */
  ajustado_em: string | null;
}

/** Grava a sessão do bloco atual (com revisões e conclusão do tópico) e, se `avancar`, avança a fila. */
export async function concluirBloco(
  userId: string,
  planoId: string,
  entrada: ConcluirBlocoEntrada,
  agora: Date = new Date(),
): Promise<{ posicao: number; sessaoId: string }> {
  const id = await exigirPlanoAtivo(userId, planoId);
  const db = criarClienteAdmin();
  const [{ data: linha, error }, { data: feitos, error: errFeitos }] = await Promise.all([
    db
      .from('planos')
      .select('gerado, conteudo, fila_posicao, fila_desde, ajustado_em')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle<LinhaFila>(),
    db.from('topicos_concluidos').select('topico_id').eq('plano_id', id),
  ]);
  if (error) throw error;
  if (errFeitos) throw errFeitos;
  if (!linha) throw naoEncontrado();
  if (entrada.posicaoEsperada !== linha.fila_posicao) throw filaMudou();

  const fila = montarFila(linha.gerado, linha.fila_desde);
  const bloco = blocoDaFila(fila, linha.fila_posicao);
  if (!bloco) throw new AcompanhamentoError(MSG_FILA_FIM, 409);

  const concluidos = new Set((feitos ?? []).map((f) => f.topico_id as string));
  const topicoId = bloco.tipo === 'estudo' ? topicoDoBloco(bloco, fila, linha.conteudo, concluidos) : null;
  const { disciplinaNome, topicoNome } = resolverNomes(linha.conteudo, bloco.disciplinaId, topicoId);

  const hoje = hojeEmSaoPaulo(agora);
  const revisoes =
    topicoId === null
      ? []
      : revisoesParaCriar(topicoId, hoje, INTERVALOS_REVISAO, await pendentesDoTopico(id, topicoId)).map((r) => ({
          intervalo: r.intervalo,
          data_revisao: r.dataRevisao,
        }));
  await exigirDentroDoLimiteDiario(userId, hoje);

  const { data, error: errRpc } = await db.rpc('concluir_bloco', {
    p_user: userId,
    p_plano: id,
    p_esperada: entrada.posicaoEsperada,
    p_ajustado_lido: linha.ajustado_em,
    p_avancar: entrada.avancar,
    p_sessao: {
      data: hoje,
      disciplina_id: bloco.disciplinaId,
      disciplina_nome: disciplinaNome,
      topico_id: topicoId,
      topico_nome: topicoNome,
      minutos: entrada.minutos,
      acertos: entrada.acertos,
      erros: entrada.erros,
      tipo: TIPO_DA_SESSAO[bloco.tipo],
      observacao: null,
      origem: entrada.origem,
    },
    p_revisoes: revisoes,
    p_concluir: entrada.concluirTopico && topicoId !== null,
  });
  if (errRpc) {
    if (errRpc.code === 'EZ409') throw filaMudou();
    if (errRpc.code === 'P0002') throw naoEncontrado();
    throw errRpc;
  }
  const resultado = data as { sessao_id: string; posicao: number };
  return { posicao: resultado.posicao, sessaoId: resultado.sessao_id };
}

/** Recua a fila 1 bloco (mínimo 0). Não apaga sessão. */
export async function voltarBloco(
  userId: string,
  planoId: string,
  entrada: VoltarBlocoEntrada,
): Promise<{ posicao: number }> {
  const id = await exigirPlanoAtivo(userId, planoId);
  const db = criarClienteAdmin();
  const esperada = entrada.posicaoEsperada;

  if (esperada === 0) {
    const { data, error } = await db
      .from('planos')
      .select('fila_posicao')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('ativo', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw naoEncontrado();
    if (data.fila_posicao !== 0) throw filaMudou();
    return { posicao: 0 };
  }

  const { data, error } = await db
    .from('planos')
    .update({ fila_posicao: esperada - 1, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('ativo', true)
    .eq('fila_posicao', esperada)
    .select('fila_posicao');
  if (error) throw error;
  if (!data?.length) throw filaMudou();
  return { posicao: data[0].fila_posicao as number };
}
