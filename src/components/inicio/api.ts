import { pedir } from '@/components/onboarding/api';

/** Resposta das rotas da fila: a nova posição, ou o erro do servidor (409 = a fila mudou ou acabou). */
export type RespostaFila = { ok: true; posicao: number } | { ok: false; status: number; erro: string };

const urlFila = (planoId: string, acao: 'concluir' | 'voltar') =>
  `/api/planos/${encodeURIComponent(planoId)}/fila/${acao}`;

async function postar(url: string, corpo: unknown): Promise<RespostaFila> {
  const r = await pedir<{ posicao: number }>(url, { method: 'POST', body: JSON.stringify(corpo) });
  return r.ok ? { ok: true, posicao: r.dados.posicao } : { ok: false, status: r.status, erro: r.erro };
}

/** O que a tela leu da fila: a posição e o `ajustado_em` do plano, como o servidor mandou. */
export interface FilaLida {
  posicaoEsperada: number;
  ajustadoLido: string | null;
}

/**
 * "Concluir bloco" (`avancar: true`) ou "Salvar sem concluir" (`avancar: false`). A matéria e o tópico
 * são os mostrados na tela: o servidor recusa (409) se o bloco dele for outro.
 */
export function concluirBlocoNaApi(
  planoId: string,
  corpo: FilaLida & {
    disciplinaId: string;
    topicoId: string | null;
    minutos: number;
    acertos: number;
    erros: number;
    concluirTopico: boolean;
    avancar: boolean;
    origem: 'cronometro' | 'rapido';
  },
): Promise<RespostaFila> {
  return postar(urlFila(planoId, 'concluir'), corpo);
}

/** "Voltar um bloco": só recua a posição. */
export function voltarBlocoNaApi(planoId: string, lida: FilaLida): Promise<RespostaFila> {
  return postar(urlFila(planoId, 'voltar'), lida);
}
