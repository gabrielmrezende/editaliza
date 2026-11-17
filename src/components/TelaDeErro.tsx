'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Marca } from './Marca';
import { botaoPrimario, botaoTexto } from './estilos';

/** Tela de erro inesperado (error.tsx): mensagem em português e "tentar de novo", sem detalhes técnicos. */
export function TelaDeErro({ error, retry, voltar }: { error: unknown; retry: () => void; voltar: { href: string; texto: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Marca />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-5 pb-24">
        <p aria-hidden className="grid size-12 place-items-center rounded-cartao bg-rust-claro text-rust-texto">
          <TriangleAlert className="size-6" />
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Algo deu errado</h1>
        <p className="text-lg text-texto-medio">
          Não conseguimos carregar esta página agora. Seus dados estão salvos; tente de novo em instantes.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => retry()} className={`${botaoPrimario} min-h-12`}>
            Tentar de novo
          </button>
          <Link href={voltar.href} className={botaoTexto}>
            {voltar.texto}
          </Link>
        </div>
      </main>
    </div>
  );
}
