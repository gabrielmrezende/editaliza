import { z } from 'zod';
import { respostaDeErroAcompanhamento } from '@/lib/acompanhamento/rota';
import { excluirRevisao, marcarRevisao } from '@/lib/acompanhamento/servico';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';

type Ctx = { params: Promise<{ id: string }> };

const EsquemaMarcarRevisao = z.object({ concluida: z.boolean() });

/** Conclui (`concluida: true`) ou desfaz uma revisão. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const corpo = EsquemaMarcarRevisao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return json({ erro: 'Requisição inválida.' }, 400);
    const { id } = await params;
    await marcarRevisao(userId, id, corpo.data.concluida);
    return new Response(null, { status: 204 });
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}

/** Exclui a revisão. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const { id } = await params;
    await excluirRevisao(userId, id);
    return new Response(null, { status: 204 });
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}
