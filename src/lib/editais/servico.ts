import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { atribuirIds } from '@/lib/dominio/esquemas';
import { EditalInvalidoError, obterExtrator } from '@/lib/extracao';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { sha256Hex } from './hash';
import {
  JANELA_HORAS,
  MAX_BYTES,
  MAX_NOVOS_POR_JANELA,
  MAX_PAGINAS,
  MSG_EDITAL_INVALIDO,
  MSG_ERRO_GENERICO,
  PROCESSANDO_MAX_MINUTOS,
} from './limites';

const BUCKET = 'editais';

/** Erro de entrada do usuário, com status HTTP e mensagem seguras para exibir. */
export class EnvioInvalidoError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 429,
  ) {
    super(mensagem);
    this.name = 'EnvioInvalidoError';
  }
}

function mensagemDeErro(erro: unknown): string {
  return erro instanceof EditalInvalidoError ? MSG_EDITAL_INVALIDO : MSG_ERRO_GENERICO;
}

/**
 * Valida e registra o PDF enviado para tmp/. O agendamento do processamento
 * (after()) é responsabilidade da rota; aqui nada é agendado.
 */
export async function receberEdital(
  userId: string,
  caminho: string,
): Promise<{ editalId: string; novo: boolean }> {
  if (!caminho.startsWith(`tmp/${userId}/`) || caminho.includes('..')) {
    throw new EnvioInvalidoError('caminho de envio inválido', 400);
  }
  const db = criarClienteAdmin();
  const armazem = db.storage.from(BUCKET);

  const { data: blob, error: errDownload } = await armazem.download(caminho);
  if (errDownload || !blob) throw new EnvioInvalidoError('arquivo não encontrado', 400);

  try {
    if (blob.size > MAX_BYTES) throw new EnvioInvalidoError('o arquivo excede 50 MB', 400);
    const bytes = Buffer.from(await blob.arrayBuffer());

    let paginas: number;
    try {
      if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('sem cabeçalho PDF');
      paginas = (await PDFDocument.load(bytes)).getPageCount();
    } catch {
      throw new EnvioInvalidoError('arquivo não é um PDF válido', 400);
    }
    if (paginas > MAX_PAGINAS) throw new EnvioInvalidoError(`o edital excede ${MAX_PAGINAS} páginas`, 400);

    const sha256 = sha256Hex(bytes);

    const existente = await buscarPorHash(sha256);
    if (existente) {
      await registrarAcesso(userId, existente);
      return { editalId: existente, novo: false };
    }

    const desde = new Date(Date.now() - JANELA_HORAS * 3600_000).toISOString();
    const { count, error: errCount } = await db
      .from('editais')
      .select('id', { count: 'exact', head: true })
      .eq('enviado_por', userId)
      .gte('created_at', desde);
    if (errCount) throw errCount;
    if ((count ?? 0) >= MAX_NOVOS_POR_JANELA) {
      throw new EnvioInvalidoError(
        `Você atingiu o limite de ${MAX_NOVOS_POR_JANELA} editais novos em ${JANELA_HORAS} horas. Tente de novo mais tarde.`,
        429,
      );
    }

    const destino = `${sha256}.pdf`;
    const { error: errUp } = await armazem.upload(destino, bytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
    if (errUp) throw errUp;

    const fileId = await obterExtrator().enviarArquivo(bytes);

    // Corrida: dois envios do mesmo PDF passam pela checagem acima; o índice único decide.
    const { data: inseridos, error: errIns } = await db
      .from('editais')
      .upsert(
        {
          sha256,
          storage_path: destino,
          anthropic_file_id: fileId,
          status: 'processando',
          enviado_por: userId,
          processando_desde: new Date().toISOString(),
        },
        { onConflict: 'sha256', ignoreDuplicates: true },
      )
      .select('id');
    if (errIns) throw errIns;

    const novo = (inseridos?.length ?? 0) > 0;
    const editalId = novo ? inseridos![0].id : await buscarPorHash(sha256);
    if (!editalId) throw new Error('edital não encontrado após inserção');
    await registrarAcesso(userId, editalId);
    return { editalId, novo };
  } finally {
    await armazem.remove([caminho]);
  }
}

async function buscarPorHash(sha256: string): Promise<string | null> {
  const { data, error } = await criarClienteAdmin().from('editais').select('id').eq('sha256', sha256).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

async function registrarAcesso(userId: string, editalId: string): Promise<void> {
  const { error } = await criarClienteAdmin()
    .from('edital_acessos')
    .upsert({ user_id: userId, edital_id: editalId }, { onConflict: 'user_id,edital_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function usuarioTemAcesso(userId: string, editalId: string): Promise<boolean> {
  const { data, error } = await criarClienteAdmin()
    .from('edital_acessos')
    .select('edital_id')
    .eq('user_id', userId)
    .eq('edital_id', editalId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function marcarErroEdital(editalId: string, erro: unknown): Promise<void> {
  console.error(`[editais] falha ao processar edital ${editalId}`, erro);
  await criarClienteAdmin()
    .from('editais')
    .update({ status: 'erro', erro: mensagemDeErro(erro) })
    .eq('id', editalId);
}

/** Lista os cargos do edital com a IA. Nunca lança: falhas viram status 'erro'. */
export async function processarCargos(editalId: string): Promise<void> {
  const db = criarClienteAdmin();
  try {
    const { data: edital, error } = await db
      .from('editais')
      .select('anthropic_file_id, custo_centavos')
      .eq('id', editalId)
      .single();
    if (error) throw error;
    if (!edital.anthropic_file_id) throw new Error('edital sem arquivo na IA');

    const { resumo, custoCentavos } = await obterExtrator().listarCargos(edital.anthropic_file_id);

    // Idempotente: uma tentativa anterior pode ter parado no meio.
    const { error: errDel } = await db.from('edital_cargos').delete().eq('edital_id', editalId);
    if (errDel) throw errDel;
    const { error: errCargos } = await db
      .from('edital_cargos')
      .insert(resumo.cargos.map((c) => ({ edital_id: editalId, nome: c.nome, status_conteudo: 'pendente' })));
    if (errCargos) throw errCargos;

    const { error: errUp } = await db
      .from('editais')
      .update({
        orgao: resumo.orgao,
        banca: resumo.banca,
        ano: resumo.ano,
        data_prova: resumo.dataProva,
        status: 'pronto',
        erro: null,
        custo_centavos: (edital.custo_centavos ?? 0) + custoCentavos,
      })
      .eq('id', editalId);
    if (errUp) throw errUp;
  } catch (erro) {
    await marcarErroEdital(editalId, erro);
  }
}

/** Reabre um edital em 'erro' para nova tentativa. Devolve false se não estava em erro. */
export async function reiniciarEdital(editalId: string): Promise<boolean> {
  const { data, error } = await criarClienteAdmin()
    .from('editais')
    .update({ status: 'processando', erro: null, processando_desde: new Date().toISOString() })
    .eq('id', editalId)
    .eq('status', 'erro')
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Reivindica o cargo para extração (pendente/erro → processando). Falso se já em andamento ou pronto. */
export async function iniciarConteudo(cargoId: string): Promise<boolean> {
  const { data, error } = await criarClienteAdmin()
    .from('edital_cargos')
    .update({ status_conteudo: 'processando', erro: null })
    .eq('id', cargoId)
    .in('status_conteudo', ['pendente', 'erro'])
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Extrai o conteúdo programático do cargo. O nome do cargo vem do banco, nunca do cliente. Nunca lança. */
export async function processarConteudo(cargoId: string): Promise<void> {
  const db = criarClienteAdmin();
  try {
    const { data: cargo, error } = await db
      .from('edital_cargos')
      .select('nome, edital_id')
      .eq('id', cargoId)
      .single();
    if (error) throw error;
    const { data: edital, error: errEdital } = await db
      .from('editais')
      .select('anthropic_file_id, custo_centavos')
      .eq('id', cargo.edital_id)
      .single();
    if (errEdital) throw errEdital;
    if (!edital.anthropic_file_id) throw new Error('edital sem arquivo na IA');

    const { conteudo, custoCentavos } = await obterExtrator().extrairConteudo(edital.anthropic_file_id, cargo.nome);

    const { error: errUp } = await db
      .from('edital_cargos')
      .update({ conteudo: atribuirIds(conteudo), status_conteudo: 'pronto', erro: null })
      .eq('id', cargoId);
    if (errUp) throw errUp;

    const { error: errCusto } = await db
      .from('editais')
      .update({ custo_centavos: (edital.custo_centavos ?? 0) + custoCentavos })
      .eq('id', cargo.edital_id);
    if (errCusto) console.error('[editais] falha ao somar custo', errCusto);
  } catch (erro) {
    console.error(`[editais] falha ao extrair conteúdo do cargo ${cargoId}`, erro);
    await db
      .from('edital_cargos')
      .update({ status_conteudo: 'erro', erro: mensagemDeErro(erro) })
      .eq('id', cargoId);
  }
}

export type EditalVisao = {
  status: 'processando' | 'pronto' | 'erro';
  erro: string | null;
  resumo: { orgao: string | null; banca: string | null; ano: number | null; dataProva: string | null };
  cargos: { id: string; nome: string; statusConteudo: string }[];
};

/** Estado do edital para o cliente. Processando há mais de 10 min vira erro (e é gravado). */
export async function lerEdital(editalId: string): Promise<EditalVisao | null> {
  const db = criarClienteAdmin();
  const { data: e, error } = await db
    .from('editais')
    .select('status, erro, orgao, banca, ano, data_prova, processando_desde')
    .eq('id', editalId)
    .maybeSingle();
  if (error) throw error;
  if (!e) return null;

  let status = e.status as EditalVisao['status'];
  let erro: string | null = e.erro;
  if (status === 'processando' && e.processando_desde) {
    const limite = Date.now() - PROCESSANDO_MAX_MINUTOS * 60_000;
    if (new Date(e.processando_desde).getTime() < limite) {
      status = 'erro';
      erro = MSG_ERRO_GENERICO;
      await db.from('editais').update({ status: 'erro', erro }).eq('id', editalId).eq('status', 'processando');
    }
  }

  const { data: cargos, error: errCargos } = await db
    .from('edital_cargos')
    .select('id, nome, status_conteudo')
    .eq('edital_id', editalId)
    .order('nome');
  if (errCargos) throw errCargos;

  return {
    status,
    erro,
    resumo: { orgao: e.orgao, banca: e.banca, ano: e.ano, dataProva: e.data_prova },
    cargos: (cargos ?? []).map((c) => ({ id: c.id, nome: c.nome, statusConteudo: c.status_conteudo })),
  };
}

export type CargoVisao = { editalId: string; statusConteudo: string; erro: string | null; conteudo: unknown };

export async function lerCargo(cargoId: string): Promise<CargoVisao | null> {
  const { data, error } = await criarClienteAdmin()
    .from('edital_cargos')
    .select('edital_id, status_conteudo, erro, conteudo')
    .eq('id', cargoId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    editalId: data.edital_id,
    statusConteudo: data.status_conteudo,
    erro: data.erro,
    conteudo: data.status_conteudo === 'pronto' ? data.conteudo : null,
  };
}
