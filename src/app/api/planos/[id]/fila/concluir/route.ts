import { respostaDeErroAcompanhamento } from '@/lib/acompanhamento/rota';
import { EsquemaConcluirBloco } from '@/lib/dominio/esquemas';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';
import { concluirBloco } from '@/lib/planos/fila-servico';

type Ctx = { params: Promise<{ id: string }> };

/** "Concluir bloco" (ou "Salvar sem concluir", com `avancar: false`): grava a sessão do bloco atual. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const { id } = await params;
    const corpo = EsquemaConcluirBloco.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return json({ erro: corpo.error.issues[0]?.message ?? 'Requisição inválida.' }, 400);
    return json(await concluirBloco(userId, id, corpo.data));
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}
