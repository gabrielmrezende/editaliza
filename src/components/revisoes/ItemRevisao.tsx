'use client';

import { diasDeAtraso } from '@/lib/acompanhamento/revisoes';
import { dataPorExtenso } from '@/lib/datas';
import type { Revisao } from '@/lib/dominio/acompanhamento';
import { botaoTexto } from '../estilos';
import { Bolha } from '../plano/Bolha';

export const diaMes = (iso: string) => dataPorExtenso(iso, { day: '2-digit', month: '2-digit' });

/** Quando a revisão acontece: "N dias de atraso", "Hoje" ou "dd/mm". */
export function quando(r: Revisao, hoje: string): string {
  if (r.concluidaEm) return `Revisão de ${r.dataRevisao === hoje ? 'hoje' : diaMes(r.dataRevisao)}`;
  const atraso = diasDeAtraso(r, hoje);
  if (atraso > 0) return `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`;
  return r.dataRevisao === hoje ? 'Hoje' : diaMes(r.dataRevisao);
}

/** Uma revisão: bolha de concluir/desfazer, tópico, quando, e (opcional) excluir. */
export function ItemRevisao({
  revisao,
  hoje,
  mostrarMateria = false,
  aoConcluir,
  aoExcluir,
}: {
  revisao: Revisao;
  hoje: string;
  mostrarMateria?: boolean;
  aoConcluir: (id: string, concluida: boolean) => void;
  aoExcluir?: (revisao: Revisao) => void;
}) {
  const concluida = revisao.concluidaEm !== null;
  const atrasada = !concluida && diasDeAtraso(revisao, hoje) > 0;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4">
      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
        <Bolha
          checked={concluida}
          aria-label={`${concluida ? 'Desfazer' : 'Concluir'} a revisão de ${revisao.topicoNome}`}
          onChange={(e) => aoConcluir(revisao.id, e.target.checked)}
        />
        <span className="flex min-w-0 flex-col">
          {mostrarMateria && <span className="text-sm font-bold text-caneta">{revisao.disciplinaNome}</span>}
          <span className={`font-bold leading-snug ${concluida ? 'text-tinta-suave line-through decoration-2' : ''}`}>
            {revisao.topicoNome}
          </span>
          <span className={`text-sm ${atrasada ? 'font-bold text-erro' : 'text-tinta-suave'}`}>
            {quando(revisao, hoje)} · {revisao.intervalo} {revisao.intervalo === 1 ? 'dia' : 'dias'} após o estudo
          </span>
        </span>
      </label>
      {aoExcluir && (
        <button
          type="button"
          className={botaoTexto}
          aria-label={`Excluir a revisão de ${revisao.topicoNome}`}
          onClick={() => aoExcluir(revisao)}
        >
          Excluir
        </button>
      )}
    </li>
  );
}
