import Link from 'next/link';
import { Marca } from '@/components/Marca';
import { BotaoTema } from '@/components/tema/BotaoTema';
import { botaoTexto } from '@/components/estilos';
import { NavegacaoApp } from './NavegacaoApp';

/** Moldura da área logada: cabeçalho (marca, seções, tema, novo plano) e o conteúdo da página. */
export function MolduraApp({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-papel text-tinta">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
        <Marca />
        <div className="order-2 flex items-center gap-2 sm:order-3">
          <Link href="/app/novo" className={botaoTexto}>
            Novo plano
          </Link>
          <BotaoTema />
        </div>
        <NavegacaoApp />
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 sm:pb-16">
        {titulo ? <h1 className="mb-4 text-3xl font-bold leading-tight tracking-tight">{titulo}</h1> : null}
        {children}
      </main>
    </div>
  );
}
