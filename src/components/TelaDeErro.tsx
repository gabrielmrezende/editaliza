'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Marca } from './Marca';
import { botaoPrimario, botaoTexto } from './estilos';

/** Tela de erro inesperado (error.tsx): mensagem em português e "tentar de novo", sem detalhes técnicos. */
export function TelaDeErro({ error, retry, voltar }: { error: unknown; retry: () => void; voltar: { href: string; texto: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col bg-papel text-tinta">
      <header className="mx-auto w-full max-w-5xl px-4 py-5">
        <Marca />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-16 pt-8">
        <h1 className="text-3xl font-bold tracking-tight">Algo deu errado</h1>
        <p className="text-lg">
          Não conseguimos carregar esta página agora. Seus dados estão salvos; tente de novo em instantes.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => retry()} className={botaoPrimario}>
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
