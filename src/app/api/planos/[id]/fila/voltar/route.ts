import { respostaDeErroAcompanhamento } from '@/lib/acompanhamento/rota';
import { EsquemaVoltarBloco } from '@/lib/dominio/esquemas';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';
import { voltarBloco } from '@/lib/planos/fila-servico';

type Ctx = { params: Promise<{ id: string }> };

/** "Voltar um bloco": só recua a posição da fila. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const { id } = await params;
    const corpo = EsquemaVoltarBloco.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return json({ erro: corpo.error.issues[0]?.message ?? 'Requisição inválida.' }, 400);
    return json(await voltarBloco(userId, id, corpo.data));
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}
