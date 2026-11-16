import { criarUrlEnvio } from '@/lib/editais/servico';
import { json, naoAutenticado, respostaDeErro, usuarioDaRequisicao } from '@/lib/editais/rota';

export async function POST() {
  try {
    const userId = await usuarioDaRequisicao();
    if (!userId) return naoAutenticado();
    return json(await criarUrlEnvio(userId));
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
