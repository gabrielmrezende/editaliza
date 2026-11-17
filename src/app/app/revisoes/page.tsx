import { Suspense } from 'react';
import { MolduraApp } from '@/components/app/MolduraApp';
import { planoAtivoOuRedireciona } from '@/lib/acompanhamento/consultas';

async function Conteudo() {
  await planoAtivoOuRedireciona();
  return <p role="status">Carregando…</p>;
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
