import { EsquemaEntradaCriarPlano } from '@/lib/dominio/esquemas';
import { json, naoAutenticado, usuarioDaRequisicao } from '@/lib/editais/rota';
import { respostaDeErroPlano } from '@/lib/planos/rota';
import { criarPlano } from '@/lib/planos/servico';

/** Cria o plano (gerado no servidor) e o torna o único ativo do usuário. */
export async function POST(req: Request) {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    const corpo = EsquemaEntradaCriarPlano.safeParse(await req.json().catch(() => null));
    if (!corpo.success) {
      const mensagem = corpo.error.issues.find((i) => i.path[0] === 'disciplinas' && i.code === 'custom')?.message;
      return json({ erro: mensagem ?? 'Requisição inválida.' }, 400);
    }
    const planoId = await criarPlano(userId, corpo.data);
    return json({ planoId }, 201);
  } catch (erro) {
    return respostaDeErroPlano(erro);
  }
}
