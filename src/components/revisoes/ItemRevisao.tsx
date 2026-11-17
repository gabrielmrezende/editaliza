'use client';

import { Trash2 } from 'lucide-react';
import { diasDeAtraso } from '@/lib/acompanhamento/revisoes';
import { dataPorExtenso } from '@/lib/datas';
import type { Revisao } from '@/lib/dominio/acompanhamento';
import { estiloMateria } from '../cores';
import { Bolha } from '../plano/Bolha';

const diaMes = (iso: string) => dataPorExtenso(iso, { day: '2-digit', month: '2-digit' });

/** Quando a revisão acontece: "N dias de atraso", "Hoje" ou "dd/mm". */
function quando(r: Revisao, hoje: string): string {
  if (r.concluidaEm) return `Revisão de ${r.dataRevisao === hoje ? 'hoje' : diaMes(r.dataRevisao)}`;
  const atraso = diasDeAtraso(r, hoje);
  if (atraso > 0) return `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`;
  return r.dataRevisao === hoje ? 'Hoje' : diaMes(r.dataRevisao);
}

/** Uma revisão: bolha de concluir/desfazer, tópico, quando, e (opcional) excluir. */
export function ItemRevisao({
  revisao,
  hoje,
  indiceMateria,
  mostrarMateria = false,
  aoConcluir,
  aoExcluir,
}: {
  revisao: Revisao;
  hoje: string;
  /** Posição da matéria no plano ativo (cor da bolinha), se ela ainda estiver nele. */
  indiceMateria?: number;
  mostrarMateria?: boolean;
  aoConcluir: (id: string, concluida: boolean) => void;
  aoExcluir?: (revisao: Revisao) => void;
}) {
  const concluida = revisao.concluidaEm !== null;
  const atrasada = !concluida && diasDeAtraso(revisao, hoje) > 0;
  return (
    <li
      className="flex items-center gap-x-2 py-1.5 pl-2 pr-2 sm:pr-3"
      style={indiceMateria !== undefined ? estiloMateria(indiceMateria) : undefined}
    >
      <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2">
        <span className="grid size-11 shrink-0 place-items-center">
          <Bolha
            checked={concluida}
            aria-label={`${concluida ? 'Desfazer' : 'Concluir'} a revisão de ${revisao.topicoNome}`}
            onChange={(e) => aoConcluir(revisao.id, e.target.checked)}
          />
        </span>
        <span className="flex min-w-0 flex-col py-1">
          {mostrarMateria && (
            <span className="flex items-center gap-2 text-xs font-semibold text-texto-suave">
              <span aria-hidden className="bolinha" />
              {revisao.disciplinaNome}
            </span>
          )}
          <span className={`font-bold leading-snug break-words ${concluida ? 'text-texto-suave line-through decoration-2' : 'text-texto'}`}>
            {revisao.topicoNome}
          </span>
          <span className={`text-sm ${atrasada ? 'font-bold text-rust-texto' : 'text-texto-suave'}`}>
            {quando(revisao, hoje)}, {revisao.intervalo} {revisao.intervalo === 1 ? 'dia' : 'dias'} após o estudo
          </span>
        </span>
      </label>
      {aoExcluir && (
        <button
          type="button"
          className="grid size-11 shrink-0 place-items-center rounded-linha text-texto-suave transition-colors hover:bg-rust-claro hover:text-rust-texto"
          aria-label={`Excluir a revisão de ${revisao.topicoNome}`}
          title="Excluir"
          onClick={() => aoExcluir(revisao)}
        >
          <Trash2 aria-hidden className="size-[18px]" />
        </button>
      )}
    </li>
  );
}
