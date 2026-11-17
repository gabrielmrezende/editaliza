'use client';

import { useSyncExternalStore } from 'react';
import { CHAVE_TEMA } from './scriptTema';

type Tema = 'light' | 'dark';

function assinar(aviso: () => void) {
  const observador = new MutationObserver(aviso);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observador.disconnect();
}

const temaAtual = (): Tema =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

// No servidor (e na hidratação) o tema é desconhecido: o botão sai com o rótulo claro e corrige em seguida.
const temaNoServidor = (): Tema => 'light';

/** Alterna entre tema claro e escuro e guarda a escolha. O script de pré-pintura aplica o tema inicial. */
export function BotaoTema() {
  const tema = useSyncExternalStore(assinar, temaAtual, temaNoServidor);
  const escuro = tema === 'dark';

  function alternar() {
    const proximo: Tema = escuro ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', proximo);
    try {
      localStorage.setItem(CHAVE_TEMA, proximo);
    } catch {
      // Sem armazenamento (modo privado etc.): vale só nesta visita.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={escuro ? 'Usar tema claro' : 'Usar tema escuro'}
      className="inline-flex size-11 items-center justify-center rounded-lg border border-linha bg-folha text-tinta transition-colors hover:border-tinta-suave"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {escuro ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
