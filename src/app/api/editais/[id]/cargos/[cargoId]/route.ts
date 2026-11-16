import { after } from 'next/server';
import { iniciarConteudo, lerCargo, processarConteudo } from '@/lib/editais/servico';
import { exigirAcessoAoEdital, idValido, json, naoEncontrado, respostaDeErro } from '@/lib/editais/rota';

export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; cargoId: string }> };

/** Cargo precisa existir e pertencer ao edital da URL (senão 404). */
async function carregar(id: string, cargoId: string) {
  const acesso = await exigirAcessoAoEdital(id);
  if ('resposta' in acesso) return { resposta: acesso.resposta };
  const cargo = idValido(cargoId) ? await lerCargo(cargoId) : null;
  if (!cargo || cargo.editalId !== id) return { resposta: naoEncontrado() };
  return { cargo };
}

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id, cargoId } = await params;
    const r = await carregar(id, cargoId);
    if ('resposta' in r) return r.resposta;
    const { statusConteudo, erro, conteudo } = r.cargo;
    return json({ statusConteudo, erro, conteudo });
  } catch (erro) {
    return respostaDeErro(erro);
  }
}

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id, cargoId } = await params;
    const r = await carregar(id, cargoId);
    if ('resposta' in r) return r.resposta;
    if (r.cargo.statusConteudo === 'pronto') return json({ statusConteudo: 'pronto' }, 200);
    if (await iniciarConteudo(cargoId)) {
      after(() => processarConteudo(cargoId));
    }
    return json({ statusConteudo: 'processando' }, 202);
  } catch (erro) {
    return respostaDeErro(erro);
  }
}
