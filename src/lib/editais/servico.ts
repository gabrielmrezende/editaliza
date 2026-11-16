import 'server-only';
import { PDFDocument } from 'pdf-lib';
import { atribuirIds } from '@/lib/dominio/esquemas';
import { consumirCota } from '@/lib/cotas';
import { custoDoErro, EditalInvalidoError, obterExtrator } from '@/lib/extracao';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { sha256Hex } from './hash';
import {
  JANELA_HORAS,
  JANELA_IA_MINUTOS,
  MAX_BYTES,
  MAX_CHAMADAS_IA,
  MAX_NOVOS_POR_JANELA,
  MAX_PAGINAS,
  MSG_COTA_IA,
  MSG_EDITAL_INVALIDO,
  MSG_ERRO_GENERICO,
  PROCESSANDO_MAX_MINUTOS,
} from './limites';

const BUCKET = 'editais';

/** Erro de entrada do usuário, com status HTTP e mensagem seguras para exibir. */
export class EnvioInvalidoError extends Error {
  constructor(
    mensagem: string,
    readonly status: 400 | 409 | 429,
  ) {
    super(mensagem);
    this.name = 'EnvioInvalidoError';
  }
}

function mensagemDeErro(erro: unknown): string {
  return erro instanceof EditalInvalidoError ? MSG_EDITAL_INVALIDO : MSG_ERRO_GENERICO;
}

/**
 * Cobra uma chamada de IA do usuário que a provocou, antes da chamada. Acima da cota, `liberar`
 * desfaz a reivindicação (o item volta a 'erro' com a mensagem da cota) e a rota responde 429.
 */
async function cobrarChamadaIA(userId: string, liberar: () => PromiseLike<unknown>): Promise<void> {
  if (await consumirCota(userId, 'ia', MAX_CHAMADAS_IA, JANELA_IA_MINUTOS)) return;
  await liberar();
  throw new EnvioInvalidoError(MSG_COTA_IA, 429);
}

const liberarEdital = (editalId: string) => () =>
  criarClienteAdmin().from('editais').update({ status: 'erro', erro: MSG_COTA_IA }).eq('id', editalId);

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
      // PDFs só com senha de permissões (sem senha de abertura) são comuns em editais: lê a estrutura assim mesmo.
      paginas = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
    } catch {
      throw new EnvioInvalidoError('arquivo não é um PDF válido', 400);
    }
    if (paginas > MAX_PAGINAS) throw new EnvioInvalidoError(`o edital excede ${MAX_PAGINAS} páginas`, 400);

    const sha256 = sha256Hex(bytes);
    const destino = `${sha256}.pdf`;

    // Limite + inserção atômicos, antes de qualquer gasto (storage, IA).
    const { data: reserva, error: errReserva } = await db.rpc('reservar_edital', {
      p_user: userId,
      p_sha256: sha256,
      p_storage_path: destino,
      p_limite: MAX_NOVOS_POR_JANELA,
      p_horas: JANELA_HORAS,
    });
    if (errReserva) throw errReserva;
    const r = (reserva as { edital_id: string | null; novo: boolean; limite_excedido: boolean }[])[0];
    if (r.limite_excedido) {
      throw new EnvioInvalidoError(
        `Você atingiu o limite de ${MAX_NOVOS_POR_JANELA} editais novos em ${JANELA_HORAS} horas. Tente de novo mais tarde.`,
        429,
      );
    }
    const editalId = r.edital_id!;
    await registrarAcesso(userId, editalId);
    if (!r.novo) {
      // Reparo: reserva anterior ficou sem arquivo (falha no envio ou função morta).
      // Reivindica atomicamente; o mesmo edital, então não conta no limite.
      const { data: reivindicado, error: errRep } = await db
        .from('editais')
        .update({ status: 'processando', erro: null, processando_desde: new Date().toISOString() })
        .eq('id', editalId)
        .is('anthropic_file_id', null)
        .or(`status.eq.erro,and(status.eq.processando,processando_desde.lt.${limiteExpirado()})`)
        .select('id');
      if (errRep) throw errRep;
      if (!reivindicado?.length) return { editalId, novo: false };
    }

    try {
      const { error: errUp } = await armazem.upload(destino, bytes, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (errUp) throw errUp;
      const fileId = await obterExtrator().enviarArquivo(bytes);
      const { error: errFile } = await db.from('editais').update({ anthropic_file_id: fileId }).eq('id', editalId);
      if (errFile) throw errFile;
    } catch (erro) {
      await marcarErroEdital(editalId, erro);
      throw erro;
    }
    // A leitura dos cargos (IA) será agendada pela rota: cobra antes. Acima da cota o edital fica
    // em 'erro' com o arquivo guardado, e "tentar de novo" funciona depois.
    await cobrarChamadaIA(userId, liberarEdital(editalId));
    return { editalId, novo: true };
  } finally {
    await armazem.remove([caminho]);
  }
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

/** Soma atômica (SQL) ao custo do edital: várias extrações podem terminar ao mesmo tempo. */
async function somarCusto(editalId: string, centavos: number): Promise<void> {
  if (!centavos) return;
  const { error } = await criarClienteAdmin().rpc('somar_custo_edital', { p_edital: editalId, p_centavos: centavos });
  if (error) console.error('[editais] falha ao somar custo', error);
}

/** Lista os cargos do edital com a IA. Nunca lança: falhas viram status 'erro'. */
export async function processarCargos(editalId: string): Promise<void> {
  const db = criarClienteAdmin();
  try {
    const { data: edital, error } = await db
      .from('editais')
      .select('anthropic_file_id, storage_path')
      .eq('id', editalId)
      .single();
    if (error) throw error;
    const extrator = obterExtrator();
    let fileId: string | null = edital.anthropic_file_id;
    if (!fileId) {
      // O envio à IA falhou antes: refaz a partir do arquivo guardado.
      const { data: blob, error: errDown } = await db.storage.from(BUCKET).download(edital.storage_path);
      if (errDown || !blob) throw errDown ?? new Error('arquivo do edital não encontrado');
      fileId = await extrator.enviarArquivo(Buffer.from(await blob.arrayBuffer()));
      await db.from('editais').update({ anthropic_file_id: fileId }).eq('id', editalId);
    }

    const { resumo, custoCentavos } = await extrator.listarCargos(fileId);

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
      })
      .eq('id', editalId);
    if (errUp) throw errUp;
    await somarCusto(editalId, custoCentavos);
  } catch (erro) {
    await somarCusto(editalId, custoDoErro(erro));
    await marcarErroEdital(editalId, erro);
  }
}

/**
 * Reabre um edital em 'erro' (cobrando a nova leitura de quem pediu). Falso se não estava em erro;
 * 409 se o arquivo não é um edital; 429 acima da cota de IA.
 */
export async function reiniciarEdital(userId: string, editalId: string): Promise<boolean> {
  const db = criarClienteAdmin();
  const { data: atual, error: errLer } = await db
    .from('editais')
    .select('status, erro')
    .eq('id', editalId)
    .maybeSingle();
  if (errLer) throw errLer;
  if (atual?.status === 'erro' && atual.erro === MSG_EDITAL_INVALIDO) {
    throw new EnvioInvalidoError(MSG_EDITAL_INVALIDO, 409);
  }
  const { data, error } = await db
    .from('editais')
    .update({ status: 'processando', erro: null, processando_desde: new Date().toISOString() })
    .eq('id', editalId)
    .eq('status', 'erro')
    .select('id');
  if (error) throw error;
  if ((data?.length ?? 0) === 0) return false;
  await cobrarChamadaIA(userId, liberarEdital(editalId));
  return true;
}

function limiteExpirado(): string {
  return new Date(Date.now() - PROCESSANDO_MAX_MINUTOS * 60_000).toISOString();
}

/** Grava como erro os cargos presos em 'processando' além do limite. */
async function expirarCargos(filtro: { editalId?: string; cargoId?: string }): Promise<void> {
  let q = criarClienteAdmin()
    .from('edital_cargos')
    .update({ status_conteudo: 'erro', erro: MSG_ERRO_GENERICO })
    .eq('status_conteudo', 'processando')
    .lt('processando_desde', limiteExpirado());
  if (filtro.editalId) q = q.eq('edital_id', filtro.editalId);
  if (filtro.cargoId) q = q.eq('id', filtro.cargoId);
  const { error } = await q;
  if (error) throw error;
}

/**
 * Reivindica o cargo para extração (pendente/erro → processando; também um 'processando' travado
 * há mais de 10 min), cobrando a chamada de quem pediu. Falso se já em andamento ou pronto.
 * 409 se o edital ainda não está pronto; 429 acima da cota de IA.
 */
export async function iniciarConteudo(userId: string, cargoId: string): Promise<boolean> {
  const db = criarClienteAdmin();
  const { data: cargo, error: errCargo } = await db
    .from('edital_cargos')
    .select('editais!inner(status)')
    .eq('id', cargoId)
    .maybeSingle();
  if (errCargo) throw errCargo;
  const edital = cargo?.editais as unknown as { status: string } | null;
  if (!edital) return false;
  if (edital.status !== 'pronto') throw new EnvioInvalidoError('O edital ainda não foi processado.', 409);

  const { data, error } = await db
    .from('edital_cargos')
    .update({ status_conteudo: 'processando', erro: null, processando_desde: new Date().toISOString() })
    .eq('id', cargoId)
    .or(
      `status_conteudo.in.(pendente,erro),and(status_conteudo.eq.processando,processando_desde.lt.${limiteExpirado()})`,
    )
    .select('id');
  if (error) throw error;
  if ((data?.length ?? 0) === 0) return false;
  await cobrarChamadaIA(userId, () =>
    db.from('edital_cargos').update({ status_conteudo: 'erro', erro: MSG_COTA_IA }).eq('id', cargoId),
  );
  return true;
}

/** Extrai o conteúdo programático do cargo. O nome do cargo vem do banco, nunca do cliente. Nunca lança. */
export async function processarConteudo(cargoId: string): Promise<void> {
  const db = criarClienteAdmin();
  let editalId: string | null = null;
  try {
    const { data: cargo, error } = await db
      .from('edital_cargos')
      .select('nome, edital_id')
      .eq('id', cargoId)
      .single();
    if (error) throw error;
    editalId = cargo.edital_id;
    const { data: edital, error: errEdital } = await db
      .from('editais')
      .select('anthropic_file_id')
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
    await somarCusto(cargo.edital_id, custoCentavos);
  } catch (erro) {
    console.error(`[editais] falha ao extrair conteúdo do cargo ${cargoId}`, erro);
    if (editalId) await somarCusto(editalId, custoDoErro(erro));
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

  await expirarCargos({ editalId });
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
  await expirarCargos({ cargoId });
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
