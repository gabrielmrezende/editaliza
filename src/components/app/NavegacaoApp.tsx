'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const SECOES = [
  { href: '/app/plano', rotulo: 'Plano' },
  { href: '/app/estudar', rotulo: 'Estudar' },
  { href: '/app/revisoes', rotulo: 'Revisões' },
  { href: '/app/historico', rotulo: 'Histórico' },
  { href: '/app/relatorio', rotulo: 'Relatório' },
];

/** Abas das seções: no desktop ficam no cabeçalho; abaixo de 640 px viram barra fixa embaixo. */
export function NavegacaoApp() {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Seções"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-linha bg-folha sm:static sm:border-0 sm:bg-transparent"
    >
      <ul className="mx-auto flex max-w-5xl sm:gap-1">
        {SECOES.map((s) => {
          const atual = caminho === s.href || caminho.startsWith(`${s.href}/`);
          return (
            <li key={s.href} className="flex-1 sm:flex-none">
              <Link
                href={s.href}
                aria-current={atual ? 'page' : undefined}
                className={`flex min-h-12 items-center justify-center rounded-md px-1 text-xs font-bold sm:min-h-11 sm:px-3 sm:text-sm ${
                  atual ? 'text-caneta underline decoration-2 underline-offset-8' : 'text-tinta-suave hover:text-tinta'
                }`}
              >
                {s.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
