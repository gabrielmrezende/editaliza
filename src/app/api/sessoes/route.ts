import { respostaDeErroAcompanhamento } from '@/lib/acompanhamento/rota';
import { registrarSessao } from '@/lib/acompanhamento/servico';
import { EsquemaNovaSessao } from '@/lib/dominio/esquemas';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';

/** Registra uma sessão de estudo (e as revisões marcadas). */
export async function POST(req: Request) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const corpo = EsquemaNovaSessao.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return json({ erro: corpo.error.issues[0]?.message ?? 'Requisição inválida.' }, 400);
    return json(await registrarSessao(userId, corpo.data), 201);
  } catch (erro) {
    return respostaDeErroAcompanhamento(erro);
  }
}
