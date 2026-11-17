import { Suspense } from 'react';
import { Carregando } from '@/components/Carregando';
import { indicesDasMaterias } from '@/components/cores';
import { Agenda } from '@/components/revisoes/Agenda';
import { hojeEmSaoPaulo } from '@/lib/datas';
import { planoAtivoOuRedireciona, revisoesDoPlano } from '@/lib/acompanhamento/consultas';

async function Conteudo() {
  const plano = await planoAtivoOuRedireciona();
  const revisoes = await revisoesDoPlano(plano.id);
  // key: outro plano ("Novo plano") começa do zero, sem herdar o estado do plano antigo.
  return <Agenda key={plano.id} revisoes={revisoes} hoje={hojeEmSaoPaulo()} indices={indicesDasMaterias(plano.conteudo)} />;
}

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo />
    </Suspense>
  );
}
