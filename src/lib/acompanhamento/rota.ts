import 'server-only';
import { json } from '@/lib/editais/rota';
import { MSG_ERRO_ACOMPANHAMENTO } from './mensagens';
import { AcompanhamentoError } from './servico';

/** Erros de entrada viram 400/404/409/429 com a mensagem; o resto vira 500 genérico, sem vazar texto bruto. */
export function respostaDeErroAcompanhamento(erro: unknown): Response {
  if (erro instanceof AcompanhamentoError) return json({ erro: erro.message }, erro.status);
  console.error('[api/acompanhamento]', erro);
  return json({ erro: MSG_ERRO_ACOMPANHAMENTO }, 500);
}
