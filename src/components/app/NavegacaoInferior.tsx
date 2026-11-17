'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECOES, indiceDaSecao } from './secoes';

/** Barra inferior fixa (celular e tablet): ícone + nome, com um indicador que desliza até a seção ativa. */
export function NavegacaoInferior() {
  const atual = indiceDaSecao(usePathname());
  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-superficie/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul
        className="relative mx-auto grid max-w-xl px-1.5 py-1.5"
        style={{ gridTemplateColumns: `repeat(${SECOES.length}, minmax(0, 1fr))` }}
      >
        <span
          aria-hidden
          className={`indicador pointer-events-none absolute inset-y-1.5 left-1.5 px-0.5 ${atual < 0 ? 'opacity-0' : ''}`}
          style={{ width: `calc((100% - 0.75rem) / ${SECOES.length})`, transform: `translateX(${Math.max(0, atual) * 100}%)` }}
        >
          <span className="block h-full rounded-linha bg-suave" />
        </span>
        {SECOES.map((s, i) => {
          const ativa = i === atual;
          const Icone = s.icone;
          return (
            <li key={s.href} className="relative">
              <Link
                href={s.href}
                aria-current={ativa ? 'page' : undefined}
                className={`flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-linha text-[13px] leading-tight transition-colors ${
                  ativa ? 'font-semibold text-texto' : 'text-texto-suave hover:text-texto'
                }`}
              >
                <Icone aria-hidden className="size-5" strokeWidth={ativa ? 2.4 : 2} />
                {s.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
