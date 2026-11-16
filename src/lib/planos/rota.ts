import 'server-only';
import { json, respostaDeErro } from '@/lib/editais/rota';
import { PlanoInvalidoError } from './servico';

/** Erros de entrada viram 400/404/409 com a mensagem; o resto vira 500 genérico. */
export function respostaDeErroPlano(erro: unknown): Response {
  if (erro instanceof PlanoInvalidoError) return json({ erro: erro.message }, erro.status);
  return respostaDeErro(erro);
}
