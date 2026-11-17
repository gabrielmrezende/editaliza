import { respostaDeErroAcompanhamento } from '@/lib/acompanhamento/rota';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';
import { ajustarAgora } from '@/lib/planos/ajuste-servico';

type Ctx = { params: Promise<{ id: string }> };

/** "Ajustar agora": no máximo 1 por 60 minutos (429 diz quando volta). */
export async function POST(_req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const { id } = await params;
    const ajusteId = await ajustarAgora(userId, id);
    return json({ ajusteId });
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}
