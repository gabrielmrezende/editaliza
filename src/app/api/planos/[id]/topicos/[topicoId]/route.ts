import { naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';
import { respostaDeErroPlano } from '@/lib/planos/rota';
import { marcarTopico } from '@/lib/planos/servico';

type Ctx = { params: Promise<{ id: string; topicoId: string }> };

async function alterar({ params }: Ctx, concluido: boolean): Promise<Response> {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const { id, topicoId } = await params;
    await marcarTopico(userId, id, topicoId, concluido);
    return new Response(null, { status: 204 });
  } catch (erro) {
    return respostaDeErroPlano(erro);
  }
}

/** Marca o tópico como concluído. */
export function PUT(_req: Request, ctx: Ctx) {
  return alterar(ctx, true);
}

/** Desmarca o tópico. */
export function DELETE(_req: Request, ctx: Ctx) {
  return alterar(ctx, false);
}
