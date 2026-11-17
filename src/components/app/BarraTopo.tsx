'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { botaoPrimario } from '@/components/estilos';
import { BotaoTema } from '@/components/tema/BotaoTema';
import { SECOES, indiceDaSecao } from './secoes';

/** Topo do conteúdo: título da seção, tema e "Novo plano" (no celular, só o ícone). */
export function BarraTopo() {
  const secao = SECOES[indiceDaSecao(usePathname())];
  return (
    <header className="sticky top-0 z-20 border-b border-borda bg-fundo/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/app/plano" aria-label="Editaliza, ir para o plano" className="grid size-11 place-items-center rounded-linha lg:hidden">
          <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-rust">
            <span className="block h-2.5 w-4 rounded-full bg-white" />
          </span>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold tracking-tight lg:text-[1.375rem]">
          {secao?.rotulo ?? 'Editaliza'}
        </h1>
        <BotaoTema />
        <Link href="/app/novo" className={`${botaoPrimario} max-sm:size-11 max-sm:px-0`}>
          <Plus aria-hidden className="size-[18px]" strokeWidth={2.4} />
          <span className="max-sm:sr-only">Novo plano</span>
        </Link>
      </div>
    </header>
  );
}
