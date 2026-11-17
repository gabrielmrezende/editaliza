'use client';

import { useId } from 'react';
import { MINUTOS_POR_REVISAO, agruparAgenda } from '@/lib/acompanhamento/revisoes';
import type { Revisao } from '@/lib/dominio/acompanhamento';
import { alerta, listaLinhas } from '../estilos';
import { ItemRevisao } from '../revisoes/ItemRevisao';

/**
 * Revisões que vencem hoje e as atrasadas (atrasadas primeiro); não consomem os minutos do plano.
 * O estado (e a gravação) vem de um `useRevisoes` do Início, o mesmo do calendário.
 */
export function RevisoesHoje({
  revisoes,
  hoje,
  indices,
  erro,
  aoConcluir,
}: {
  /** As pendentes de hoje e atrasadas ao abrir a tela, no estado atual. */
  revisoes: Revisao[];
  hoje: string;
  indices: Map<string, number>;
  erro: string | null;
  aoConcluir: (id: string, concluida: boolean) => void;
}) {
  const id = useId();
  // Concluídas agora continuam na lista (marcadas) até recarregar, para poder desfazer.
  const vencidas = revisoes.filter((r) => r.dataRevisao <= hoje);
  const { atrasadas, hoje: doDia } = agruparAgenda(vencidas.filter((r) => !r.concluidaEm), hoje);
  const feitas = vencidas.filter((r) => r.concluidaEm);
  const itens = [...atrasadas, ...doDia, ...feitas];
  if (itens.length === 0) return null;
  const minutos = (atrasadas.length + doDia.length) * MINUTOS_POR_REVISAO;

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-titulo`} className="text-xl font-semibold tracking-tight">
          Revisões de hoje
        </h2>
        <p className="text-sm text-texto-suave">≈ {minutos} min de revisão</p>
      </div>
      {erro && (
        <p role="alert" className={alerta}>
          {erro}
        </p>
      )}
      <ul className={listaLinhas}>
        {itens.map((r) => (
          <ItemRevisao key={r.id} revisao={r} hoje={hoje} indiceMateria={indices.get(r.disciplinaId)} mostrarMateria aoConcluir={aoConcluir} />
        ))}
      </ul>
    </section>
  );
}
