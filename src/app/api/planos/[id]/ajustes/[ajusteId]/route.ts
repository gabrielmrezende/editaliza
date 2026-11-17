import { z } from 'zod';
import { respostaDeErroAcompanhamento } from '@/lib/acompanhamento/rota';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';
import { marcarResumoVisto } from '@/lib/planos/ajuste-servico';

type Ctx = { params: Promise<{ id: string; ajusteId: string }> };

const EsquemaVisto = z.object({ visto: z.literal(true) });

/** Fecha o resumo do ajuste: corpo `{ visto: true }`. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    if (!EsquemaVisto.safeParse(await req.json().catch(() => null)).success) {
      return json({ erro: 'Requisição inválida.' }, 400);
    }
    const { id, ajusteId } = await params;
    await marcarResumoVisto(userId, id, ajusteId);
    return new Response(null, { status: 204 });
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}
