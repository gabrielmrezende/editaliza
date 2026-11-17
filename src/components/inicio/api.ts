import { pedir } from '@/components/onboarding/api';

/** Resposta das rotas da fila: a nova posição, ou o erro do servidor (409 = a fila mudou ou acabou). */
export type RespostaFila = { ok: true; posicao: number } | { ok: false; status: number; erro: string };

const urlFila = (planoId: string, acao: 'concluir' | 'voltar') =>
  `/api/planos/${encodeURIComponent(planoId)}/fila/${acao}`;

async function postar(url: string, corpo: unknown): Promise<RespostaFila> {
  const r = await pedir<{ posicao: number }>(url, { method: 'POST', body: JSON.stringify(corpo) });
  return r.ok ? { ok: true, posicao: r.dados.posicao } : { ok: false, status: r.status, erro: r.erro };
}

/** "Concluir bloco" (`avancar: true`) ou "Salvar sem concluir" (`avancar: false`). */
export function concluirBlocoNaApi(
  planoId: string,
  corpo: {
    posicaoEsperada: number;
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
export function voltarBlocoNaApi(planoId: string, posicaoEsperada: number): Promise<RespostaFila> {
  return postar(urlFila(planoId, 'voltar'), { posicaoEsperada });
}
