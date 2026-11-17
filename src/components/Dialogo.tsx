'use client';

import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { botaoPrimario, botaoSecundario } from '@/components/estilos';

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
        aoCancelar();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-linha bg-folha p-5 text-tinta backdrop:bg-black/50"
    >
      <h2 id={`${id}-titulo`} className="text-xl font-bold">
        {titulo}
      </h2>
      <div className="mt-2 text-tinta-suave">{children}</div>
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" className={botaoSecundario} onClick={aoCancelar}>
          {cancelar}
        </button>
        <button type="button" className={botaoPrimario} onClick={aoConfirmar}>
          {confirmar}
        </button>
      </div>
    </dialog>
  );
}
