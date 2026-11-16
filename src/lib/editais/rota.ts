import 'server-only';
import { z } from 'zod';
import { criarClienteServidor } from '@/lib/supabase/servidor';
import { EnvioInvalidoError, usuarioTemAcesso } from './servico';
import { MSG_ERRO_GENERICO } from './limites';

export function json(corpo: unknown, status = 200): Response {
  return Response.json(corpo, { status });
}

/** Usuário da sessão (validado no Auth) ou null. Rotas de API respondem 401, não redirecionam. */
export async function usuarioDaRequisicao(): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user.id;
}

export const naoAutenticado = () => json({ erro: 'Faça login para continuar.' }, 401);
export const naoEncontrado = () => json({ erro: 'Não encontrado.' }, 404);

const uuid = z.uuid();

/** Autentica e confere o acesso ao edital. Devolve a resposta de erro ou o userId. */
export async function exigirAcessoAoEdital(
  editalId: string,
): Promise<{ resposta: Response } | { userId: string }> {
  const userId = await usuarioDaRequisicao();
  if (!userId) return { resposta: naoAutenticado() };
  if (!uuid.safeParse(editalId).success || !(await usuarioTemAcesso(userId, editalId))) {
    return { resposta: naoEncontrado() };
  }
  return { userId };
}

export const idValido = (id: string) => uuid.safeParse(id).success;

/** Converte erros em resposta sem vazar texto bruto. */
export function respostaDeErro(erro: unknown): Response {
  if (erro instanceof EnvioInvalidoError) return json({ erro: erro.message }, erro.status);
  console.error('[api/editais]', erro);
  return json({ erro: MSG_ERRO_GENERICO }, 500);
}
