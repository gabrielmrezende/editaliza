import { after } from 'next/server';
import { z } from 'zod';
import { receberEdital, processarCargos, lerEdital } from '@/lib/editais/servico';
import { json, naoAutenticado, respostaDeErro, usuarioDaRequisicao } from '@/lib/editais/rota';

export const maxDuration = 300;

const Corpo = z.object({ caminho: z.string().min(1).max(300) });

export async function POST(req: Request) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const corpo = Corpo.safeParse(await req.json().catch(() => null));
    if (!corpo.success) return json({ erro: 'Requisição inválida.' }, 400);

    const { editalId, novo } = await receberEdital(userId, corpo.data.caminho);
    if (novo) after(() => processarCargos(editalId));
    const edital = await lerEdital(editalId);
    return json({ editalId, status: edital?.status ?? 'processando' }, 202);
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
