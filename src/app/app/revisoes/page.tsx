import { Suspense } from 'react';
import { MolduraApp } from '@/components/app/MolduraApp';
import { Agenda } from '@/components/revisoes/Agenda';
import { hojeEmSaoPaulo } from '@/lib/datas';
import { planoAtivoOuRedireciona, revisoesDoPlano } from '@/lib/acompanhamento/consultas';

async function Conteudo() {
  const plano = await planoAtivoOuRedireciona();
  const revisoes = await revisoesDoPlano(plano.id);
  // key: outro plano ("Novo plano") começa do zero, sem herdar o estado do plano antigo.
  return <Agenda key={plano.id} revisoes={revisoes} hoje={hojeEmSaoPaulo()} />;
}

export default function Pagina() {
  return (
    <MolduraApp titulo="Revisões">
      <Suspense fallback={<p role="status">Carregando…</p>}>
        <Conteudo />
      </Suspense>
    </MolduraApp>
  );
}
