import { Suspense } from 'react';
import { PainelMarca } from '@/components/PainelMarca';
import { BotaoTema } from '@/components/tema/BotaoTema';
import { FormularioEntrar } from './formulario';

export default function PaginaEntrar() {
  return (
    <div className="relative flex flex-1 flex-col lg:flex-row">
      <div className="absolute right-4 top-4 z-10 sm:right-6">
        <BotaoTema />
      </div>
      <PainelMarca />
      <main className="flex flex-1 flex-col px-5 py-10 sm:px-8 lg:justify-center">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Entrar no Editaliza</h1>
            <p className="text-texto-suave">Receba um link de acesso no seu e-mail. Não precisa de senha.</p>
          </div>
          <Suspense>
            <FormularioEntrar />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
