import { lerEdital } from '@/lib/editais/servico';
import { exigirAcessoAoEdital, naoEncontrado, json, respostaDeErro } from '@/lib/editais/rota';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acesso = await exigirAcessoAoEdital(id);
    if ('resposta' in acesso) return acesso.resposta;
    const edital = await lerEdital(id);
    return edital ? json(edital) : naoEncontrado();
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
