import { Suspense } from 'react';
import { BotaoTema } from '@/components/tema/BotaoTema';
import { FormularioEntrar } from './formulario';

export default function PaginaEntrar() {
  return (
    <>
      <header className="flex justify-end px-4 py-3">
        <BotaoTema />
      </header>
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4">
        <h1 className="text-2xl font-semibold">Entrar no Editaliza</h1>
        <Suspense>
          <FormularioEntrar />
        </Suspense>
      </main>
    </>
  );
}
