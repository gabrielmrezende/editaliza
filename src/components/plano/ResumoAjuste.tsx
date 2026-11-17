'use client';

import { useId, useLayoutEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Confirmacao } from '@/components/Dialogo';
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
  confirmarAjuste,
  aoAnunciar,
}: {
  planoId: string;
  ajuste: AjusteNaoVisto | null;
  /** Dia (aaaa-mm-dd, São Paulo) do último ajuste; null se o plano nunca foi ajustado. */
  ultimoAjuste: string | null;
  /** Prazo: o ajuste pode refazer a fila, então "Ajustar agora" pede confirmação antes. */
  confirmarAjuste: boolean;
  /** Anuncia no `role="status"` da página. */
  aoAnunciar: (texto: string) => void;
}) {
  const id = useId();
  const router = useRouter();
  const [fechado, setFechado] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  // Página escondida pela Activity: a confirmação não reabre sozinha quando o aluno voltar.
  useLayoutEffect(() => () => setConfirmando(false), []);

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
          className="flex flex-col gap-3 rounded-cartao border border-borda border-l-4 border-l-mint-forte bg-superficie p-4 shadow-cartao sm:p-5"
        >
          <h2 id={`${id}-titulo`} className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Sparkles aria-hidden className="size-[18px] text-texto-suave" />
            Seu plano foi ajustado
          </h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-texto-medio marker:text-mint-forte">
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
      <div className="flex items-center gap-x-2 rounded-linha border border-borda bg-superficie-alt py-0.5 pl-3 pr-1 text-sm">
        <RefreshCw aria-hidden className={`size-4 shrink-0 text-texto-suave ${ajustando ? 'animate-spin' : ''}`} />
        {ultimoAjuste ? (
          <p className="min-w-0 flex-1 py-2 leading-snug text-texto-suave">Último ajuste em {dataCurta(ultimoAjuste)}.</p>
        ) : (
          <p className="min-w-0 flex-1 py-2 leading-snug text-texto-suave">O plano se ajusta toda semana ao que você estudou.</p>
        )}
        <button
          type="button"
          className={`${botaoTexto} shrink-0`}
          disabled={ajustando}
          onClick={() => (confirmarAjuste ? setConfirmando(true) : void ajustar())}
        >
          {ajustando ? 'Ajustando…' : 'Ajustar agora'}
        </button>
      </div>
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <Confirmacao
        aberto={confirmando}
        titulo="Ajustar o plano agora?"
        confirmar="Ajustar"
        cancelar="Cancelar"
        aoConfirmar={() => {
          setConfirmando(false);
          void ajustar();
        }}
        aoCancelar={() => setConfirmando(false)}
      >
        A fila recomeça com o que falta estudar.
      </Confirmacao>
    </div>
  );
}
