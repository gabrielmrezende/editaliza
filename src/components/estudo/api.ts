import { pedir } from '@/components/onboarding/api';
import type { OrigemSessao, TipoSessao } from '@/lib/dominio/acompanhamento';

/** Corpo de POST /api/sessoes (ver EsquemaNovaSessao). */
export interface NovaSessaoCliente {
  planoId: string;
  data: string;
  disciplinaId: string;
  topicoId: string | null;
  minutos: number;
  acertos: number;
  erros: number;
  tipo: TipoSessao | null;
  observacao: string | null;
  origem: OrigemSessao;
  intervalos: number[];
  concluir: boolean;
}

/** Grava a sessão; em erro, lança `Error` com a mensagem do servidor (já em pt-BR). */
export async function registrarSessao(sessao: NovaSessaoCliente): Promise<string> {
  const r = await pedir<{ sessaoId: string }>('/api/sessoes', { method: 'POST', body: JSON.stringify(sessao) });
  if (!r.ok) throw new Error(r.erro);
  return r.dados.sessaoId;
}
