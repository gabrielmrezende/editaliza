import { after } from 'next/server';
import { lerEdital, processarCargos, reiniciarEdital } from '@/lib/editais/servico';
import { exigirAcessoAoEdital, json, respostaDeErro } from '@/lib/editais/rota';

export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const acesso = await exigirAcessoAoEdital(id);
    if ('resposta' in acesso) return acesso.resposta;
    // Estado "processando há muito tempo" é gravado como erro pelo GET.
    await lerEdital(id);
    if (await reiniciarEdital(acesso.userId, id)) {
      after(() => processarCargos(id));
    }
    const edital = await lerEdital(id);
    return json({ editalId: id, status: edital?.status ?? 'processando' }, 202);
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
