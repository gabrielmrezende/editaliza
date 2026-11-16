import { Suspense } from 'react';
import Link from 'next/link';
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
    <div className="flex flex-1 flex-col bg-papel text-tinta">
      <header className="mx-auto flex w-full max-w-2xl items-center px-4 py-5">
        <Link href="/app" className="rounded-md">
          <Marca />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-16 pt-2">
        <Suspense fallback={<p role="status">Carregando…</p>}>
          <Conteudo />
        </Suspense>
      </main>
    </div>
  );
}
