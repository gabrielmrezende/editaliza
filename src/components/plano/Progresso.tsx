import { useId } from 'react';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { progresso } from '@/lib/plano/consultas';

const MAX_BOLHAS = 24;
const pct = (feitos: number, total: number) => (total === 0 ? 0 : Math.round((feitos / total) * 100));

/** % do edital concluído e, por matéria, uma fileira de bolhas (uma por tópico). */
export function Progresso({ disciplinas, concluidos }: { disciplinas: DisciplinaPlano[]; concluidos: Set<string> }) {
  const id = useId();
  const p = progresso(disciplinas, [...concluidos]);
  const geral = pct(p.concluidos, p.total);

  return (
    <section aria-labelledby={`${id}-titulo`} className="flex flex-col gap-5 rounded-xl border border-linha bg-folha p-5">
      <h2 id={`${id}-titulo`} className="text-2xl font-bold tracking-tight">
        Progresso
      </h2>
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2">
          <span className="text-5xl font-bold leading-none tracking-tight">{`${geral}%`}</span>
          <span className="text-tinta-suave">do edital</span>
        </p>
        <div
          role="progressbar"
          aria-label="Tópicos concluídos no edital"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={geral}
          className="h-3 overflow-hidden rounded-full bg-papel ring-1 ring-linha"
        >
          <div className="h-full rounded-full bg-marca transition-[width] duration-500" style={{ width: `${geral}%` }} />
        </div>
        <p className="text-sm text-tinta-suave">
          {p.concluidos} de {p.total} tópicos concluídos
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {disciplinas.map((d) => {
          const { total, concluidos: feitos } = p.porDisciplina[d.id];
          const extras = Math.max(0, d.topicos.length - MAX_BOLHAS);
          return (
            <li key={d.id} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-bold leading-snug">{d.nome}</span>
                <span className="shrink-0 text-sm text-tinta-suave">
                  {feitos}/{total}
                </span>
              </div>
              <div aria-hidden className="flex flex-wrap items-center gap-1">
                {d.topicos.slice(0, MAX_BOLHAS).map((t) => (
                  <span
                    key={t.id}
                    className={`h-2.5 w-4 rounded-full border-[1.5px] ${concluidos.has(t.id) ? 'border-caneta bg-caneta' : 'border-tinta-suave/60'}`}
                  />
                ))}
                {extras > 0 && <span className="text-xs text-tinta-suave">+{extras}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
