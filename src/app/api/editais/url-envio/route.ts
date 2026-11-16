import { randomUUID } from 'node:crypto';
import { criarClienteAdmin } from '@/lib/supabase/admin';
import { json, naoAutenticado, respostaDeErro, usuarioDaRequisicao } from '@/lib/editais/rota';

export async function POST() {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const caminho = `tmp/${userId}/${randomUUID()}.pdf`;
    const { data, error } = await criarClienteAdmin().storage.from('editais').createSignedUploadUrl(caminho);
    if (error || !data) throw error ?? new Error('sem URL assinada');
    return json({ caminho, url: data.signedUrl });
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
