'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
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
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-linha border border-borda bg-superficie text-texto-medio transition-colors hover:border-texto-suave hover:text-texto"
    >
      {escuro ? <Sun aria-hidden className="size-[18px]" /> : <Moon aria-hidden className="size-[18px]" />}
    </button>
  );
}
