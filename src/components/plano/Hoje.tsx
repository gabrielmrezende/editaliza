'use client';

import { useId } from 'react';
import { dataPorExtenso } from '@/lib/datas';
import type { BlocoEstudo, Topico } from '@/lib/dominio/tipos';
import { Bolha } from './Bolha';
import { formatarMinutos } from './formatar';

export type ItemHoje = {
  chave: string;
  tipo: BlocoEstudo['tipo'];
  disciplina: string;
  topico: Topico | null;
  minutos: number;
  concluido: boolean;
};

const TITULO_TIPO: Record<BlocoEstudo['tipo'], string | null> = {
  estudo: null,
  revisao_geral: 'Revisão geral',
  simulado: 'Simulado',
};

/** Blocos de hoje, cada um com a bolha "concluí este tópico". */
export function Hoje({
  data,
  itens,
  semTempo,
  aoMarcar,
}: {
  data: string;
  itens: ItemHoje[];
  semTempo: boolean;
  aoMarcar: (topicoId: string, feito: boolean) => void;
}) {
  const id = useId();
  const total = itens.reduce((s, i) => s + i.minutos, 0);

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={`${id}-titulo`} className="text-2xl font-bold tracking-tight">
          Hoje
        </h2>
        <p className="text-tinta-suave">
          <span className="inline-block first-letter:uppercase">{dataPorExtenso(data, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          {total > 0 && `, ${formatarMinutos(total)} de estudo`}
        </p>
      </div>

      {itens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-linha bg-folha px-5 py-6">
          <strong>Dia livre.</strong>{' '}
          {semTempo
            ? 'Você não marcou horas de estudo na semana. Crie um novo plano com seus horários.'
            : 'Não há estudo marcado para hoje. Descanse ou adiante uma revisão.'}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-linha rounded-xl border border-linha bg-folha">
          {itens.map((item) => {
            const idTopico = `${id}-${item.chave}`;
            const titulo = TITULO_TIPO[item.tipo];
            return (
              <li key={item.chave} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm font-bold text-caneta">{item.disciplina}</p>
                  <p id={idTopico} className={`text-lg font-bold leading-snug ${item.concluido ? 'text-tinta-suave line-through decoration-2' : ''}`}>
                    {titulo ?? item.topico?.nome ?? 'Todos os tópicos concluídos: revise a matéria'}
                  </p>
                  <p className="text-sm text-tinta-suave">{formatarMinutos(item.minutos)}</p>
                </div>
                {item.tipo === 'estudo' && item.topico && (
                  <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-3 rounded-lg px-1 text-sm font-bold">
                    <Bolha
                      checked={item.concluido}
                      aria-describedby={idTopico}
                      onChange={(e) => aoMarcar(item.topico!.id, e.target.checked)}
                    />
                    Concluí este tópico
                  </label>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
