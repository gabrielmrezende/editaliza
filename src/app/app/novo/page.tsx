import { Suspense } from 'react';
import Link from 'next/link';
import { Carregando } from '@/components/Carregando';
import { BotaoTema } from '@/components/tema/BotaoTema';
import { Marca } from '@/components/Marca';
import { FluxoNovo } from '@/components/onboarding/FluxoNovo';
import { exigirUsuario } from '@/lib/supabase/servidor';

/** A página confere o login por conta própria (o layout não é barreira de segurança). */
async function Conteudo() {
  await exigirUsuario();
  return <FluxoNovo />;
}

export default function PaginaNovo() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-borda bg-fundo/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-4 sm:px-5">
          <Link href="/app" className="inline-flex rounded-linha">
            <Marca />
          </Link>
          <BotaoTema />
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-6 sm:px-5 sm:pt-8">
        <Suspense fallback={<Carregando />}>
          <Conteudo />
        </Suspense>
      </main>
    </div>
  );
}
