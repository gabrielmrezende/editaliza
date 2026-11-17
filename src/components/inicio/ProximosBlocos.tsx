'use client';

import { useId } from 'react';
import { estiloMateria } from '@/components/cores';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { formatarMinutos } from '@/lib/formatar';
import { QUANTIDADE_PROXIMOS, numeracao, proximosBlocos, type Fila } from '@/lib/plano/fila';
import { tituloDoBloco } from './CartaoProximoBloco';

/**
 * Os próximos blocos da fila, numerados pela ordem real. No prazo cada um mostra o tópico; no ciclo
 * só a matéria e os minutos (o tópico do ciclo é decidido quando o bloco chega).
 */
export function ProximosBlocos({
  fila,
  posicao,
  disciplinas,
  indices,
}: {
  fila: Fila;
  posicao: number;
  disciplinas: DisciplinaPlano[];
  indices: Map<string, number>;
}) {
  const id = useId();
  const blocos = proximosBlocos(fila, posicao, QUANTIDADE_PROXIMOS);
  if (blocos.length === 0) return null;
  const porId = new Map(disciplinas.map((d) => [d.id, d]));

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex min-w-0 flex-col gap-3">
      <h2 id={`${id}-titulo`} className="text-xl font-semibold tracking-tight">
        Próximos blocos
      </h2>
      <ol
        aria-label="Próximos blocos"
        className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:max-[1099px]:grid-cols-3"
      >
        {blocos.map((b) => {
          const disciplina = porId.get(b.disciplinaId);
          const indice = indices.get(b.disciplinaId) ?? -1;
          return (
            // key = posição: ao concluir, a grade anda uma posição e só o último bloco entra.
            <li
              key={b.posicao}
              className="bloco-entrada flex min-w-0 flex-col gap-1 rounded-linha border border-borda bg-superficie px-3.5 py-3"
              style={indice >= 0 ? estiloMateria(indice) : undefined}
            >
              <p className="flex items-center gap-2 text-sm text-texto-suave">
                <span className="tabular-nums text-texto-medio">{numeracao(fila, b.posicao).numero}</span>
                {indice >= 0 && <span aria-hidden className="bolinha" />}
                {/* No ciclo a matéria é o conteúdo do bloco: vai na cor do texto. */}
                <span className={`min-w-0 flex-1 truncate ${fila.modo === 'ciclo' ? 'text-texto' : ''}`}>
                  {disciplina?.nome ?? 'Matéria'}
                </span>
                <span className="shrink-0 tabular-nums">{formatarMinutos(b.minutos)}</span>
              </p>
              {fila.modo === 'prazo' && (
                <p data-topico className="line-clamp-2 leading-snug break-words text-texto">
                  {tituloDoBloco(b, disciplina, b.topicoId, disciplina?.nome ?? 'Matéria')}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
