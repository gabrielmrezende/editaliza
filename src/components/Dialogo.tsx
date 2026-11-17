'use client';

import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { botaoPrimario, botaoSecundario } from '@/components/estilos';

/** Diálogo modal (`<dialog>` nativo: foco preso, Esc fecha), aberto enquanto `aberto` for true. */
export function Dialogo({
  aberto,
  titulo,
  children,
  aoFechar,
  largo = false,
}: {
  aberto: boolean;
  titulo: string;
  children: ReactNode;
  aoFechar: () => void;
  /** Mais largo (formulários). */
  largo?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  // Layout effect: fecha antes de a página ser escondida (Activity) para não deixar o resto inerte.
  useLayoutEffect(() => {
    const dialogo = ref.current;
    if (!dialogo || !aberto) return;
    if (!dialogo.open) dialogo.showModal();
    return () => dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-titulo`}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      className={`m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-destaque border border-borda bg-superficie p-5 text-texto shadow-[0_24px_64px_-12px_rgba(9,13,39,0.45)] sm:p-6 ${
        largo ? 'max-w-2xl' : 'max-w-md'
      }`}
    >
      <h2 id={`${id}-titulo`} className="text-xl font-semibold tracking-tight">
        {titulo}
      </h2>
      {aberto && children}
    </dialog>
  );
}

/** Diálogo modal de confirmação (`<dialog>` nativo: foco preso, Esc cancela). */
export function Confirmacao({
  aberto,
  titulo,
  children,
  confirmar,
  cancelar,
  aoConfirmar,
  aoCancelar,
}: {
  aberto: boolean;
  titulo: string;
  children: ReactNode;
  confirmar: string;
  cancelar: string;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  return (
    <Dialogo aberto={aberto} titulo={titulo} aoFechar={aoCancelar}>
      <div className="mt-2 text-sm leading-relaxed text-texto-medio">{children}</div>
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" className={botaoSecundario} onClick={aoCancelar}>
          {cancelar}
        </button>
        <button type="button" className={botaoPrimario} onClick={aoConfirmar}>
          {confirmar}
        </button>
      </div>
    </Dialogo>
  );
}
