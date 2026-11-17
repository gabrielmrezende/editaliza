import { Suspense } from 'react';
import { MolduraApp } from '@/components/app/MolduraApp';
import { Cronometro, type PedidoInicio } from '@/components/estudo/Cronometro';
import { RegistroManual } from '@/components/estudo/FormularioSessao';
import { RegistroRapido } from '@/components/estudo/RegistroRapido';
import { planoAtivoOuRedireciona } from '@/lib/acompanhamento/consultas';
import { hojeEmSaoPaulo } from '@/lib/datas';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { exigirUsuario } from '@/lib/supabase/servidor';

type Busca = Promise<Record<string, string | string[] | undefined>>;

const primeiro = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `?disciplina=<id>&topico=<id>&iniciar=1` → pedido de início, se a matéria/tópico existem no plano. */
function lerPedido(busca: Awaited<Busca>, disciplinas: DisciplinaPlano[]): PedidoInicio | null {
  if (primeiro(busca.iniciar) !== '1') return null;
  const disciplina = disciplinas.find((d) => d.id === primeiro(busca.disciplina));
  if (!disciplina) return null;
  const topico = disciplina.topicos.find((t) => t.id === primeiro(busca.topico));
  return { disciplinaId: disciplina.id, topicoId: topico?.id ?? null };
}

async function Conteudo({ searchParams }: { searchParams: Busca }) {
  const [plano, usuario, busca] = await Promise.all([planoAtivoOuRedireciona(), exigirUsuario(), searchParams]);
  const hoje = hojeEmSaoPaulo();
  const disciplinas = plano.conteudo;
  return (
    <div className="flex flex-col gap-6">
      <Cronometro
        userId={usuario.id}
        planoId={plano.id}
        hoje={hoje}
        disciplinas={disciplinas}
        pedido={lerPedido(busca, disciplinas)}
      />
      <RegistroManual planoId={plano.id} disciplinas={disciplinas} hoje={hoje} />
      <RegistroRapido userId={usuario.id} planoId={plano.id} hoje={hoje} disciplinas={disciplinas} />
    </div>
  );
}

export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <MolduraApp titulo="Estudar">
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </MolduraApp>
  );
}
