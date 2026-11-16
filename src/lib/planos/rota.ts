import 'server-only';
import { json } from '@/lib/editais/rota';
import { MSG_ERRO_PLANO } from './mensagens';
import { PlanoInvalidoError } from './servico';

/** Erros de entrada viram 400/404/409 com a mensagem; o resto vira 500 genérico, sem vazar texto bruto. */
export function respostaDeErroPlano(erro: unknown): Response {
  if (erro instanceof PlanoInvalidoError) return json({ erro: erro.message }, erro.status);
  console.error('[api/planos]', erro);
  return json({ erro: MSG_ERRO_PLANO }, 500);
}
