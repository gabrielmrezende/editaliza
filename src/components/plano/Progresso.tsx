import { useId } from 'react';
import type { DisciplinaPlano } from '@/lib/dominio/tipos';
import { progresso } from '@/lib/plano/consultas';
import { estiloMateria } from '../cores';
import { cartao } from '../estilos';

const pct = (feitos: number, total: number) => (total === 0 ? 0 : Math.round((feitos / total) * 100));

/** % do edital concluído e, por matéria, uma barra fina na cor da matéria. */
export function Progresso({ disciplinas, concluidos }: { disciplinas: DisciplinaPlano[]; concluidos: Set<string> }) {
  const id = useId();
  const p = progresso(disciplinas, [...concluidos]);
  const geral = pct(p.concluidos, p.total);

  return (
    <section aria-labelledby={`${id}-titulo`} className={`${cartao} flex flex-col gap-5 p-5`}>
      <h2 id={`${id}-titulo`} className="text-lg font-extrabold tracking-tight">
        Progresso
      </h2>
      <div className="flex flex-col gap-2.5">
        <p className="flex items-baseline gap-2">
          <span className="text-5xl font-extrabold leading-none tracking-tight">{`${geral}%`}</span>
          <span className="text-sm font-medium text-texto-suave">do edital</span>
        </p>
        <div
          role="progressbar"
          aria-label="Tópicos concluídos no edital"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={geral}
          className="h-2.5 overflow-hidden rounded-full bg-superficie-alt ring-1 ring-borda ring-inset"
        >
          <div className="barra h-full rounded-full bg-mint-forte" style={{ width: `${geral}%` }} />
        </div>
        <p className="text-sm text-texto-suave">
          {p.concluidos} de {p.total} tópicos concluídos
        </p>
      </div>

      <ul className="flex flex-col gap-3.5 border-t border-borda pt-4">
        {disciplinas.map((d, i) => {
          const { total, concluidos: feitos } = p.porDisciplina[d.id];
          return (
            <li key={d.id} className="flex flex-col gap-1.5" style={estiloMateria(i)}>
              <div className="flex items-center gap-2.5">
                <span aria-hidden className="bolinha" />
                <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{d.nome}</span>
                <span className="shrink-0 text-xs font-semibold text-texto-suave">
                  {feitos}/{total}
                </span>
              </div>
              <div aria-hidden className="ml-5 h-1.5 overflow-hidden rounded-full bg-superficie-alt ring-1 ring-borda ring-inset">
                <div
                  className="barra h-full rounded-full bg-[var(--cor-materia)] shadow-[inset_0_0_0_1px_var(--anel-bolinha)]"
                  style={{ width: `${pct(feitos, total)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
