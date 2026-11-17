'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pedir } from '@/components/onboarding/api';
import { dataPorExtenso } from '@/lib/datas';
import type { ItemResumo } from '@/lib/plano/ajuste';
import { textoDoResumo } from '@/lib/plano/resumo';
import { alerta, botaoSecundario, botaoTexto } from '../estilos';

/** Ajuste cujo resumo o aluno ainda não fechou. */
export interface AjusteNaoVisto {
  id: string;
  resumo: ItemResumo[];
}

const dataCurta = (iso: string) => dataPorExtenso(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Topo do plano: o resumo do último ajuste semanal (até o aluno fechar), a data do último ajuste e
 * o botão "Ajustar agora" (no máximo 1 por hora; o servidor explica quando volta).
 */
export function ResumoAjuste({
  planoId,
  ajuste,
  ultimoAjuste,
  aoAnunciar,
}: {
  planoId: string;
  ajuste: AjusteNaoVisto | null;
  /** Dia (aaaa-mm-dd, São Paulo) do último ajuste; null se o plano nunca foi ajustado. */
  ultimoAjuste: string | null;
  /** Anuncia no `role="status"` da página. */
  aoAnunciar: (texto: string) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [fechado, setFechado] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const visivel = ajuste !== null && ajuste.id !== fechado;

  async function fechar(ajusteId: string) {
    setFechado(ajusteId);
    setErro(null);
    const r = await pedir<null>(`/api/planos/${encodeURIComponent(planoId)}/ajustes/${encodeURIComponent(ajusteId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ visto: true }),
    });
    if (!r.ok) {
      setFechado(null);
      setErro(r.erro);
    }
  }

  async function ajustar() {
    if (ajustando) return;
    setAjustando(true);
    setErro(null);
    aoAnunciar('');
    const r = await pedir<{ ajusteId: string }>(`/api/planos/${encodeURIComponent(planoId)}/ajustar`, { method: 'POST' });
    setAjustando(false);
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    aoAnunciar('Plano ajustado.');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {visivel && (
        <section
          aria-labelledby={`${id}-titulo`}
          className="flex flex-col gap-3 rounded-xl border border-caneta bg-caneta-clara p-4 sm:p-5"
        >
          <h2 id={`${id}-titulo`} className="text-xl font-bold tracking-tight">
            Seu plano foi ajustado
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {ajuste.resumo.map((item, i) => (
              <li key={i}>{textoDoResumo(item)}</li>
            ))}
          </ul>
          <div>
            <button type="button" className={botaoSecundario} onClick={() => fechar(ajuste.id)}>
              Fechar
            </button>
          </div>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ultimoAjuste && <p className="text-tinta-suave">Último ajuste em {dataCurta(ultimoAjuste)}.</p>}
        <button type="button" className={botaoTexto} disabled={ajustando} onClick={ajustar}>
          {ajustando ? 'Ajustando…' : 'Ajustar agora'}
        </button>
      </div>
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
    </div>
  );
}
