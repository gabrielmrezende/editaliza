import { respostaDeErroAcompanhamento } from '@/lib/acompanhamento/rota';
import { editarSessao, excluirSessao } from '@/lib/acompanhamento/servico';
import { EsquemaEdicaoSessao } from '@/lib/dominio/esquemas';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';

type Ctx = { params: Promise<{ id: string }> };

/** Edita a sessão (revisões já criadas não mudam). */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const corpo = EsquemaEdicaoSessao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return json({ erro: corpo.error.issues[0]?.message ?? 'Requisição inválida.' }, 400);
    const { id } = await params;
    await editarSessao(userId, id, corpo.data);
    return new Response(null, { status: 204 });
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}

/** Exclui a sessão e as revisões pendentes dela. */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const { id } = await params;
    await excluirSessao(userId, id);
    return new Response(null, { status: 204 });
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}
