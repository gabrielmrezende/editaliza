import 'server-only';
import { criarClienteAdmin } from '@/lib/supabase/admin';

export type TipoCota = 'ia' | 'url_envio';

/** Consome uma unidade da cota do usuário (atômico, no banco). False se o limite da janela já foi atingido. */
export async function consumirCota(userId: string, tipo: TipoCota, limite: number, janelaMinutos: number): Promise<boolean> {
  const { data, error } = await criarClienteAdmin().rpc('consumir_cota', {
    p_user: userId,
    p_tipo: tipo,
    p_limite: limite,
    p_janela_minutos: janelaMinutos,
  });
  if (error) throw error;
  return data === true;
}
