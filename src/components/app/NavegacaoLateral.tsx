'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SECOES, indiceDaSecao } from './secoes';

const ALTURA_ITEM = 44;
const VAO = 4;

/** Seções no menu lateral (computador): a ativa em rust, com um indicador que desliza entre elas. */
export function NavegacaoLateral() {
  const atual = indiceDaSecao(usePathname());
  return (
    <nav aria-label="Seções" className="px-3 pt-5">
      <ul className="relative flex flex-col" style={{ gap: VAO }}>
        <span
          aria-hidden
          className={`indicador absolute inset-x-0 top-0 rounded-linha bg-rust shadow-[0_6px_16px_-6px_rgba(200,16,46,0.7)] ${atual < 0 ? 'opacity-0' : ''}`}
          style={{ height: ALTURA_ITEM, transform: `translateY(${Math.max(0, atual) * (ALTURA_ITEM + VAO)}px)` }}
        />
        {SECOES.map((s, i) => {
          const ativa = i === atual;
          const Icone = s.icone;
          return (
            <li key={s.href} className="relative">
              <Link
                href={s.href}
                aria-current={ativa ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-linha px-3 text-sm transition-colors ${
                  ativa ? 'font-semibold text-na-rust' : 'text-na-navy-suave hover:bg-white/8 hover:text-na-navy'
                }`}
                style={{ height: ALTURA_ITEM }}
              >
                <Icone aria-hidden className="size-[18px] shrink-0" strokeWidth={2.2} />
                {s.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
