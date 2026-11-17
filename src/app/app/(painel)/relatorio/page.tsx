import { Suspense } from 'react';
import { Carregando } from '@/components/Carregando';
import { indicesDasMaterias } from '@/components/cores';
import { PainelRelatorio } from '@/components/relatorio/PainelRelatorio';
import { planoAtivoOuRedireciona, revisoesDoPlano, sessoesDoPlano } from '@/lib/acompanhamento/consultas';
import { intervaloDoPeriodo, montarRelatorio, type Periodo } from '@/lib/acompanhamento/relatorio';
import { hojeEmSaoPaulo } from '@/lib/datas';
import type { MinutosPorDia } from '@/lib/dominio/tipos';

type Busca = Promise<Record<string, string | string[] | undefined>>;

const PERIODOS: readonly Periodo[] = ['semana', 'semana_passada', '30dias', 'plano'];

/** `periodo` da URL; ausente ou desconhecido vira 'semana'. */
function lerPeriodo(busca: Awaited<Busca>): Periodo {
  const v = Array.isArray(busca.periodo) ? busca.periodo[0] : busca.periodo;
  return PERIODOS.find((p) => p === v) ?? 'semana';
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodo(await searchParams);
  const plano = await planoAtivoOuRedireciona();
  // Só o plano ativo: sessões e revisões de planos antigos não entram no relatório.
  const [sessoes, revisoes] = await Promise.all([sessoesDoPlano(plano.id), revisoesDoPlano(plano.id)]);
  const hoje = hojeEmSaoPaulo();
  const relatorio = montarRelatorio({
    sessoes,
    revisoes,
    disciplinas: plano.conteudo,
    gerado: plano.gerado,
    minutosPorDia: plano.minutos_por_dia as MinutosPorDia,
    intervalo: intervaloDoPeriodo(periodo, hoje, hojeEmSaoPaulo(new Date(plano.created_at))),
    hoje,
  });
  return <PainelRelatorio relatorio={relatorio} periodo={periodo} indices={indicesDasMaterias(plano.conteudo)} />;
}

export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}
